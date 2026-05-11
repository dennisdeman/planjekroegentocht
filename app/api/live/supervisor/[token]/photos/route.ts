import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit } from "@lib/server/live-tokens";
import { findKroegentochtByIdRaw } from "@lib/server/kroegentocht-db";
import { uploadObject } from "@lib/server/r2";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified) {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }
    if (verified.role !== "supervisor") {
      return NextResponse.json({ error: "Alleen spelbegeleiders." }, { status: 403 });
    }

    const rl = checkTokenRateLimit(verified.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Te veel verzoeken." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const timeslotIndexRaw = formData.get("timeslotIndex");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Alleen JPEG of PNG afbeeldingen." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Bestand is te groot (max 5 MB)." }, { status: 400 });
    }

    // Check of foto's zijn ingeschakeld
    const kroegentocht = await findKroegentochtByIdRaw(client, schema, verified.kroegentochtId);
    if (!kroegentocht?.photosEnabled) {
      return NextResponse.json({ error: "Foto's zijn niet ingeschakeld voor deze kroegentocht." }, { status: 403 });
    }

    const autoApprove = kroegentocht.photoAutoApprove;
    const timeslotIndex = timeslotIndexRaw != null && timeslotIndexRaw !== "" ? Number(timeslotIndexRaw) : null;
    const ext = file.type === "image/png" ? "png" : "jpg";
    const fileKey = `photos/${verified.kroegentochtId}/${randomUUID()}.${ext}`;

    // Upload naar R2 via server
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadObject(fileKey, buffer, file.type);

    // Metadata opslaan in DB
    const result = await client.query<{ id: string; created_at: string; approved: boolean }>(
      `INSERT INTO ${schema}.kroegentocht_photos
         (kroegentocht_id, station_id, timeslot_index, uploaded_by_name, file_key, file_name, file_size, mime_type, approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at, approved;`,
      [
        verified.kroegentochtId,
        verified.scopeId ?? "",
        timeslotIndex,
        verified.supervisorName ?? null,
        fileKey,
        file.name,
        file.size,
        file.type,
        autoApprove,
      ]
    );

    const row = result.rows[0];
    return NextResponse.json({
      photo: {
        id: row.id,
        fileKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto uploaden mislukt." },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request, context: RouteCtx) {
  try {
    const { token } = await context.params;
    await ensureMigrations();
    const client = getClient();
    const schema = getSchema();

    const verified = await verifyLiveToken(client, schema, token);
    if (!verified) {
      return NextResponse.json({ error: "Link is ongeldig of verlopen." }, { status: 401 });
    }
    if (verified.role !== "supervisor") {
      return NextResponse.json({ error: "Alleen spelbegeleiders." }, { status: 403 });
    }

    const result = await client.query<{
      id: string; file_key: string; file_name: string; file_size: number;
      mime_type: string; timeslot_index: number | null; created_at: string;
    }>(
      `SELECT id, file_key, file_name, file_size, mime_type, timeslot_index, created_at
       FROM ${schema}.kroegentocht_photos
       WHERE kroegentocht_id = $1 AND station_id = $2
       ORDER BY created_at DESC;`,
      [verified.kroegentochtId, verified.scopeId ?? ""]
    );

    return NextResponse.json({
      photos: result.rows.map((r) => ({
        id: r.id,
        fileKey: r.file_key,
        fileName: r.file_name,
        fileSize: r.file_size,
        mimeType: r.mime_type,
        timeslotIndex: r.timeslot_index,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Foto's ophalen mislukt." },
      { status: 500 }
    );
  }
}
