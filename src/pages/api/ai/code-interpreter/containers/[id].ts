// src/pages/api/ai/code-interpreter/containers/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

interface ContainerResponse {
  success: boolean;
  container?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContainerResponse | { error: string }>
) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Container ID required" });
  }

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  const openai = new OpenAI({ apiKey });

  try {
    switch (req.method) {
      case "GET":
        return await handleGetContainer(id, openai, res);
      case "DELETE":
        return await handleDeleteContainer(id, openai, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Container API error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

async function handleGetContainer(
  id: string,
  openai: OpenAI,
  res: NextApiResponse<ContainerResponse | { error: string }>
) {
  try {
    // Retrieve thread (equivalent to container)
    const thread = await openai.beta.threads.retrieve(id);

    return res.status(200).json({
      success: true,
      container: {
        id: thread.id,
        name: thread.metadata?.name || "Thread",
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        file_count: 0,
        metadata: thread.metadata
      }
    });
  } catch (error) {
    console.error("Get container error:", error);
    return res.status(404).json({
      success: false,
      error: "Container not found or expired"
    });
  }
}

async function handleDeleteContainer(
  id: string,
  openai: OpenAI,
  res: NextApiResponse<ContainerResponse | { error: string }>
) {
  try {
    // Delete thread (equivalent to container)
    await openai.beta.threads.del(id);

    return res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error("Delete container error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete container"
    });
  }
}
