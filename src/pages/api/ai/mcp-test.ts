import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { getMCPClient } from "@/src/lib/ai/mcp/mcpOfficialClient";
import { getMCPIntegratedService } from "@/src/lib/ai/mcp/mcpIntegratedService";

/**
 * API endpoint per testare le connessioni MCP
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    console.log(`🧪 Starting MCP connection tests for user ${userId}`);

    // Test 1: Client MCP di base
    const mcpClient = getMCPClient();
    const serverTests = await mcpClient.testAllConnections();

    // Test 2: Servizio integrato
    const mcpService = getMCPIntegratedService();
    const integrationTest = await mcpService.processWithMCPAndThinking({
      message: "Test the enhanced capabilities",
      context: {
        conversationId: "test-session",
        cadElements: [],
        currentProject: "Enhanced Test"
      },
      options: {
        enableThinking: true,
        enableMCP: true,
        mcpServers: ["filesystem", "cad-tools", "cam-tools"],
        model: "claude-sonnet-4-20250514",
        temperature: 1,
        maxTokens: 2000
      }
    });

    // Test 3: Lista server registrati
    const registeredServers = mcpClient.getRegisteredServers();

    console.log(`✅ MCP tests completed: ${serverTests.successfulConnections}/${serverTests.totalServers} servers`);

    return res.status(200).json({
      success: true,
      data: {
        serverTests: {
          totalServers: serverTests.totalServers,
          successfulConnections: serverTests.successfulConnections,
          results: serverTests.results
        },
        integrationTest: {
          success: integrationTest,
          message: integrationTest,
          details: integrationTest
        },
        registeredServers: registeredServers.map(server => ({
          name: server.name,
          url: server.url,
          enabled: server.tool_configuration?.enabled ?? true,
          allowedTools: server.tool_configuration?.allowed_tools || "all"
        })),
        timestamp: new Date().toISOString(),
        userId
      },
      summary: {
        overallStatus: serverTests.successfulConnections > 0 && integrationTest ? "healthy" : "degraded",
        readyForProduction: serverTests.successfulConnections >= 2 && integrationTest,
        recommendations: generateRecommendations(serverTests, integrationTest)
      }
    });
  } catch (error) {
    console.error("❌ Error testing MCP connections:", error);

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Error testing MCP connections",
      error: {
        type: error instanceof Error ? error.name : "UnknownError",
        timestamp: new Date().toISOString()
      }
    });
  }
}

/**
 * Genera raccomandazioni basate sui risultati dei test
 */
function generateRecommendations(serverTests: any, integrationTest: any): string[] {
  const recommendations: string[] = [];

  if (serverTests.successfulConnections === 0) {
    recommendations.push("⚠️ No MCP servers are currently accessible. Check server URLs and authentication tokens.");
  } else if (serverTests.successfulConnections < serverTests.totalServers) {
    recommendations.push(
      `⚠️ ${serverTests.totalServers - serverTests.successfulConnections} servers are not responding. Review server configurations.`
    );
  }

  if (!integrationTest.success) {
    recommendations.push("⚠️ MCP integration test failed. Check service configuration and dependencies.");
  }

  if (serverTests.successfulConnections > 0 && integrationTest.success) {
    recommendations.push("✅ MCP system is operational and ready for use.");
  }

  // Specific server recommendations
  serverTests.results.forEach((result: any) => {
    if (!result.success) {
      recommendations.push(`🔧 Fix connection to ${result.serverName}: ${result.message}`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push("🎉 All systems operational! MCP integration is working perfectly.");
  }

  return recommendations;
}

/**
 * Configurazione per l'API
 */
export const config = {
  api: {
    responseLimit: "2mb"
  }
};
