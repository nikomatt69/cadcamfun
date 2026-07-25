import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireAuth } from "src/lib/api/auth";

interface Activity {
  id: string;
  type: "project" | "drawing" | "component" | "tool" | "gcode";
  action: "created" | "updated" | "deleted" | "exported";
  itemName: string;
  timestamp: string;
  userId: string;
  userName: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Activity[] | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Skip auth for now to fix the issues
    const userId = await requireAuth(req, res);

    if (!userId) return
    const limit = parseInt(req.query.limit as string) || 10;

    // Get recent activities from different tables
    const [recentProjects, recentDrawings, recentComponents, recentToolpaths] = await Promise.all([
      // Recent Projects
      prisma.project.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        take: Math.ceil(limit / 4),
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { name: true } }
        }
      }),

      // Recent Drawings
      prisma.drawing.findMany({
        where: {
          project: { ownerId: userId }
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.ceil(limit / 4),
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          project: {
            select: {
              owner: { select: { name: true } }
            }
          }
        }
      }),

      // Recent Components
      prisma.component.findMany({
        where: {
          project: { ownerId: userId }
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.ceil(limit / 4),
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          project: {
            select: {
              owner: { select: { name: true } }
            }
          }
        }
      }),

      // Recent Toolpaths
      prisma.toolpath.findMany({
        where: { createdBy: userId },
        orderBy: { updatedAt: 'desc' },
        take: Math.ceil(limit / 4),
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { name: true } }
        }
      })
    ]);

    // Combine and format activities
    const activities: Activity[] = [
      ...recentProjects.map(project => ({
        id: `project-${project.id}`,
        type: "project" as const,
        action: project.createdAt.getTime() === project.updatedAt.getTime() ? "created" as const : "updated" as const,
        itemName: project.name || `Project ${project.id}`,
        timestamp: project.updatedAt.toISOString(),
        userId: userId,
        userName: project.owner.name || "Unknown User"
      })),

      ...recentDrawings.map(drawing => ({
        id: `drawing-${drawing.id}`,
        type: "drawing" as const,
        action: drawing.createdAt.getTime() === drawing.updatedAt.getTime() ? "created" as const : "updated" as const,
        itemName: drawing.name || `Drawing ${drawing.id}`,
        timestamp: drawing.updatedAt.toISOString(),
        userId: userId,
        userName: drawing.project.owner.name || "Unknown User"
      })),

      ...recentComponents.map(component => ({
        id: `component-${component.id}`,
        type: "component" as const,
        action: component.createdAt.getTime() === component.updatedAt.getTime() ? "created" as const : "updated" as const,
        itemName: component.name || `Component ${component.id}`,
        timestamp: component.updatedAt.toISOString(),
        userId: userId,
        userName: component.project.owner.name || "Unknown User"
      })),

      ...recentToolpaths.map(toolpath => ({
        id: `toolpath-${toolpath.id}`,
        type: "tool" as const,
        action: toolpath.createdAt.getTime() === toolpath.updatedAt.getTime() ? "created" as const : "updated" as const,
        itemName: toolpath.name || `Toolpath ${toolpath.id}`,
        timestamp: toolpath.updatedAt.toISOString(),
        userId: userId,
        userName: toolpath.user.name || "Unknown User"
      }))
    ];

    // Sort by timestamp (most recent first) and limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    res.status(200).json(sortedActivities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 