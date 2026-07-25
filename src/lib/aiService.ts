/**
 * Thin AI helper that routes through the single unified provider.
 *
 * Previously this instantiated `@anthropic-ai/sdk` directly in the browser
 * (`dangerouslyAllowBrowser`). It now POSTs to the unified `/api/ai/proxy`
 * endpoint, which runs the request through `LLMClient` (Vercel AI SDK) on the
 * server. No provider SDK is bundled or keyed on the client anymore.
 */

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

class AIService {
  async generateResponse(prompt: string): Promise<string> {
    try {
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 6000,
          reasoning: true,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `AI proxy request failed (${response.status})`);
      }

      // Anthropic-shaped response from the proxy: { content: [{ type, text }] }
      const data = await response.json();
      return data?.content?.[0]?.text ?? "";
    } catch (error) {
      console.error("AI Service Error:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();
