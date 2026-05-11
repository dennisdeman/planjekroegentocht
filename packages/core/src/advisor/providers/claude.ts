import type { AdvisorPatch, LlmProvider } from "./llm";

interface ClaudeProviderOptions {
  model?: string;
  temperature?: number;
  endpoint?: string;
}

export class ClaudeProvider implements LlmProvider {
  constructor(private readonly options: ClaudeProviderOptions = {}) {}

  async proposeCandidates(prompt: string): Promise<{ candidates: AdvisorPatch[] }> {
    try {
      const response = await fetch(this.options.endpoint ?? "/api/advisor/llm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "claude",
          prompt,
          model: this.options.model,
          temperature: this.options.temperature,
        }),
      });
      if (!response.ok) {
        return { candidates: [] };
      }
      const payload = (await response.json()) as { candidates?: AdvisorPatch[] };
      if (!Array.isArray(payload.candidates)) {
        return { candidates: [] };
      }
      return { candidates: payload.candidates };
    } catch {
      return { candidates: [] };
    }
  }
}
