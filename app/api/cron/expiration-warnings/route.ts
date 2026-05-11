import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findExpiringOrgs, logActivity } from "@lib/server/db";
import { sendExpirationWarningEmail } from "@lib/server/email";

const PLAN_LABELS: Record<string, string> = {
  free: "proefperiode",
  pro_event: "Pro Event",
  pro_year: "Pro Jaar",
};

/**
 * GET /api/cron/expiration-warnings
 *
 * Dagelijks aanroepen (bijv. via Vercel cron of externe cron-service).
 * Beveiligd met CRON_SECRET om misbruik te voorkomen.
 */
export async function GET(request: Request) {
  // Beveilig met secret — verplicht in productie
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET niet geconfigureerd." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const expiringOrgs = await findExpiringOrgs(client, schema);
    let sent = 0;

    for (const org of expiringOrgs) {
      const planLabel = PLAN_LABELS[org.active_plan] || org.active_plan;

      for (const email of org.admin_emails) {
        try {
          await sendExpirationWarningEmail({
            to: email,
            orgName: org.org_name,
            planLabel,
            expiresAt: org.expires_at,
            upgradeUrl: `${baseUrl}/upgrade`,
          });
          sent++;
        } catch (err) {
          console.error(`[cron] Failed to send warning to ${email}:`, err);
        }
      }

      await logActivity(client, schema, {
        orgId: org.org_id,
        action: "expiration_warning_sent",
        detail: { plan: org.active_plan, expiresAt: org.expires_at, recipients: org.admin_emails },
      });
    }

    return NextResponse.json({ ok: true, orgsChecked: expiringOrgs.length, emailsSent: sent });
  } catch (err) {
    console.error("[cron] Expiration warnings error:", err);
    return NextResponse.json({ error: "Cron job mislukt." }, { status: 500 });
  }
}
