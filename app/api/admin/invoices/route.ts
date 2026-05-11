import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperadmin } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { adminListInvoices, findInvoiceById } from "@lib/server/db";

export async function GET(request: NextRequest) {
  const authResult = await requireSuperadmin();
  if (!authResult.ok) return authResult.response;

  await ensureMigrations();
  const client = getClient();
  const schema = getSchema();

  const invoiceId = request.nextUrl.searchParams.get("id");

  // Individuele factuur ophalen (incl. pdf_data)
  if (invoiceId) {
    const invoice = await findInvoiceById(client, schema, invoiceId);
    if (!invoice) return NextResponse.json({ error: "Factuur niet gevonden." }, { status: 404 });
    return NextResponse.json({ invoice });
  }

  // Lijst ophalen
  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const result = await adminListInvoices(client, schema, { from, to, limit, offset });

  // Strip pdf_data uit de lijst (te groot voor overzicht)
  const invoices = result.invoices.map(({ pdf_data, ...rest }) => rest);
  return NextResponse.json({ invoices, total: result.total });
}
