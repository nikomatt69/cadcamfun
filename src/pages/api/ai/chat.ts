// AI chat API with MCP integration

// src/pages/api/ai/chat.ts
import type { NextApiRequest, NextApiResponse } from "next";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { prisma } from "@/src/lib/prisma";

// AI provider integration — single unified provider (Vercel AI SDK)
import { config as loadEnv } from "dotenv";
import { LLMClient } from "@/src/lib/ai/provider";
import type { CoreMessage } from "ai";
import { requireAuth } from "src/lib/api/auth";

loadEnv();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, mcpServerId, mcpReference } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages are required and must be an array" });
  }

  try {
    // Handle MCP integration if requested
    let mcpData: any = null;

    if (mcpServerId && mcpReference) {
      // Get server configuration
      const serverConfig = await prisma.mCPServerConfig.findUnique({
        where: { id: mcpServerId }
      });

      if (!serverConfig) {
        return res.status(404).json({ error: "MCP server configuration not found" });
      }

      if (!serverConfig.enabled) {
        return res.status(400).json({ error: "MCP server is disabled" });
      }

      // Connect to MCP server using proper configuration
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => mcpServerId
      });
      // Instantiate the Client with the required name and version.
      const client = new Client({
        name: "MCP Client",
        version: "1.0.0"
      });
      // Connect to the MCP server using the configured transport.
      await client.connect(transport);

      try {
        // Check if reference is a resource URI or tool name
        if (mcpReference.startsWith("resource://")) {
          // Load resource
          const response = await client.readResource(mcpReference);
          mcpData = response.text;
        } else {
          // Execute tool with empty parameters using the updated method
          // Note: You might want to support parameters in your actual implementation
          mcpData = await client.callTool({
            name: mcpReference,
            arguments: {}
          });
        }
      } finally {
        await client.close();
      }
    }

    // Prepare messages for the AI
    const aiMessages: CoreMessage[] = [...messages];

    // Add MCP data to context if available
    if (mcpData) {
      aiMessages.push({
        role: "system",
        content: `The following data was retrieved from an MCP server: ${typeof mcpData === "object" ? JSON.stringify(mcpData) : mcpData
          }`
      });
    }

    // Call AI provider through the unified provider
    const completion = await LLMClient.generate({
      model: "gpt-4.1",
      messages: aiMessages,
      maxTokens: 1000
    });

    const reply = completion.text || "No response generated";

    // Return the AI response
    return res.status(200).json({
      reply,
      hasMcpData: !!mcpData
    });
  } catch (error: any) {
    console.error("Error in AI chat API:", error);
    return res.status(500).json({ error: error.message || "Failed to process request" });
  }
}
