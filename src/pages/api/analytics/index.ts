// src/pages/api/analytics/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { getActivityStatistics } from "@/src/lib/activityTracking";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "@/src/lib/api/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check method first
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Authenticate user - requireAuth should handle session validation
  const userId = await requireAuth(req, res);
  if (!userId) {
    // requireAuth already sent a response (e.g., 401)
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

    // --- User Filtering Logic ---
    let activityLogUserFilter: { userId?: string } = {}; // Filter for ActivityLog queries
    let generalUserFilter: { userId?: string } = {}; // Filter for other user-specific queries if needed

    if (!isAdmin) {
      // Non-admin users see their own data
      filters.userId = userId; // Used by getActivityStatistics
      activityLogUserFilter.userId = userId; // Used for ActivityLog queries (activeUsers, recentActivity)
      generalUserFilter.userId = userId; // If needed for other user-scoped data
    } else if (userFilter) {
      // Admin users can filter by a specific user
      filters.userId = userFilter as string;
      activityLogUserFilter.userId = userFilter as string;
      generalUserFilter.userId = userFilter as string;
    } else {
      // Admin viewing all users - no userId filter applied to activityLogUserFilter
      // filters.userId might still be needed if getActivityStatistics expects it for 'all users' scenario
      // If getActivityStatistics doesn't need userId for admins viewing all, remove this else block for filters.userId
      // filters.userId = undefined;
    }

    // --- Fetch Data ---

    // 1. Get activity statistics (pass adjusted filters)
    const statistics = await getActivityStatistics(filters);

    // 2. Get total user count (only relevant for admins, maybe conditional fetch?)
    let userCount: number | null = null;
    if (isAdmin) {
      // Only fetch total count if user is admin
      userCount = await prisma.user.count();
    }

    // 3. Get active users in the last 30 days (apply user filter)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await prisma.activityLog.groupBy({
      by: ["userId"],
      where: {
        timestamp: { gte: thirtyDaysAgo },
        ...activityLogUserFilter // Apply user filter here
      },
      _count: { userId: true }, // Count occurrences of each userId
      orderBy: {
        _count: {
          userId: "desc"
        }
      },
      take: 10
    });

    // 4. Get recent activity (apply user filter)
    const recentActivity = await prisma.activityLog.findMany({
      where: activityLogUserFilter, // Apply user filter here
      orderBy: { timestamp: "desc" },
      take: 10,
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    // --- Return Response ---
    return res.status(200).json({
      statistics,
      userCount: userCount ?? undefined, // Return count only if fetched (admin)
      activeUsers: activeUsers.map(u => ({ userId: u.userId, count: u._count.userId })), // Simplify structure
      recentActivity,
      isAdmin // Include isAdmin flag for frontend UI adjustments
    });
  } catch (error) {
    console.error("Failed to get analytics data:", error);
    return res.status(500).json({ message: "Failed to get analytics data" });
  }
}
