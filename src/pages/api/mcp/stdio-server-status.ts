// Stdio server status API - Monitoring for Claude MCP stdio servers
// src/pages/api/mcp/stdio-server-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getMCPClient } from "../../../lib/ai/mcp/mcpOfficialClient";

// Store last log time for each server to avoid excessive logging
const lastLogTime: Record<string, number> = {};
const lastStatusTime: Record<string, { status: string; time: number }> = {};
const LOG_THROTTLE_MS = 60000; // 60 seconds between logs (increased from 30)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed`
    });
  }

  try {
    const mcpClient = getMCPClient();

    if (req.method === "GET") {
      // Get status of all stdio servers - no logging for bulk status checks
      const allServers = mcpClient.getRegisteredServers();
      const stdioServers = allServers.filter(server => server.type === "stdio");

      const statusPromises = stdioServers.map(async server => {
        try {
          const testResult = await mcpClient.testMCPConnection(server.name);
          return {
            name: server.name,
            type: server.type,
            command: server.command,
            args: server.args || [],
            workingDirectory: server.workingDirectory,
            status: testResult.success ? "connected" : "error",
            message: testResult.message,
            availableTools: testResult.availableTools || [],
            lastChecked: new Date().toISOString(),
            enabled: server.tool_configuration?.enabled || false
          };
        } catch (error) {
          return {
            name: server.name,
            type: server.type,
            command: server.command,
            args: server.args || [],
            status: "error",
            message: error instanceof Error ? error.message : "Connection test failed",
            availableTools: [],
            lastChecked: new Date().toISOString(),
            enabled: server.tool_configuration?.enabled || false
          };
        }
      });

      const statuses = await Promise.all(statusPromises);

      return res.status(200).json({
        success: true,
        servers: statuses,
        totalServers: statuses.length,
        connectedServers: statuses.filter(s => s.status === "connected").length,
        checkedAt: new Date().toISOString()
      });
    }

    if (req.method === "POST") {
      // Check specific server status
      const { serverName, command, args, workingDirectory } = req.body;

      if (!serverName) {
        return res.status(400).json({
          success: false,
          error: "Server name is required"
        });
      }

      // Get server from Claude MCP registry
      let server = mcpClient.getServer(serverName);

      // If server not found but command provided, create temporary server config for testing
      if (!server && command) {
        server = {
          name: serverName,
          type: "stdio" as const,
          command,
          args: args || [],
          workingDirectory,
          tool_configuration: {
            enabled: true
          }
        };

        // Temporarily register for testing
        try {
          mcpClient.registerMCPServer(server);
        } catch (regError) {
          console.warn("Could not register temporary server for testing:", regError);
        }
      }

      if (!server) {
        return res.status(404).json({
          success: false,
          error: `Server ${serverName} not found in Claude MCP registry`
        });
      }

      if (server.type !== "stdio") {
        return res.status(400).json({
          success: false,
          error: `Server ${serverName} is not a stdio server (type: ${server.type})`
        });
      }

      const now = Date.now();
      const lastLog = lastLogTime[serverName] || 0;
      const lastStatus = lastStatusTime[serverName];

      try {
        const testResult = await mcpClient.testMCPConnection(serverName);
        const currentStatus = testResult.success ? "connected" : "error";

        const response = {
          success: true,
          server: {
            name: serverName,
            type: server.type,
            command: server.command,
            args: server.args || [],
            workingDirectory: server.workingDirectory,
            status: currentStatus,
            message: testResult.message,
            availableTools: testResult.availableTools || [],
            lastChecked: new Date().toISOString(),
            enabled: server.tool_configuration?.enabled || false
          },
          connectionTest: testResult
        };

        // Only log when status changes or after throttle period
        const statusChanged = !lastStatus || lastStatus.status !== currentStatus;
        const shouldLog = statusChanged || now - lastLog > LOG_THROTTLE_MS;

        if (shouldLog) {
          if (testResult.success) {
            console.log(`✅ Stdio MCP server ${serverName} is accessible through proxy`);
          } else {
            console.log(`❌ Stdio server ${serverName} test failed: ${testResult.message}`);
          }
          lastLogTime[serverName] = now;
        }

        // Update status tracking
        lastStatusTime[serverName] = { status: currentStatus, time: now };

        return res.status(200).json(response);
      } catch (error) {
        // Always log errors
        console.error(`❌ Error testing stdio server ${serverName}:`, error);

        const errorResponse = {
          success: false,
          server: {
            name: serverName,
            type: server.type,
            command: server.command,
            args: server.args || [],
            workingDirectory: server.workingDirectory,
            status: "error",
            message: error instanceof Error ? error.message : "Connection test failed",
            availableTools: [],
            lastChecked: new Date().toISOString(),
            enabled: server.tool_configuration?.enabled || false
          },
          error: error instanceof Error ? error.message : "Unknown error",
          connectionTest: {
            success: false,
            message: error instanceof Error ? error.message : "Connection test failed"
          }
        };

        // Update status tracking for errors too
        lastStatusTime[serverName] = { status: "error", time: now };

        // Still return 200 with error details for proper client handling
        return res.status(200).json(errorResponse);
      }
    }
  } catch (error: any) {
    console.error("Error handling stdio server status request:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
}
