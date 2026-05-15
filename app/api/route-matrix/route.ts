import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";

export const runtime = "nodejs";

interface OrsMatrixResponse {
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

interface RequestBody {
  coords: [number, number][];
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON-body." }, { status: 400 });
  }

  if (!Array.isArray(body.coords) || body.coords.length < 2) {
    return NextResponse.json(
      { error: "Minimaal 2 coördinaten vereist." },
      { status: 400 }
    );
  }
  if (body.coords.length > 50) {
    return NextResponse.json(
      { error: "Maximaal 50 coördinaten per call." },
      { status: 400 }
    );
  }
  for (const c of body.coords) {
    if (
      !Array.isArray(c) ||
      c.length !== 2 ||
      typeof c[0] !== "number" ||
      typeof c[1] !== "number" ||
      !Number.isFinite(c[0]) ||
      !Number.isFinite(c[1])
    ) {
      return NextResponse.json(
        { error: "Coords-format moet [[lng, lat], ...] zijn." },
        { status: 400 }
      );
    }
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ORS_API_KEY niet geconfigureerd." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      "https://api.openrouteservice.org/v2/matrix/foot-walking",
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          locations: body.coords,
          metrics: ["duration"],
          units: "m",
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `ORS gaf ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as OrsMatrixResponse;
    return NextResponse.json({ durations: data.durations ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Matrix-call mislukt." },
      { status: 500 }
    );
  }
}
