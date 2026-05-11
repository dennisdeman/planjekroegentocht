// Advisor-bestanden (advisor.ts, candidates.ts, feasibility.ts, scoring.ts,
// verify.ts) zijn verwijderd in fase 3 stap 3.7 — vervangen door
// alternatives.ts en feasibility.ts in de kern.
//
// Providers blijven beschikbaar voor de LLM-uitbreiding (stap 3.4).
export * from "./providers/llm";
export * from "./providers/openai";
export * from "./providers/grok";
export * from "./providers/claude";
