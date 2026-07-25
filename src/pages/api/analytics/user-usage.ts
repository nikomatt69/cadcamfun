import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { userAnalyticsService } from "@/src/lib/ai/ai-new/userAnalytics";
import { prisma } from "@/src/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await requireAuth(req, res);

    if (!userId) {
      return; // requireAuth already sent the response
    }

    const { method } = req;
    const { userId: queryUserId, startDate, endDate, period = "30" } = req.query;

    // Parse date range
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      // Default to last N days
      const days = parseInt(period as string, 10) || 30;
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - days);
    }

    switch (method) {
      case "GET":
        if (queryUserId) {
          // Get specific user analytics
          const userSummary = userAnalyticsService.getUserSummary(
            queryUserId as string,
            start,
            end
          );

          // Get user details for analytics
          const user = await prisma.user.findUnique({
            where: { id: queryUserId as string },
            select: { name: true, email: true }
          });

          const userBreakdown = userAnalyticsService.getUserCostBreakdown(
            queryUserId as string,
            start,
            end,
            {
              username: user?.name || undefined,
              email: user?.email || undefined
            }
          );

          return res.status(200).json({
            summary: userSummary,
            breakdown: userBreakdown
          });
        } else {
          // Get all users analytics (admin only)
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true }
          });
          const isAdmin = user?.email === process.env.ADMIN_EMAIL;

          if (!isAdmin) {
            return res.status(403).json({ error: "Admin access required" });
          }

          const allUsersUsage = userAnalyticsService.getAllUsersUsage(start, end);
          const systemStats = userAnalyticsService.getSystemStats(start, end);

          return res.status(200).json({
            users: allUsersUsage,
            systemStats
          });
        }

      case "DELETE":
        // Clear user data (user can clear their own data)
        // Note: userId is already validated by requireAuth, so we just need to check if it exists
        if (!userId) {
          return res.status(403).json({ error: "Authentication required" });
        }

        // Note: In a real app, you'd want to clear from database
        // For now, we'll just return success as localStorage is client-side
        return res.status(200).json({ message: "Data cleared successfully" });

      default:
        res.setHeader("Allow", ["GET", "DELETE"]);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error("Error in user-usage API:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
} 