/**
 * Gedeelde helper voor factuur-aanmaak na betaling.
 * Wordt aangeroepen vanuit webhook en status routes.
 */
import type { PgClient } from "@storage";
import { findPaymentByProviderRef, findOrganizationById, createInvoice, listMembersOfOrg } from "./db";
import { createInvoiceData, generateInvoicePdf } from "./invoice-pdf";
import { sendInvoiceEmail } from "./email";
import { PLAN_PRICES } from "./mollie";

/**
 * Maak een factuur aan voor een betaalde betaling.
 * Idempotent: als er al een factuur bestaat voor deze payment, wordt niets gedaan.
 */
export async function createInvoiceForPayment(
  client: PgClient,
  schema: string,
  providerRef: string
): Promise<void> {
  const payment = await findPaymentByProviderRef(client, schema, providerRef);
  if (!payment) return;

  // Check of er al een factuur is voor deze betaling
  const existingResult = await client.query<{ id: string }>(
    `SELECT id FROM ${schema}.invoices WHERE payment_id = $1 LIMIT 1;`,
    [payment.id]
  );
  if (existingResult.rows.length > 0) return;

  const org = await findOrganizationById(client, schema, payment.org_id);
  if (!org) return;

  // Haal admin email op
  const members = await listMembersOfOrg(client, schema, payment.org_id);
  const adminMember = members.find((m) => m.role === "admin");
  const billingEmail = adminMember?.user_email ?? "onbekend@planjekroegentocht.nl";
  const billingName = adminMember?.user_name ?? org.name;

  const priceInfo = PLAN_PRICES[payment.plan];
  const description = priceInfo?.description ?? payment.description ?? payment.plan;

  // Factuur data + PDF genereren
  const invoiceData = createInvoiceData({
    invoiceNumber: "", // wordt ingevuld door createInvoice
    billingType: org.billing_type,
    billingName,
    billingEmail,
    billingCompanyName: org.billing_company_name ?? undefined,
    billingAddress: org.billing_address ?? undefined,
    billingPostalCode: org.billing_postal_code ?? undefined,
    billingCity: org.billing_city ?? undefined,
    billingVatNumber: org.billing_vat_number ?? undefined,
    description,
    amountCents: payment.amount_cents,
  });

  // Factuur opslaan in DB (genereert factuurnummer)
  const invoice = await createInvoice(client, schema, {
    paymentId: payment.id,
    orgId: payment.org_id,
    billingType: org.billing_type,
    billingName,
    billingEmail,
    billingCompanyName: org.billing_company_name ?? undefined,
    billingAddress: org.billing_address ?? undefined,
    billingPostalCode: org.billing_postal_code ?? undefined,
    billingCity: org.billing_city ?? undefined,
    billingVatNumber: org.billing_vat_number ?? undefined,
    description,
    amountCents: invoiceData.amountCents,
    vatCents: invoiceData.vatCents,
    totalCents: invoiceData.totalCents,
  });

  // PDF genereren met het echte factuurnummer
  try {
    invoiceData.invoiceNumber = invoice.invoice_number;
    const pdfData = generateInvoicePdf(invoiceData);
    await client.query(
      `UPDATE ${schema}.invoices SET pdf_data = $1 WHERE id = $2;`,
      [pdfData, invoice.id]
    );
  } catch (err) {
    console.error("[invoice] PDF generatie mislukt:", err);
  }

  // Factuur-email versturen
  try {
    const totalFormatted = `€${(invoice.total_cents / 100).toFixed(2).replace(".", ",")}`;
    await sendInvoiceEmail({
      to: billingEmail,
      invoiceNumber: invoice.invoice_number,
      description,
      totalFormatted,
    });
  } catch (err) {
    console.error("[invoice] Email versturen mislukt:", err);
  }
}
