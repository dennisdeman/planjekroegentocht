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

/**
 * Filter Google-categorieën die duidelijk **niet** drank-georiënteerd zijn
 * (bakkerij, fast food, ijszaak, koffietent EN-style). Behoud hybride venues
 * waar "bar/pub/club/lounge/brewery/gastro" in de naam zit, omdat die wel
 * geschikt zijn voor een kroegentocht.
 */
function isLikelyNonDrinkVenue(category: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  // Positieve overrides — als de categorie ook een drank-keyword bevat,
  // niet filteren ondanks "restaurant" in de naam (bv. "Restaurant-bar").
  const positiveKeywords = ["bar", "pub", "kroeg", "club", "lounge", "brewery", "brouwerij", "gastro"];
  if (positiveKeywords.some((kw) => c.includes(kw))) return false;
  // Blacklist — overdag-zaken / niet-drank
  const blacklist = [
    "restaurant",
    "bakery",
    "bakkerij",
    "fast food",
    "ice cream",
    "ijssalon",
    "coffee shop",
    "coffeeshop",
    "sandwich",
    "lunchroom",
    "tearoom",
    "dessert",
    "pizzeria",
  ];
  return blacklist.some((kw) => c.includes(kw));
}

export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const type = (url.searchParams.get("type") ?? "bar").toLowerCase();
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 && pageRaw <= 10 ? Math.floor(pageRaw) : 1;

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
      body: JSON.stringify({ q: query, gl: "nl", hl: "nl", page }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Serper API gaf ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as SerperResponse;
    // Serper strip de stadsnaam vaak uit het adres als 'ie al in de query zat.
    // Append 'm zelf voor simpele city-queries (geen postcode/getallen, ≤30 chars).
    const looksLikeSimpleCity = q.length <= 30 && !/\d/.test(q);
    const cityToAppend = looksLikeSimpleCity ? q.trim() : null;
    const augmentAddress = (addr: string | null): string | null => {
      if (!addr) return addr;
      if (!cityToAppend) return addr;
      if (addr.toLowerCase().includes(cityToAppend.toLowerCase())) return addr;
      return `${addr}, ${cityToAppend}`;
    };
    const results: VenueResult[] = (data.places ?? [])
      .map((p) => ({
        name: p.title ?? "Onbekend",
        address: augmentAddress(p.address ?? null),
        lat: typeof p.latitude === "number" ? p.latitude : null,
        lng: typeof p.longitude === "number" ? p.longitude : null,
        phone: p.phoneNumber ?? null,
        website: p.website ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.ratingCount === "number" ? p.ratingCount : null,
        priceLevel: p.priceLevel ?? null,
        category: p.category ?? null,
        sourceId: p.cid ?? p.placeId ?? null,
      }))
      // Filter resultaten zonder adres — die zijn vaak off-topic (Google geeft
      // soms bekende kettingnamen uit andere steden terug bij een city-query).
      .filter((r) => r.address && r.address.trim().length > 0)
      // Filter overdag-zaken (bakkerij, fast food, ijsboerderij) uit; behoud
      // wel hybride drank-eet-venues (gastropub, bar & grill, wine bar).
      .filter((r) => !isLikelyNonDrinkVenue(r.category));

    return NextResponse.json({ results, query, page });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search mislukt." },
      { status: 500 }
    );
  }
}
