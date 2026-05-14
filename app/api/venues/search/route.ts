import { NextResponse } from "next/server";
import { requireAuth } from "@lib/server/api-auth";

export const runtime = "nodejs";

interface SerperPlace {
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  phoneNumber?: string;
  website?: string;
  priceLevel?: string;
  category?: string;
  cid?: string;
  placeId?: string;
}

interface SerperResponse {
  places?: SerperPlace[];
}

export interface VenueResult {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  category: string | null;
  sourceId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  bar: "bars",
  pub: "pubs",
  cafe: "cafés",
  nightclub: "nightclubs",
};

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const type = (url.searchParams.get("type") ?? "bar").toLowerCase();

  if (!q) {
    return NextResponse.json({ error: "q (zoekterm) is verplicht." }, { status: 400 });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SERPER_API_KEY is niet geconfigureerd op de server." },
      { status: 500 }
    );
  }

  const typeLabel = TYPE_LABELS[type] ?? "bars";
  const query = `${typeLabel} in ${q}`;

  try {
    const res = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "nl", hl: "nl" }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Serper API gaf ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as SerperResponse;
    const results: VenueResult[] = (data.places ?? []).map((p) => ({
      name: p.title ?? "Onbekend",
      address: p.address ?? null,
      lat: typeof p.latitude === "number" ? p.latitude : null,
      lng: typeof p.longitude === "number" ? p.longitude : null,
      phone: p.phoneNumber ?? null,
      website: p.website ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.ratingCount === "number" ? p.ratingCount : null,
      priceLevel: p.priceLevel ?? null,
      category: p.category ?? null,
      sourceId: p.cid ?? p.placeId ?? null,
    }));

    return NextResponse.json({ results, query });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search mislukt." },
      { status: 500 }
    );
  }
}
