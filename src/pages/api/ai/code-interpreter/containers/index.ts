// src/pages/api/ai/code-interpreter/containers/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

interface ContainerListResponse {
  success: boolean;
  containers?: any[];
  error?: string;
}

interface ContainerCreateResponse {
  success: boolean;
  container?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContainerListResponse | ContainerCreateResponse | { error: string }>
) {
  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  const openai = new OpenAI({ apiKey });

  try {
    switch (req.method) {
      case "GET":
        return await handleListContainers(openai, res);
      case "POST":
        return await handleCreateContainer(req.body, openai, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Containers API error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

async function handleListContainers(openai: OpenAI, res: NextApiResponse<ContainerListResponse | { error: string }>) {
  try {
    // Note: OpenAI Assistants API doesn't provide a way to list all threads
    // This is a limitation of the current API structure
    return res.status(200).json({
      success: true,
      containers: [] // Empty array as listing is not supported
    });
  } catch (error) {
    console.error("List containers error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list containers"
    });
  }
}

async function handleCreateContainer(
  body: any,
  openai: OpenAI,
  res: NextApiResponse<ContainerCreateResponse | { error: string }>
) {
  const { action, name, files, metadata } = body;

  if (action !== "create") {
    return res.status(400).json({ error: "Invalid action for this endpoint" });
  }

  try {
    // Create thread (equivalent to container in new API)
    const thread = await openai.beta.threads.create({
      metadata: {
        name: name || `container_${Date.now()}`,
        created_at: new Date().toISOString(),
        ...metadata
      }
    });

    return res.status(200).json({
      success: true,
      container: {
        id: thread.id,
        name: thread.metadata?.name || name || `container_${Date.now()}`,
        created_at: new Date().toISOString(),
        metadata: thread.metadata
      }
    });
  } catch (error) {
    console.error("Create container error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to create container"
    });
  }
}
