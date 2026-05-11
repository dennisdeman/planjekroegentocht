import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { logActivity } from "@lib/server/db";
import type { MatchCancelReason } from "@core";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const VALID_CANCEL: MatchCancelReason[] = ["weather", "no_show", "injury", "other"];

export async function POST(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "goLive");
  if (!featureResult.ok) return featureResult.response;
  const { orgId, userId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const body = await request.json();
    const { action, timeslotIndex, cancelReason } = body as {
      action?: string;
      timeslotIndex?: number;
      cancelReason?: MatchCancelReason;
    };

    if (!action || typeof timeslotIndex !== "number") {
      return NextResponse.json({ error: "action en timeslotIndex zijn verplicht." }, { status: 400 });
    }

    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    let affected = 0;

    if (action === "cancel_round") {
      const reason = cancelReason && VALID_CANCEL.includes(cancelReason) ? cancelReason : "other";
      const result = await client.query<{ id: string }>(
        `UPDATE ${schema}.match_results
         SET status = 'cancelled', cancel_reason = $3, version = version + 1, last_updated_at = NOW()
         WHERE kroegentocht_id = $1 AND timeslot_index = $2 AND status != 'cancelled'
         RETURNING id;`,
        [id, timeslotIndex, reason]
      );
      affected = result.rows.length;
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_round_cancelled", detail: { kroegentochtId: id, timeslotIndex, cancelReason: reason, affected } });
    } else if (action === "restore_round") {
      const result = await client.query<{ id: string }>(
        `UPDATE ${schema}.match_results
         SET status = 'scheduled', cancel_reason = NULL, cancel_note = NULL, version = version + 1, last_updated_at = NOW()
         WHERE kroegentocht_id = $1 AND timeslot_index = $2 AND status = 'cancelled'
         RETURNING id;`,
        [id, timeslotIndex]
      );
      affected = result.rows.length;
      await logActivity(client, schema, { userId, orgId, action: "kroegentocht_round_restored", detail: { kroegentochtId: id, timeslotIndex, affected } });
    } else {
      return NextResponse.json({ error: "Ongeldige actie." }, { status: 400 });
    }

    return NextResponse.json({ affected });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk-actie mislukt." },
      { status: 500 }
    );
  }
}
