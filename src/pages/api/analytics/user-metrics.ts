// pages/api/analytics/user-metrics.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient, Prisma } from "@prisma/client";
// Assuming UserMetricDataPoint can represent all possible chart data points now
// We might need to adjust this interface if some metrics have different value types (e.g., usage vs count)
import { UserMetricDataPoint } from "@/src/components/analytics/UserMetricsChart";
import { requireAuth } from "@/src/lib/api/auth";
import { ActivityItemType, ActivityAction } from "@/src/lib/activityTracking"; // Import activity types

// Create a singleton instance of PrismaClient
const prisma = new PrismaClient();

// Summary interface remains the same
interface UserMetricsSummary {
  totalAiRequests: number;
  totalCadDrawings: number;
  totalStorageUsage: number; // In MB
  totalProjects: number;
  totalComponents: number;
  totalToolpaths: number;
  totalActivityCount?: number; // Add count for the summary if needed
}

// This interface will hold the raw query result for counts
interface CountQueryResult {
  date: Date;
  count: bigint;
}
// This interface will hold the raw query result for storage usage
interface StorageQueryResult {
  date: Date;
  usage: bigint;
}

interface ApiResponseData {
  summary: UserMetricsSummary;
  // chartData structure should accommodate different metrics.
  // The UserMetricDataPoint interface needs all possible metric keys as optional numbers.
  chartData: UserMetricDataPoint[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponseData | { error: string }>) {
  // Check method first
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Authenticate the user
  const userId = await requireAuth(req, res);
  if (!userId) return; // requireAuth handles the response

  // Fetch user info for potential admin checks (though filtering is mostly user-based now)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  // Replace with your actual admin check logic if needed elsewhere
  // const adminEmails = ['nicola.mattioli.95@gmail.com', 'nicom.19@icloud.com'];
  // const isAdmin = adminEmails.includes(user?.email || '');

  // Parse query parameters with validation and defaults
  const startDateStr = req.query.startDate as string | undefined;
  const endDateStr = req.query.endDate as string | undefined;
  const groupBy = (req.query.groupBy as string) || "day";
  // Default metric can be adjusted as needed
  const metric = (req.query.metric as string) || "activityCount";
  const itemType = req.query.itemType as string[] | string | undefined;
  const action = req.query.action as string[] | string | undefined;
  const userFilter = req.query.userFilter as string | undefined; // For potential admin use

  // Validate groupBy param
  if (!["day", "week", "month"].includes(groupBy)) {
    return res.status(400).json({ error: "Invalid groupBy parameter. Use day, week, or month." });
  }

  // Validate metric param - Add all valid metrics here
  const validMetrics = [
    "activityCount",
    "toolpathsGenerated",
    "connections",
    "programRuns", // from chart.ts
    "aiRequests",
    "cadDrawings",
    "storageUsage",
    "projects",
    "components",
    "toolpaths" // from user-metrics
  ];
  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: `Invalid metric parameter. Use one of: ${validMetrics.join(", ")}` });
  }

  // Parse dates with validation
  let startDate: Date;
  let endDate: Date;

  try {
    // Default to 30 days ago if start date is not provided or invalid
    startDate = startDateStr ? new Date(startDateStr) : new Date();
    if (isNaN(startDate.getTime())) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    } else if (!startDateStr) {
      startDate.setDate(startDate.getDate() - 30);
    }

    // Default to current date if end date is not provided or invalid
    endDate = endDateStr ? new Date(endDateStr) : new Date();
    if (isNaN(endDate.getTime())) {
      endDate = new Date();
    }
  } catch (err) {
    // This catch block might be less likely to be hit with the above checks, but keep for safety
    return res.status(400).json({
      error: `Invalid date format processing: ${err instanceof Error ? err.message : "Unknown error"}`
    });
  }

  // Ensure start date is before end date
  if (startDate > endDate) {
    return res.status(400).json({ error: "startDate cannot be after endDate." });
  }

  // Prepare date filters for ORM queries (summary counts)
  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  try {
    // --- Get Summary Metrics (using ORM where possible) ---
    // These counts are often for the specific user, adjust if admin overview needed
    const totalAiRequests = await prisma.aIAnalysisLog.count({ where: { userId, createdAt: dateFilter } });
    const totalCadDrawings = await prisma.drawing.count({
      where: {
        project: { OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }] },
        createdAt: dateFilter
      }
    });
    const totalProjects = await prisma.project.count({
      where: { OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }], createdAt: dateFilter }
    });
    const totalComponents = await prisma.component.count({
      where: {
        project: { OR: [{ ownerId: userId }, { organization: { users: { some: { userId } } } }] },
        createdAt: dateFilter
      }
    });
    const totalToolpaths = await prisma.toolpath.count({ where: { createdBy: userId, createdAt: dateFilter } });
    const storageAggregate = await prisma.fileUpload.aggregate({
      _sum: { s3Size: true },
      where: { ownerId: userId, createdAt: dateFilter }
    });
    const totalStorageUsageBytes = storageAggregate._sum.s3Size || 0;
    const totalStorageUsage = Math.round(totalStorageUsageBytes / (1024 * 1024)); // Convert to MB

    // Example: Get total activity count for summary (adjust filters as needed)
    const totalActivityCount = await prisma.activityLog.count({ where: { userId, timestamp: dateFilter } });

    const summary: UserMetricsSummary = {
      totalAiRequests,
      totalCadDrawings,
      totalStorageUsage,
      totalProjects,
      totalComponents,
      totalToolpaths,
      totalActivityCount // Add to summary
    };

    // --- Get Time Series Data for Charts (using $queryRaw for flexibility) ---
    let timeSeriesData: Array<CountQueryResult | StorageQueryResult> = [];

    // Helper function to build WHERE clauses for ActivityLog queries
    const buildActivityLogWhereClause = (): { clause: Prisma.Sql; params: any[] } => {
      let conditions: Prisma.Sql[] = [Prisma.sql`"timestamp" >= ${startDate}`, Prisma.sql`"timestamp" <= ${endDate}`];
      let params: any[] = []; // Keep params separate for $queryRaw

      // Always filter by the authenticated user
      conditions.push(Prisma.sql`"userId" = ${userId}`);

      // Add itemType filter
      const itemTypesArray = itemType ? (Array.isArray(itemType) ? itemType : [itemType]) : undefined;
      if (itemTypesArray?.length) {
        conditions.push(Prisma.sql`"itemType"::text = ANY(${itemTypesArray})`);
      }

      // Add action filter
      const actionsArray = action ? (Array.isArray(action) ? action : [action]) : undefined;
      if (actionsArray?.length) {
        conditions.push(Prisma.sql`"action"::text = ANY(${actionsArray})`);
      }

      return { clause: Prisma.join(conditions, " AND "), params };
    };

    const activityLogWhere = buildActivityLogWhereClause();

    // Determine date truncation SQL based on groupBy
    const dateTruncSql =
      groupBy === "week"
        ? Prisma.sql`DATE_TRUNC('week', "timestamp")`
        : groupBy === "month"
          ? Prisma.sql`DATE_TRUNC('month', "timestamp")`
          : Prisma.sql`DATE_TRUNC('day', "timestamp")`; // Default to day

    switch (metric) {
      // --- Metrics previously in user-metrics.ts ---
      case "aiRequests":
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, a."createdAt") as date, COUNT(*) as count
          FROM "AIAnalysisLog" a
          WHERE a."userId" = ${userId} AND a."createdAt" >= ${startDate} AND a."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;
      case "cadDrawings":
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, d."createdAt") as date, COUNT(*) as count
          FROM "Drawing" d
          JOIN "Project" p ON d."projectId" = p.id
          LEFT JOIN "UserOrganization" uo ON p."organizationId" = uo."organizationId"
          WHERE (p."ownerId" = ${userId} OR uo."userId" = ${userId}) AND d."createdAt" >= ${startDate} AND d."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;
      case "projects":
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, p."createdAt") as date, COUNT(*) as count
          FROM "Project" p
          LEFT JOIN "UserOrganization" uo ON p."organizationId" = uo."organizationId"
          WHERE (p."ownerId" = ${userId} OR uo."userId" = ${userId}) AND p."createdAt" >= ${startDate} AND p."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;
      case "components":
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, c."createdAt") as date, COUNT(*) as count
          FROM "Component" c
          JOIN "Project" p ON c."projectId" = p.id
          LEFT JOIN "UserOrganization" uo ON p."organizationId" = uo."organizationId"
          WHERE (p."ownerId" = ${userId} OR uo."userId" = ${userId}) AND c."createdAt" >= ${startDate} AND c."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;
      case "toolpaths":
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, t."createdAt") as date, COUNT(*) as count
          FROM "Toolpath" t
          WHERE t."createdBy" = ${userId} AND t."createdAt" >= ${startDate} AND t."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;
      case "storageUsage":
        timeSeriesData = await prisma.$queryRaw<StorageQueryResult[]>`
          SELECT DATE_TRUNC(${groupBy}, f."createdAt") as date, SUM(f."s3Size") as usage
          FROM "FileUpload" f
          WHERE f."ownerId" = ${userId} AND f."createdAt" >= ${startDate} AND f."createdAt" <= ${endDate}
          GROUP BY date ORDER BY date ASC
        `;
        break;

      // --- Metrics previously handled by chart.ts (now using ActivityLog) ---
      case "activityCount":
      case "toolpathsGenerated": // Assuming this maps to an action in ActivityLog
      case "connections": // Assuming this maps to an action/itemType in ActivityLog
      case "programRuns": // Assuming this maps to an action/itemType in ActivityLog
      default: // Default to overall activity count
        // Adjust the WHERE clause based on the specific metric if needed
        // For example, for 'toolpathsGenerated', you might add: AND action = 'generate_gcode'
        // For now, we use the generic activityLogWhere which includes itemType/action filters if provided in query params

        // Use dateTruncSql for consistent grouping
        timeSeriesData = await prisma.$queryRaw<CountQueryResult[]>`
            SELECT ${dateTruncSql} as date, COUNT(*) as count
            FROM "ActivityLog"
            WHERE ${activityLogWhere.clause} 
            GROUP BY date ORDER BY date ASC`;
        break;
    }

    // Generate a complete date range for the time period
    const dateRange = generateDateRange(startDate, endDate, groupBy);

    // Map time series data into the unified chart format
    const chartData: UserMetricDataPoint[] = dateRange.map(date => {
      const dateStr = date.toISOString().split("T")[0];
      const dataPoint = timeSeriesData.find(item => formatDate(item.date) === dateStr);

      const result: UserMetricDataPoint = { date: dateStr };

      // Populate the correct metric field
      if (dataPoint) {
        if ("usage" in dataPoint) {
          // StorageQueryResult
          result.storageUsage = Math.round(Number(dataPoint.usage) / (1024 * 1024)); // Convert B to MB
        } else if ("count" in dataPoint) {
          // CountQueryResult
          // Assign count to the specific metric key requested
          const countValue = Number(dataPoint.count);
          switch (metric) {
            case "aiRequests":
              result.aiRequests = countValue;
              break;
            case "cadDrawings":
              result.cadDrawings = countValue;
              break;
            case "projects":
              result.projects = countValue;
              break;
            case "components":
              result.components = countValue;
              break;
            case "toolpaths":
              result.toolpaths = countValue;
              break;
            // Add cases for metrics mapping to ActivityLog counts
            case "activityCount":
              result.activityCount = countValue;
              break;
            case "toolpathsGenerated":
              result.toolpathsGenerated = countValue;
              break;
            case "connections":
              result.connections = countValue;
              break;
            case "programRuns":
              result.programRuns = countValue;
              break;
            // Add more specific mappings if needed
            default:
              result.activityCount = countValue; // Fallback?
          }
        }
      } else {
        // Ensure all possible metric keys are initialized to 0 if no data for the date
        validMetrics.forEach(key => {
          if (key !== "storageUsage" && key !== "date") {
            // storageUsage handled above or below
            result[key as keyof Omit<UserMetricDataPoint, "date" | "storageUsage">] = 0;
          } else if (key === "storageUsage") {
            result.storageUsage = 0;
          }
        });
      }

      // Ensure the requested metric field is explicitly set to 0 if not populated above
      if (!(metric in result)) {
        if (metric === "storageUsage") {
          result.storageUsage = 0;
        } else if (metric !== "date") {
          result[metric as keyof Omit<UserMetricDataPoint, "date">] = 0;
        }
      }

      return result;
    });

    res.status(200).json({ summary, chartData });
  } catch (error) {
    console.error("Error fetching user metrics:", error);
    let errorMessage = "Internal Server Error fetching user metrics";
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error: ${error.code}`;
      // Potentially log error.meta or error.message for more details internally
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    res.status(500).json({ error: errorMessage });
  }
  // No finally block needed for prisma disconnect with recent Prisma versions
}

// Helper function to format date consistently
function formatDate(date: Date): string {
  // Use UTC methods to avoid timezone issues when comparing dates truncated by the DB
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper function to generate a complete date range in UTC
function generateDateRange(startDate: Date, endDate: Date, groupBy: string): Date[] {
  const dates: Date[] = [];
  // Work with UTC dates to align with formatDate and DB truncation behavior
  let currentDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const lastDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  while (currentDate <= lastDate) {
    dates.push(new Date(currentDate)); // Store a copy

    // Increment based on groupBy
    switch (groupBy) {
      case "day":
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        break;
      case "week":
        // Move to the next Sunday (start of the week for DATE_TRUNC 'week')
        // This logic might need adjustment depending on the DB's locale settings for week start.
        // A simpler approach for weekly steps:
        currentDate.setUTCDate(currentDate.getUTCDate() + 7);
        break;
      case "month":
        currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
        // Ensure the day doesn't wrap around if the next month is shorter
        currentDate.setUTCDate(1);
        break;
      default: // Should not happen due to validation
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        break;
    }
  }

  return dates;
}
