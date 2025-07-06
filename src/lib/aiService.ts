import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

class AIService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      dangerouslyAllowBrowser: true
    });
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const response = await this.client.beta.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        thinking: { type: "enabled", budget_tokens: Math.min(1600, 6000 / 2) },
        messages: [{ role: "user", content: prompt }]
      });
      for (const block of response.content) {
        if (block.type === "thinking") {
          console.log(`\nThinking summary: ${block.thinking}`);
        } else if (block.type === "text") {
          console.log(`\nResponse: ${block.text}`);
        }
      }

      return response.content[0]?.type?.toString();
    } catch (error) {
      console.error("AI Service Error:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();
