import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

class AIService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true
      
    });
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }]
      });

      return response.content[0]?.type?.toString();
    } catch (error) {
      console.error('AI Service Error:', error);
      throw error;
    }
  }
}

export const aiService = new AIService();