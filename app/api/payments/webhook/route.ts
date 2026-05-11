import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findPaymentByProviderRef, updatePaymentStatus, activateOrgPlan, logActivity } from "@lib/server/db";
import { mollieClient, PLAN_PRICES } from "@lib/server/mollie";
import { createInvoiceForPayment } from "@lib/server/invoice-helper";

/**
 * Mollie webhook — wordt aangeroepen door Mollie wanneer een betalingsstatus verandert.
 * Geen authenticatie nodig (Mollie stuurt alleen het payment ID).
 * We halen de echte status op bij Mollie ter verificatie.
 */
export async function POST(request: Request) {
  if (!mollieClient) {
    return NextResponse.json({ error: "Betalingen niet beschikbaar." }, { status: 503 });
  }

  const formData = await request.formData();
  const molliePaymentId = formData.get("id") as string;

  if (!molliePaymentId) {
    return NextResponse.json({ error: "Geen payment ID." }, { status: 400 });
  }

  try {
    // Status ophalen bij Mollie (authoritative source)
    const molliePayment = await mollieClient.payments.get(molliePaymentId);
    const status = molliePayment.status;

    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    // Payment record bijwerken
    await updatePaymentStatus(client, schema, molliePaymentId, status);

    // Bij succesvolle betaling: plan activeren
    if (status === "paid") {
      const payment = await findPaymentByProviderRef(client, schema, molliePaymentId);
      if (payment) {
        const plan = payment.plan as "pro_event" | "pro_year";
        const days = PLAN_PRICES[plan]?.days ?? 30;
        await activateOrgPlan(client, schema, payment.org_id, plan, days);

        await logActivity(client, schema, {
          orgId: payment.org_id,
          action: "plan_activated",
          detail: { plan, days, mollieId: molliePaymentId },
        });

        // Factuur aanmaken + emailen
        try {
          await createInvoiceForPayment(client, schema, molliePaymentId);
        } catch (invoiceErr) {
          console.error("[payments/webhook] Invoice creation failed (non-blocking):", invoiceErr);
        }
      }
    }

    // Mollie verwacht altijd 200 OK
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[payments/webhook] Error:", err);
    // Mollie herprobeert bij 5xx
    return NextResponse.json({ error: "Webhook verwerking mislukt." }, { status: 500 });
  }
}
