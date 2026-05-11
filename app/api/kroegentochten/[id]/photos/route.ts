import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { findKroegentochtForOrg } from "@lib/server/kroegentocht-db";
import { getPublicUrl } from "@lib/server/r2";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteCtx) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { orgId } = authResult.session;

  try {
    await ensureMigrations();
    const { id } = await context.params;
    const client = getClient();
    const schema = getSchema();
    const sd = await findKroegentochtForOrg(client, schema, id, orgId);
    if (!sd) return NextResponse.json({ error: "Kroegentocht niet gevonden." }, { status: 404 });

    const url = new URL(request.url);
    const stationFilter = url.searchParams.get("station") ?? "";
    const timeslotFilter = url.searchParams.get("timeslot") ?? "";

    let query = `SELECT id, station_id, timeslot_index, uploaded_by_name, file_key, file_name, file_size, mime_type, approved, created_at
                 FROM ${schema}.kroegentocht_photos WHERE kroegentocht_id = $1`;
    const params: (string | number)[] = [id];
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
      file_key: string; file_name: string; file_size: number; mime_type: string; approved: boolean; created_at: string;
    }>(query, params);

    return NextResponse.json({
      photos: result.rows.map((r) => ({
        id: r.id,
        stationId: r.station_id,
        timeslotIndex: r.timeslot_index,
        uploadedByName: r.uploaded_by_name,
        fileKey: r.file_key,
        url: getPublicUrl(r.file_key),
        fileName: r.file_name,
        fileSize: r.file_size,
        mimeType: r.mime_type,
        approved: r.approved,
        createdAt: r.created_at,
      })),
      photoAutoApprove: sd.photoAutoApprove,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto's ophalen mislukt." },
      { status: 500 }
    );
  }
}
