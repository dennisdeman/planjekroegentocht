import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { createPaymentWithId, findCouponByCode, validateCoupon, incrementCouponUsage, findOrganizationById, updateOrgBilling, logActivity } from "@lib/server/db";
import { mollieClient, PLAN_PRICES } from "@lib/server/mollie";
import { checkRateLimit, getClientIp } from "@lib/server/rate-limit";
import { getPlanLimits } from "@lib/server/plan-limits";

export async function POST(request: Request) {
  const rl = checkRateLimit(getClientIp(request), { prefix: "payment", maxRequests: 5, windowSeconds: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Te veel verzoeken. Probeer het later opnieuw." }, { status: 429 });
  }

  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  if (!mollieClient) {
    return NextResponse.json({ error: "Betalingen zijn niet beschikbaar." }, { status: 503 });
  }

  const body = await request.json();
  const plan = body.plan as string;
  const couponCode = body.couponCode as string | undefined;
  const billingInfo = body.billing as { type?: string; companyName?: string; address?: string; postalCode?: string; city?: string; vatNumber?: string } | undefined;

  if (!plan || !PLAN_PRICES[plan]) {
    return NextResponse.json({ error: "Ongeldig plan." }, { status: 400 });
  }

  const priceInfo = PLAN_PRICES[plan];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const paymentId = randomUUID();

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  // Downgrade-beveiliging voor Pro Event
  if (plan === "pro_event") {
    const org = await findOrganizationById(client, schema, authResult.session.orgId);
    // Actief Pro Jaar blokkeert downgrade tot einde looptijd
    if (org && org.active_plan === "pro_year" && org.plan_expires_at && new Date(org.plan_expires_at) > new Date()) {
      return NextResponse.json({ error: "Je hebt een actief Pro Jaar-abonnement. Pro Event kan pas worden aangeschaft na afloop." }, { status: 400 });
    }
    // Ook na afloop: als huidige data de Pro Event-limieten overschrijdt, geen downgrade toestaan
    const proEventLimits = getPlanLimits("pro_event");
    const [planCountRes, memberCountRes] = await Promise.all([
      client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.planner_plans WHERE org_id = $1;`, [authResult.session.orgId]),
      client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM ${schema}.memberships WHERE org_id = $1;`, [authResult.session.orgId]),
    ]);
    const planCount = parseInt(planCountRes.rows[0]?.count ?? "0", 10);
    const memberCount = parseInt(memberCountRes.rows[0]?.count ?? "0", 10);
    if (planCount > proEventLimits.maxActivePlannings) {
      return NextResponse.json({
        error: `Je hebt ${planCount} opgeslagen planningen. Pro Event ondersteunt er maximaal ${proEventLimits.maxActivePlannings}. Verwijder eerst planningen of kies Pro Jaar.`,
      }, { status: 400 });
    }
    if (memberCount > proEventLimits.maxTeamMembers) {
      return NextResponse.json({
        error: `Je hebt ${memberCount} teamleden. Pro Event ondersteunt er maximaal ${proEventLimits.maxTeamMembers}. Verwijder eerst teamleden of kies Pro Jaar.`,
      }, { status: 400 });
    }
  }

  // Verrekening: Pro Event → Pro Jaar upgrade
  let upgradeCredit = 0;
  if (plan === "pro_year") {
    const org = await findOrganizationById(client, schema, authResult.session.orgId);
    if (org && org.active_plan === "pro_event" && org.plan_expires_at) {
      const now = new Date();
      const expiresAt = new Date(org.plan_expires_at);
      const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      if (remainingDays > 0) {
        // Pro rata restwaarde van Pro Event (€9,95 voor 30 dagen)
        const proEventCents = Math.round(parseFloat(PLAN_PRICES.pro_event.amount) * 100);
        upgradeCredit = Math.round((remainingDays / PLAN_PRICES.pro_event.days) * proEventCents);
      }
    }
  }

  // Coupon valideren (indien opgegeven)
  let couponId: string | null = null;
  let finalAmountCents = Math.round(parseFloat(priceInfo.amount) * 100) - upgradeCredit;

  if (couponCode?.trim()) {
    const coupon = await findCouponByCode(client, schema, couponCode);
    if (!coupon) {
      return NextResponse.json({ error: "Couponcode niet gevonden." }, { status: 400 });
    }
    const couponError = validateCoupon(coupon, plan);
    if (couponError) {
      return NextResponse.json({ error: couponError }, { status: 400 });
    }
    couponId = coupon.id;
    finalAmountCents = Math.max(0, finalAmountCents - coupon.discount_cents);
  }

  // Zorg dat het bedrag niet negatief wordt
  finalAmountCents = Math.max(0, finalAmountCents);

  // Bij 100% korting: direct activeren zonder Mollie
  if (finalAmountCents === 0) {
    const { activateOrgPlan } = await import("@lib/server/db");
    await activateOrgPlan(client, schema, authResult.session.orgId, plan as "pro_event" | "pro_year", priceInfo.days);

    await createPaymentWithId(client, schema, {
      id: paymentId,
      orgId: authResult.session.orgId,
      plan,
      amountCents: 0,
      providerRef: `coupon_${couponId}`,
      description: `${priceInfo.description} (coupon: 100% korting)`,
      couponId,
    });

    if (couponId) await incrementCouponUsage(client, schema, couponId);

    await logActivity(client, schema, {
      userId: authResult.session.userId,
      orgId: authResult.session.orgId,
      action: "plan_activated",
      detail: { plan, couponCode, amount: "0.00", method: "coupon" },
    });

    return NextResponse.json({ activated: true, redirectUrl: `${baseUrl}/payments/return?id=${paymentId}&free=1` });
  }

  // Facturatiegegevens opslaan op organisatie
  if (billingInfo?.type) {
    await updateOrgBilling(client, schema, authResult.session.orgId, {
      billingType: billingInfo.type,
      companyName: billingInfo.companyName,
      address: billingInfo.address,
      postalCode: billingInfo.postalCode,
      city: billingInfo.city,
      vatNumber: billingInfo.vatNumber,
    });
  }

  // Coupon usage incrementeren vóór Mollie call om race condition te voorkomen
  if (couponId) await incrementCouponUsage(client, schema, couponId);

  try {
    const finalAmount = (finalAmountCents / 100).toFixed(2);
    const isPublic = !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");
    const description = couponId ? `${priceInfo.description} (met coupon)` : priceInfo.description;

    const molliePayment = await mollieClient.payments.create({
      amount: { currency: "EUR", value: finalAmount },
      description,
      redirectUrl: `${baseUrl}/payments/return?id=${paymentId}`,
      ...(isPublic ? { webhookUrl: `${baseUrl}/api/payments/webhook` } : {}),
      metadata: {
        orgId: authResult.session.orgId,
        plan,
        paymentId,
        couponId: couponId ?? undefined,
      },
    });

    await createPaymentWithId(client, schema, {
      id: paymentId,
      orgId: authResult.session.orgId,
      plan,
      amountCents: finalAmountCents,
      providerRef: molliePayment.id,
      description,
      couponId,
    });

    await logActivity(client, schema, {
      userId: authResult.session.userId,
      orgId: authResult.session.orgId,
      action: "payment_created",
      detail: { plan, mollieId: molliePayment.id, amount: finalAmount, couponCode: couponCode ?? null },
    });

    const checkoutUrl = molliePayment.getCheckoutUrl();
    if (!checkoutUrl) {
      return NextResponse.json({ error: "Checkout URL niet beschikbaar." }, { status: 500 });
    }
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("[payments/create] Mollie error:", err);
    return NextResponse.json({ error: "Betaling aanmaken mislukt." }, { status: 500 });
  }
}
