// src/pages/api/analytics/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { getActivityStatistics } from "@/src/lib/activityTracking";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "src/lib/api/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check method first
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Authenticate user using Better Auth
  const userId = await requireAuth(req, res);

  if (!userId) {
    // getAuthenticatedUserId already sent a response (e.g., 401)
    return;
  }

  try {
    // Fetch user details for admin check *after* authentication
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true
        // Include role or isAdmin flag if you add one to your User model
        // isAdmin: true
      }
    });

    // Admin Check (using email list as placeholder - replace with DB role check ideally)
    const adminEmails = ["nicola.mattioli.95@gmail.com", "nicom.19@icloud.com"];
    const isAdmin = user?.email ? adminEmails.includes(user.email) : false;
    // OR if using a flag in DB: const isAdmin = user?.isAdmin || false;

    // Parse query parameters
    const {
      startDate,
      endDate,
      itemType,
      action,
      groupBy = "day",
      userFilter // For admin use
    } = req.query;

    // Parse dates
    const startDateTime = startDate ? new Date(startDate as string) : undefined;
    const endDateTime = endDate ? new Date(endDate as string) : undefined;

    // --- Build Filters ---
    const filters: any = {
      startDate: startDateTime,
      endDate: endDateTime,
      groupBy: groupBy as "day" | "week" | "month"
    };

    // Add itemType filter
    if (itemType) {
      filters.itemType = Array.isArray(itemType) ? itemType : [itemType];
    }

    // Add action filter
    if (action) {
      filters.action = Array.isArray(action) ? action : [action];
    }

    // Add user filter (admin only)
    if (userFilter && isAdmin) {
      filters.userId = Array.isArray(userFilter) ? userFilter : [userFilter];
    } else if (!isAdmin) {
      // Non-admin users can only see their own data
      filters.userId = [userId];
    }

    // Get analytics data
    const analyticsData = await getActivityStatistics(filters);

    // Return the data
    return res.status(200).json({
      success: true,
      data: analyticsData,
      isAdmin,
      filters
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
