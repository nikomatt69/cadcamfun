// src/pages/api/ai/completion.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { prompt, systemPrompt, model = "claude-sonnet-4-20250514", temperature = 0.3 } = req.body;

    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }

    const response = await unifiedAIService.processRequest({
      prompt,
      systemPrompt,
      model,
      temperature,
      maxTokens: 3000
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error calling AI service:", error);
    return res.status(500).json({ message: "Error generating completion" });
  }
}
