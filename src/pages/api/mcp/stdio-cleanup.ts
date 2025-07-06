// Cleanup stdio server processes
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "@/src/lib/api/auth";
import { stdioProcessManager } from "@/src/server/mcp/StdioProcessManager";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get optional serverId from request body
    const { serverId } = req.body;

    // If serverId is provided, stop only that process
    // Otherwise stop all processes
    if (serverId) {
      const stopped = await stdioProcessManager.stopProcess(serverId);

      if (stopped) {
        return res.status(200).json({
          success: true,
          message: `Stdio server process ${serverId} stopped successfully`
        });
      } else {
        return res.status(404).json({
          success: false,
          message: `Stdio server process ${serverId} not found or already stopped`
        });
      }
    } else {
      // Stop all processes
      await stdioProcessManager.stopAllProcesses();

      return res.status(200).json({
        success: true,
        message: "All stdio server processes stopped successfully"
      });
    }
  } catch (error: any) {
    console.error(`Error stopping stdio server processes:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to stop stdio server processes"
    });
  }
}
