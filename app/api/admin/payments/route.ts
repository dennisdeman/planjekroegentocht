import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { adminListPayments, findPaymentById, updatePaymentStatus, activateOrgPlan, logActivity } from "@lib/server/db";
import { PLAN_PRICES } from "@lib/server/mollie";
import { createInvoiceForPayment } from "@lib/server/invoice-helper";

export async function GET(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const result = await adminListPayments(client, schema, { status, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const { action, paymentId, status } = await request.json();

  if (action === "update-status") {
    if (!paymentId || !status) {
      return NextResponse.json({ error: "paymentId en status zijn verplicht." }, { status: 400 });
    }
    const payment = await findPaymentById(client, schema, paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Betaling niet gevonden." }, { status: 404 });
    }

    // Status bijwerken
    if (payment.provider_ref) {
      await updatePaymentStatus(client, schema, payment.provider_ref, status);
    }

    // Bij markeren als betaald: plan activeren + factuur aanmaken
    if (status === "paid" && payment.status !== "paid") {
      const plan = payment.plan as "pro_event" | "pro_year";
      const days = PLAN_PRICES[plan]?.days ?? 30;
      await activateOrgPlan(client, schema, payment.org_id, plan, days);

      if (payment.provider_ref) {
        await createInvoiceForPayment(client, schema, payment.provider_ref);
      }
    }

    await logActivity(client, schema, {
      userId: authResult.userId,
      action: "admin.payment.update-status",
      detail: { paymentId, oldStatus: payment.status, newStatus: status },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
