/**
 * Server-side factuur-PDF generatie met jsPDF.
 */
import { jsPDF } from "jspdf";

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  // Afzender
  sellerName: string;
  sellerAddress: string;
  sellerPostalCity: string;
  sellerKvk: string;
  sellerVat: string;
  sellerEmail: string;
  // Klant
  billingType: "private" | "business";
  billingName: string;
  billingEmail: string;
  billingCompanyName?: string;
  billingAddress?: string;
  billingPostalCity?: string;
  billingVatNumber?: string;
  // Regels
  description: string;
  amountCents: number;
  vatCents: number;
  totalCents: number;
}

// EyeCatching.Cloud bedrijfsgegevens
const SELLER = {
  name: "EyeCatching.Cloud",
  address: "Kerseboom 13",
  postalCity: "4101 VM, Culemborg",
  kvk: "67538959",
  vat: "NL857061495B01",
  email: "support@planjekroegentocht.nl",
};

function formatEuro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function generateInvoicePdf(data: InvoiceData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FACTUUR", 20, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  // Factuurnummer + datum rechtsboven
  doc.text(`Factuurnummer: ${data.invoiceNumber}`, pageWidth - 20, 20, { align: "right" });
  doc.text(`Datum: ${data.date}`, pageWidth - 20, 26, { align: "right" });

  // Afzender (links)
  let y = 45;
  doc.setFont("helvetica", "bold");
  doc.text("Van", 20, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(data.sellerName, 20, y); y += 5;
  if (data.sellerAddress) { doc.text(data.sellerAddress, 20, y); y += 5; }
  if (data.sellerPostalCity) { doc.text(data.sellerPostalCity, 20, y); y += 5; }
  if (data.sellerKvk) { doc.text(`KVK: ${data.sellerKvk}`, 20, y); y += 5; }
  if (data.sellerVat) { doc.text(`BTW: ${data.sellerVat}`, 20, y); y += 5; }
  doc.text(data.sellerEmail, 20, y);

  // Klant (rechts)
  y = 45;
  doc.setFont("helvetica", "bold");
  doc.text("Aan", 120, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  if (data.billingType === "business" && data.billingCompanyName) {
    doc.text(data.billingCompanyName, 120, y); y += 5;
  }
  doc.text(data.billingName, 120, y); y += 5;
  if (data.billingAddress) { doc.text(data.billingAddress, 120, y); y += 5; }
  if (data.billingPostalCity) { doc.text(data.billingPostalCity, 120, y); y += 5; }
  if (data.billingVatNumber) { doc.text(`BTW: ${data.billingVatNumber}`, 120, y); y += 5; }
  doc.text(data.billingEmail, 120, y);

  // Lijn
  y = 95;
  doc.setDrawColor(200);
  doc.line(20, y, pageWidth - 20, y);

  // Tabel header
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Omschrijving", 20, y);
  doc.text("Bedrag", pageWidth - 20, y, { align: "right" });

  // Lijn
  y += 3;
  doc.line(20, y, pageWidth - 20, y);

  // Regel
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text(data.description, 20, y);
  doc.text(formatEuro(data.amountCents), pageWidth - 20, y, { align: "right" });

  // Subtotaal, BTW, Totaal
  y += 15;
  doc.line(120, y, pageWidth - 20, y);
  y += 7;
  doc.text("Subtotaal excl. BTW", 120, y);
  doc.text(formatEuro(data.amountCents - data.vatCents), pageWidth - 20, y, { align: "right" });
  y += 6;
  doc.text("BTW (21%)", 120, y);
  doc.text(formatEuro(data.vatCents), pageWidth - 20, y, { align: "right" });
  y += 3;
  doc.line(120, y, pageWidth - 20, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Totaal", 120, y);
  doc.text(formatEuro(data.totalCents), pageWidth - 20, y, { align: "right" });

  // Betaalstatus
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(34, 139, 34);
  doc.text("Betaald via iDEAL", 20, y);
  doc.setTextColor(0);

  // Footer
  y = 270;
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text("Plan je Kroegentocht is een product van EyeCatching.Cloud | support@planjekroegentocht.nl", pageWidth / 2, y, { align: "center" });

  // Return als base64 data URL
  return doc.output("datauristring");
}

export function createInvoiceData(params: {
  invoiceNumber: string;
  billingType: string;
  billingName: string;
  billingEmail: string;
  billingCompanyName?: string | null;
  billingAddress?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  billingVatNumber?: string | null;
  description: string;
  amountCents: number;
}): InvoiceData {
  const vatRate = 0.21;
  const totalCents = params.amountCents;
  // Prijs is incl. BTW, bereken BTW eruit
  const exclCents = Math.round(totalCents / (1 + vatRate));
  const vatCents = totalCents - exclCents;

  const postalCity = [params.billingPostalCode, params.billingCity].filter(Boolean).join(" ");

  return {
    invoiceNumber: params.invoiceNumber,
    date: new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }),
    sellerName: SELLER.name,
    sellerAddress: SELLER.address,
    sellerPostalCity: SELLER.postalCity,
    sellerKvk: SELLER.kvk,
    sellerVat: SELLER.vat,
    sellerEmail: SELLER.email,
    billingType: params.billingType === "business" ? "business" : "private",
    billingName: params.billingName,
    billingEmail: params.billingEmail,
    billingCompanyName: params.billingCompanyName ?? undefined,
    billingAddress: params.billingAddress ?? undefined,
    billingPostalCity: postalCity || undefined,
    billingVatNumber: params.billingVatNumber ?? undefined,
    description: params.description,
    amountCents: totalCents,
    vatCents,
    totalCents,
  };
}
