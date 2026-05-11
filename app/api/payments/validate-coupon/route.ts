import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findCouponByCode, validateCoupon } from "@lib/server/db";
import { PLAN_PRICES } from "@lib/server/mollie";

/**
 * POST /api/payments/validate-coupon
 * Valideert een couponcode en retourneert de korting.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const body = await request.json();
  const code = body.code as string;
  const plan = body.plan as string;

  if (!code?.trim()) {
    return NextResponse.json({ error: "Voer een couponcode in." }, { status: 400 });
  }
  if (!plan || !PLAN_PRICES[plan]) {
    return NextResponse.json({ error: "Ongeldig plan." }, { status: 400 });
  }

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const coupon = await findCouponByCode(client, schema, code);
  if (!coupon) {
    return NextResponse.json({ error: "Couponcode niet gevonden." }, { status: 404 });
  }

  const error = validateCoupon(coupon, plan);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const originalCents = Math.round(parseFloat(PLAN_PRICES[plan].amount) * 100);
  const discountedCents = Math.max(0, originalCents - coupon.discount_cents);

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discountCents: coupon.discount_cents,
    discountFormatted: `€${(coupon.discount_cents / 100).toFixed(2).replace(".", ",")}`,
    originalCents,
    finalCents: discountedCents,
    finalFormatted: `€${(discountedCents / 100).toFixed(2).replace(".", ",")}`,
    description: coupon.description,
  });
}
