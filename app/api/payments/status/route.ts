import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { mollieClient } from "@lib/server/mollie";
import { findPaymentById, updatePaymentStatus, activateOrgPlan } from "@lib/server/db";
import { PLAN_PRICES } from "@lib/server/mollie";
import { createInvoiceForPayment } from "@lib/server/invoice-helper";

/**
 * GET /api/payments/status?id=<intern-payment-id>
 * Client pollt deze route na terugkeer van Mollie om de status te checken.
 */
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  if (!mollieClient) {
    return NextResponse.json({ error: "Betalingen niet beschikbaar." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("id");
  if (!paymentId) {
    return NextResponse.json({ error: "Geen payment ID." }, { status: 400 });
  }

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    // Intern payment record opzoeken
    const payment = await findPaymentById(client, schema, paymentId);
    if (!payment || payment.org_id !== authResult.session.orgId) {
      return NextResponse.json({ error: "Betaling niet gevonden." }, { status: 404 });
    }

    // Status ophalen bij Mollie via provider_ref (Mollie ID)
    const molliePayment = await mollieClient.payments.get(payment.provider_ref!);
    const status = molliePayment.status;

    // DB bijwerken
    await updatePaymentStatus(client, schema, payment.provider_ref!, status);

    // Bij betaald: plan activeren + factuur aanmaken (idempotent)
    if (status === "paid") {
      const plan = payment.plan as "pro_event" | "pro_year";
      const days = PLAN_PRICES[plan]?.days ?? 30;
      await activateOrgPlan(client, schema, payment.org_id, plan, days);
      try {
        await createInvoiceForPayment(client, schema, payment.provider_ref!);
      } catch (invoiceErr) {
        console.error("[payments/status] Invoice creation failed (non-blocking):", invoiceErr);
      }
    }

    return NextResponse.json({ status });
  } catch (err) {
    console.error("[payments/status] Error:", err);
    return NextResponse.json({ error: "Status ophalen mislukt." }, { status: 500 });
  }
}
