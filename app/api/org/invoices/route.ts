import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { listInvoicesForOrg, findInvoiceById } from "@lib/server/db";

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("id");

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  if (invoiceId) {
    const invoice = await findInvoiceById(client, schema, invoiceId);
    if (!invoice || invoice.org_id !== authResult.session.orgId) {
      return NextResponse.json({ error: "Factuur niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  }

  const invoices = await listInvoicesForOrg(client, schema, authResult.session.orgId);
  return NextResponse.json({ invoices: invoices.map(({ pdf_data, ...rest }) => rest) });
}
