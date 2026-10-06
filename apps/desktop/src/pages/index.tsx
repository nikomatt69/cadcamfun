/**
 * Home — the dashboard container.
 *
 * The screen itself is pure (it takes `data` + `loading`), so this page owns the read:
 * `GET /api/analytics/dashboard-data` through the typed client, mapped onto the flat
 * counters the metric cards and the system card show.
 */
import type { JSX } from "solid-js"
import { DashboardScreen, type DashboardData } from "../screens/dashboard.tsx"
import { useRead } from "../app/queries.ts"

const EMPTY: DashboardData = {
  projectsCount: undefined,
  drawingsCount: undefined,
  componentsCount: undefined,
  toolsCount: undefined,
  materialsCount: undefined,
  materialsLowStock: undefined,
  activeProjects: undefined,
  recentComponents: undefined
}

export default function Page(): JSX.Element {
  const stats = useRead((c) => c.analytics.dashboardData())
  const data = (): DashboardData => {
    const reply = stats.data()
    if (reply === undefined) return EMPTY
    return {
      projectsCount: reply.projects.total,
      drawingsCount: undefined,
      componentsCount: reply.components.total,
      toolsCount: reply.tools.total,
      materialsCount: reply.materials.total,
      materialsLowStock: reply.materials.lowStock,
      activeProjects: reply.projects.activeProjects,
      recentComponents: reply.components.recentActivity
    }
  }
  return <DashboardScreen data={data()} loading={stats.loading()} />
}
