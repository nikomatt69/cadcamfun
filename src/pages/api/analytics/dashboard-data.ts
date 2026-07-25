import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { requireAuth } from "src/lib/api/auth";

interface AnalyticsData {
  components: {
    total: number;
    trend: number;
    recentActivity: number;
  };
  projects: {
    total: number;
    trend: number;
    activeProjects: number;
  };
  tools: {
    total: number;
    trend: number;
    mostUsed: string;
  };
  materials: {
    total: number;
    trend: number;
    lowStock: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyticsData | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Skip auth for now to fix the issues
    const userId = await requireAuth(req, res);

    if (!userId) return
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get component analytics
    const [totalComponents, componentsLastMonth] = await Promise.all([
      prisma.component.count({
        where: {
          project: { ownerId: userId }
        }
      }),
      prisma.component.count({
        where: {
          project: { ownerId: userId },
          createdAt: { gte: lastMonth }
        }
      })
    ]);

    const componentTrend = totalComponents > 0
      ? Math.round((componentsLastMonth / totalComponents) * 100)
      : 0;

    // Get project analytics
    const [totalProjects, projectsLastMonth, activeProjects] = await Promise.all([
      prisma.project.count({
        where: { ownerId: userId }
      }),
      prisma.project.count({
        where: {
          ownerId: userId,
          createdAt: { gte: lastMonth }
        }
      }),
      prisma.project.count({
        where: {
          ownerId: userId,
          updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } // Active in last week
        }
      })
    ]);

    const projectTrend = totalProjects > 0
      ? Math.round((projectsLastMonth / totalProjects) * 100)
      : 0;

    // Get toolpath analytics
    const [totalToolpaths, toolpathsLastMonth] = await Promise.all([
      prisma.toolpath.count({
        where: { createdBy: userId }
      }),
      prisma.toolpath.count({
        where: {
          createdBy: userId,
          createdAt: { gte: lastMonth }
        }
      })
    ]);

    const toolTrend = totalToolpaths > 0
      ? Math.round((toolpathsLastMonth / totalToolpaths) * 100)
      : 0;

    // Get most used tool (simplified - you might want to track tool usage differently)
    const mostUsedTool = await prisma.toolpath.groupBy({
      by: ['name'],
      where: { createdBy: userId },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 1
    });

    // Get material analytics (using drawings as materials proxy)
    const [totalMaterials, materialsLastMonth] = await Promise.all([
      prisma.drawing.count({
        where: {
          project: { ownerId: userId }
        }
      }),
      prisma.drawing.count({
        where: {
          project: { ownerId: userId },
          createdAt: { gte: lastMonth }
        }
      })
    ]);

    const materialTrend = totalMaterials > 0
      ? Math.round((materialsLastMonth / totalMaterials) * 100)
      : 0;

    // Recent activity count (components created in last week)
    const recentActivity = await prisma.component.count({
      where: {
        project: { ownerId: userId },
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    const analyticsData: AnalyticsData = {
      components: {
        total: totalComponents,
        trend: componentTrend,
        recentActivity
      },
      projects: {
        total: totalProjects,
        trend: projectTrend,
        activeProjects
      },
      tools: {
        total: totalToolpaths,
        trend: toolTrend,
        mostUsed: mostUsedTool[0]?.name || "No tools used yet"
      },
      materials: {
        total: totalMaterials,
        trend: materialTrend,
        lowStock: 0 // Would need inventory tracking to implement
      }
    };

    res.status(200).json(analyticsData);
  } catch (error) {
    console.error("Error fetching dashboard analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 