/**
 * Email helper using Resend.
 * When RESEND_API_KEY is not set, emails are logged to console (dev mode).
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface VerificationEmailParams {
  to: string;
  verifyUrl: string;
}

export async function sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";

  if (!apiKey) {
    console.log("[email:dev] Verification email would be sent to:", params.to);
    console.log("[email:dev] Verify URL:", params.verifyUrl);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Bevestig je e-mailadres — Kroegentocht Planner",
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>E-mailadres bevestigen</h2>
          <p>Bedankt voor je registratie bij Kroegentocht Planner. Bevestig je e-mailadres om je account te activeren.</p>
          <p>
            <a href="${params.verifyUrl}"
               style="display: inline-block; padding: 10px 20px; background: #0f6c73; color: #fff;
                      text-decoration: none; border-radius: 8px; font-weight: 600;">
              E-mailadres bevestigen
            </a>
          </p>
          <p style="color: #666; font-size: 0.85rem;">
            Deze link is 24 uur geldig.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

interface InvitationEmailParams {
  to: string;
  inviteUrl: string;
  orgName: string;
}

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";

  if (!apiKey) {
    console.log("[email:dev] Invitation email would be sent to:", params.to);
    console.log("[email:dev] Invite URL:", params.inviteUrl);
    return;
  }

  const orgLabel = params.orgName ? ` bij ${params.orgName}` : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `Uitnodiging voor Kroegentocht Planner${orgLabel}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Je bent uitgenodigd${orgLabel}</h2>
          <p>Iemand heeft je uitgenodigd om mee te werken aan een kroegentochtplanning.</p>
          <p>
            <a href="${params.inviteUrl}"
               style="display: inline-block; padding: 10px 20px; background: #0f6c73; color: #fff;
                      text-decoration: none; border-radius: 8px; font-weight: 600;">
              Uitnodiging accepteren
            </a>
          </p>
          <p style="color: #666; font-size: 0.85rem;">
            Deze link is 7 dagen geldig. Als je geen account hebt, kun je er een aanmaken.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

interface ContactEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactEmail(params: ContactEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";
  const to = "support@planjekroegentocht.nl";

  if (!apiKey) {
    console.log("[email:dev] Contact email from:", params.name, params.email);
    console.log("[email:dev] Subject:", params.subject);
    console.log("[email:dev] Message:", params.message);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: params.email,
      subject: `Contactformulier: ${params.subject}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Nieuw bericht via contactformulier</h2>
          <p><strong>Naam:</strong> ${escapeHtml(params.name)}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(params.email)}</p>
          <p><strong>Onderwerp:</strong> ${escapeHtml(params.subject)}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
          <p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

interface ExpirationWarningEmailParams {
  to: string;
  orgName: string;
  planLabel: string;
  expiresAt: string;
  upgradeUrl: string;
}

export async function sendExpirationWarningEmail(params: ExpirationWarningEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";

  const dateStr = new Date(params.expiresAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

  if (!apiKey) {
    console.log("[email:dev] Expiration warning to:", params.to, "plan:", params.planLabel, "expires:", dateStr);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `Je ${params.planLabel} verloopt binnenkort — Plan je Kroegentocht`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Je ${params.planLabel} verloopt binnenkort</h2>
          <p>Beste gebruiker van ${params.orgName},</p>
          <p>Je <strong>${params.planLabel}</strong> verloopt op <strong>${dateStr}</strong>. Na deze datum wordt je planning bevroren en kun je niet meer bewerken of exporteren.</p>
          <p>
            <a href="${params.upgradeUrl}"
               style="display: inline-block; padding: 10px 20px; background: #0f6c73; color: #fff;
                      text-decoration: none; border-radius: 8px; font-weight: 600;">
              Nu verlengen
            </a>
          </p>
          <p style="color: #666; font-size: 0.85rem;">
            Heb je vragen? Mail ons op support@planjekroegentocht.nl.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

interface InvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  description: string;
  totalFormatted: string;
}

export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";

  if (!apiKey) {
    console.log("[email:dev] Invoice email to:", params.to, "invoice:", params.invoiceNumber);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `Factuur ${params.invoiceNumber} — Plan je Kroegentocht`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Bedankt voor je bestelling!</h2>
          <p>Je betaling is ontvangen. Hieronder de details:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 0; color: #666;">Factuurnummer</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(params.invoiceNumber)}</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Omschrijving</td><td style="padding: 6px 0;">${escapeHtml(params.description)}</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Totaal</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(params.totalFormatted)}</td></tr>
          </table>
          <p>Je factuur is beschikbaar in je account onder <strong>Instellingen</strong>.</p>
          <p style="color: #666; font-size: 0.85rem;">
            Vragen? Mail ons op support@planjekroegentocht.nl.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Kroegentocht Planner <noreply@kroegentocht.app>";

  if (!apiKey) {
    console.log("[email:dev] Password reset email would be sent to:", params.to);
    console.log("[email:dev] Reset URL:", params.resetUrl);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Wachtwoord resetten — Kroegentocht Planner",
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Wachtwoord resetten</h2>
          <p>Je hebt een verzoek ingediend om je wachtwoord te resetten.</p>
          <p>
            <a href="${params.resetUrl}"
               style="display: inline-block; padding: 10px 20px; background: #0f6c73; color: #fff;
                      text-decoration: none; border-radius: 8px; font-weight: 600;">
              Nieuw wachtwoord instellen
            </a>
          </p>
          <p style="color: #666; font-size: 0.85rem;">
            Deze link is 1 uur geldig. Als je dit verzoek niet hebt gedaan, kun je deze email negeren.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}
