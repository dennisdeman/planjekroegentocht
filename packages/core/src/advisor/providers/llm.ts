// AdvisorPatch is een legacy type dat de LLM providers gebruiken voor
// hun response-formaat. In stap 3.4 wordt dit vervangen door
// AlternativePatch uit alternatives.ts. Tot dan: placeholder type.
export type AdvisorPatch = Record<string, unknown>;

export interface LlmProvider {
  proposeCandidates(prompt: string): Promise<{ candidates: AdvisorPatch[] }>;
}

export class NoneProvider implements LlmProvider {
  async proposeCandidates(): Promise<{ candidates: AdvisorPatch[] }> {
    return { candidates: [] };
  }
}

