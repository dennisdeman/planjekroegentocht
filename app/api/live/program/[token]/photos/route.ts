import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken } from "@lib/server/live-tokens";
import { getPublicUrl } from "@lib/server/r2";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified) {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }
    if (verified.role !== "program") {
      return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
    }

    const url = new URL(request.url);
    const stationFilter = url.searchParams.get("station") ?? "";
    const timeslotFilter = url.searchParams.get("timeslot") ?? "";

    let query = `SELECT id, station_id, timeslot_index, uploaded_by_name, file_key, file_name, mime_type, created_at
                 FROM ${schema}.kroegentocht_photos WHERE kroegentocht_id = $1 AND approved = TRUE`;
    const params: (string | number)[] = [verified.kroegentochtId];
    let paramIdx = 2;

    if (stationFilter) {
      query += ` AND station_id = $${paramIdx}`;
      params.push(stationFilter);
      paramIdx++;
    }
    if (timeslotFilter) {
      query += ` AND timeslot_index = $${paramIdx}`;
      params.push(Number(timeslotFilter));
      paramIdx++;
    }
    query += ` ORDER BY created_at DESC;`;

    const result = await client.query<{
      id: string; station_id: string; timeslot_index: number | null; uploaded_by_name: string | null;
      file_key: string; file_name: string; mime_type: string; created_at: string;
    }>(query, params);

    // Config meesturen voor filters
    const sdRow = await client.query<{ config_snapshot: string }>(
      `SELECT config_snapshot FROM ${schema}.kroegentochten WHERE id = $1;`,
      [verified.kroegentochtId]
    );
    let config = null;
    if (sdRow.rows[0]?.config_snapshot) {
      try {
        const snap = typeof sdRow.rows[0].config_snapshot === "string"
          ? JSON.parse(sdRow.rows[0].config_snapshot)
          : sdRow.rows[0].config_snapshot;
        config = {
          stations: snap.stations ?? [],
          locations: snap.locations ?? [],
          activityTypes: snap.activityTypes ?? [],
          timeslots: snap.timeslots ?? [],
        };
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      photos: result.rows.map((r) => ({
        id: r.id,
        stationId: r.station_id,
        timeslotIndex: r.timeslot_index,
        uploadedByName: r.uploaded_by_name,
        url: getPublicUrl(r.file_key),
        fileName: r.file_name,
        mimeType: r.mime_type,
        createdAt: r.created_at,
      })),
      config,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto's ophalen mislukt." },
      { status: 500 }
    );
  }
}
