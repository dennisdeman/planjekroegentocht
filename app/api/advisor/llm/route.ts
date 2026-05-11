import { NextResponse } from "next/server";
import { requireAuth, requireFeature } from "@lib/server/api-auth";
import type { AdvisorPatch } from "../../../../packages/core/src/advisor/providers/llm";

export const runtime = "nodejs";

type Provider = "openai" | "grok" | "claude";

interface LlmRequestPayload {
  provider?: Provider;
  prompt?: string;
  model?: string;
  temperature?: number;
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function asProvider(value: unknown): Provider | null {
  if (value === "openai" || value === "grok" || value === "claude") {
    return value;
  }
  return null;
}

function normalizeTemperature(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.1;
  }
  return Math.min(1, Math.max(0, value));
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate);
}

function parseCandidates(text: string): AdvisorPatch[] {
  try {
    const parsed = parseJsonFromText(text) as { candidates?: unknown };
    if (!Array.isArray(parsed.candidates)) {
      return [];
    }
    return parsed.candidates as AdvisorPatch[];
  } catch {
    return [];
  }
}

function modelForProvider(provider: Provider, model?: string): string {
  if (model?.trim()) {
    return model.trim();
  }
  switch (provider) {
    case "openai": return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    case "grok": return process.env.GROK_MODEL ?? "grok-2-1212";
    case "claude": return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  }
}

function endpointForProvider(provider: Provider): string {
  switch (provider) {
    case "openai": return process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
    case "grok": return process.env.GROK_API_BASE_URL ?? "https://api.x.ai/v1/chat/completions";
    case "claude": return "https://api.anthropic.com/v1/messages";
  }
}

function apiKeyForProvider(provider: Provider): string | null {
  switch (provider) {
    case "openai": return process.env.OPENAI_API_KEY ?? null;
    case "grok": return process.env.GROK_API_KEY ?? process.env.XAI_API_KEY ?? null;
    case "claude": return process.env.ANTHROPIC_API_KEY ?? null;
  }
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
}

async function callProvider(
  provider: Provider,
  prompt: string,
  model: string,
  temperature: number
): Promise<{ candidates: AdvisorPatch[] }> {
  const apiKey = apiKeyForProvider(provider);
  if (!apiKey) {
    const envHint: Record<Provider, string> = {
      openai: "OPENAI_API_KEY",
      grok: "GROK_API_KEY (of XAI_API_KEY)",
      claude: "ANTHROPIC_API_KEY",
    };
    throw new Error(`${envHint[provider]} ontbreekt in .env.local.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const systemPrompt = "Return strict JSON object only with shape: {\"candidates\": AdvisorPatch[]}. No prose.";

    // Anthropic API has a different request format
    const isClaude = provider === "claude";
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    let body: string;

    if (isClaude) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = JSON.stringify({
        model,
        max_tokens: 4096,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });
    } else {
      headers.authorization = `Bearer ${apiKey}`;
      body = JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      });
    }

    const response = await fetch(endpointForProvider(provider), {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${provider} API fout (${response.status}): ${detail.slice(0, 300)}`);
    }

    let text: string;
    if (isClaude) {
      const payload = (await response.json()) as AnthropicResponse;
      text = payload.content?.[0]?.text ?? "";
    } else {
      const payload = (await response.json()) as OpenAiChatResponse;
      text = payload.choices?.[0]?.message?.content ?? "";
    }

    return { candidates: parseCandidates(text) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const featureResult = await requireFeature(authResult.session, "advice");
  if (!featureResult.ok) return featureResult.response;

  try {
    const body = (await request.json()) as LlmRequestPayload;
    const provider = asProvider(body.provider);
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
    }
    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    const result = await callProvider(
      provider,
      body.prompt,
      modelForProvider(provider, body.model),
      normalizeTemperature(body.temperature)
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM provider request failed.";
    console.error("[advisor/llm] Error:", message);
    return NextResponse.json({ error: message, candidates: [] }, { status: 500 });
  }
}
