// src/pages/api/ai/proxy.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuthFast } from "@/src/lib/api/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuthFast(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  const secretKey = process.env.ANTHROPIC_API_KEY;

  if (!secretKey) {
    // Throw error only in development/build time, avoid crashing production server if env var is momentarily unavailable.
    // Consider more robust error handling or logging here for production.
    if (process.env.NODE_ENV !== "production") {
      throw new Error("Anthropic API key is not defined. Please set ANTHROPIC_API_KEY in your environment variables.");
    }
    console.error("Anthropic API key is not defined.");
  }
  try {
    const { endpoint, model, messages, max_tokens, temperature, system } = req.body;

    // Base URL for Anthropic API
    const apiUrl = "https://api.anthropic.com/v1";
    const finalEndpoint = `${apiUrl}/${endpoint || "messages"}`;

    const response = await fetch(finalEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": secretKey || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 7000,
        temperature: 1,
        system,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to call Anthropic API");
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error proxying to Anthropic API:", error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Error calling Anthropic API"
    });
  }
}

// Extended timeout configuration for serverless functions
export const config = {
  api: {
    responseLimit: "16mb",
    // Extended timeout for complex CAD operations (max 2 minutes)
    maxDuration: 120 // 120 seconds = 2 minutes
  }
};
