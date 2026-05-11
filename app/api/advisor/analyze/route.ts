import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";

export const runtime = "nodejs";

interface AnalyzeRequestPayload {
  schema: string;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "advice");
  if (!featureResult.ok) return featureResult.response;

  try {
    const body = (await request.json()) as AnalyzeRequestPayload;
    if (typeof body.schema !== "string" || body.schema.trim().length === 0) {
      return NextResponse.json({ error: "Missing schema." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY ontbreekt in .env.local." }, { status: 500 });
    }

    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0.2,
          system: `Je bent een kroegentocht-advisor voor basisscholen. Je analyseert een kroegentocht-schema en stelt concrete verbeteringen voor.

Kroegentocht-regels:
- Groepen spelen in paren (2 teams per wedstrijd). Groepen ÷ 2 = wedstrijden per ronde.
- Voor 100% bezetting: wedstrijden per ronde = aantal stations.
- Oneven groepen per pool = 1 groep rust per ronde (bye). Dit is onwenselijk.
- Even groepen per pool (4, 6, 8, 10) is altijd beter dan oneven.
- Bij "blocks" movement: pools wisselen van veld na de pauze. Vereist minstens 2 locaties.
- Bij "split" layout: elk veld heeft andere spellen. Bij "same": elk veld dezelfde spellen.

Retourneer ALLEEN strict JSON met deze shape:
{
  "samenvatting": "Korte tekst (max 2 zinnen) over de huidige situatie",
  "probleem": "Korte tekst (max 2 zinnen) over de kern van het probleem, of null als er geen probleem is",
  "scenarios": [
    {
      "titel": "Korte titel (bijv. 'Schrap 2 spellen')",
      "beschrijving": "Wat je aanpast en wat het oplevert. Max 3 zinnen. Noem concrete spellen/groepen.",
      "config": {
        "groupCount": 12,
        "groupsPerPool": [6, 6],
        "spellen": ["Voetbal", "Hockey", ...],
        "movementPolicy": "blocks",
        "stationLayout": "split",
        "poolNames": ["Onderbouw", "Bovenbouw"]
      }
    }
  ]
}

Regels voor scenarios:
- Max 3 scenarios. Alleen scenarios die het schema BETER maken.
- Elk scenario bevat een complete "config" met groupCount, spellen (lijst van spelnamen), movementPolicy ("free" of "blocks"), stationLayout ("same" of "split"), en poolNames.
- De spellen lijst moet concrete spelnamen bevatten uit het huidige schema (of nieuwe).
- poolNames moet overeenkomen met het aantal pools (2 namen voor 2 pools).
- Sorteer van meest naar minst aanbevolen.
- Als het schema al goed is (score >= 9.5, bezetting >= 90%), retourneer een lege scenarios array.
- Stel NOOIT een oneven groepsaantal per pool voor.
- Verplaats het bye-probleem NOOIT van de ene pool naar de andere. Als pool A oneven is, los het op door groepen toe te voegen of te verwijderen — niet door groepen tussen pools te schuiven zodat pool B oneven wordt.
- groupCount moet ALTIJD gelijk zijn aan de som van groepen over alle pools. Bij ongelijke pools (bijv. 5+6=11): als je voorstelt om naar 6+6 te gaan, dan is groupCount 12.
- Claim NOOIT dat een oneven getal even is in je beschrijving.

Geen markdown, geen prose. Alleen JSON.`,
          messages: [{ role: "user", content: body.schema }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Claude API fout (${response.status}): ${detail.slice(0, 300)}`);
      }

      const payload = (await response.json()) as AnthropicResponse;
      const text = payload.content?.[0]?.text ?? "";

      // Parse JSON from response (handle markdown fencing)
      const trimmed = text.trim();
      const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      const jsonStr = fenced?.[1] ?? trimmed;
      const parsed = JSON.parse(jsonStr);

      return NextResponse.json(parsed);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyse mislukt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
