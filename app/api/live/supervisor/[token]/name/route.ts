import { NextResponse } from "next/server";
import { getClient, getSchema, ensureMigrations } from "@lib/server/postgres-storage";
import { verifyLiveToken, checkTokenRateLimit, setSupervisorName } from "@lib/server/live-tokens";

export const runtime = "nodejs";

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

    const body = await request.json();
    const rawName = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const previousName = typeof body.previousName === "string" ? body.previousName.trim() : "";
    if (!rawName) {
      return NextResponse.json({ error: "Naam is verplicht." }, { status: 400 });
    }

    await setSupervisorName(client, schema, verified.id, rawName);

    if (verified.scopeId) {
      if (previousName && previousName !== rawName) {
        await client.query(
          `UPDATE ${schema}.kroegentocht_station_supervisors SET name = $4, registered_at = NOW()
           WHERE kroegentocht_id = $1 AND station_id = $2 AND name = $3;`,
          [verified.kroegentochtId, verified.scopeId, previousName, rawName]
        ).catch(() => {});
      }
      await client.query(
        `INSERT INTO ${schema}.kroegentocht_station_supervisors (kroegentocht_id, station_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (kroegentocht_id, station_id, name) DO NOTHING;`,
        [verified.kroegentochtId, verified.scopeId, rawName]
      );
    }

    return NextResponse.json({ ok: true, name: rawName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Naam opslaan mislukt." },
      { status: 500 }
    );
  }
}
