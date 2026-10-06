import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export interface ActivityFilters {
  userIds?: ReadonlyArray<string> | undefined
  itemType?: ReadonlyArray<string> | undefined
  action?: ReadonlyArray<string> | undefined
  startDate?: Date | undefined
  endDate?: Date | undefined
}

const A = schema.activityLogTable
const where = (f: ActivityFilters): SQL | undefined => and(
  f.userIds?.length ? inArray(A.userId, [...f.userIds]) : undefined,
  f.itemType?.length ? inArray(A.itemType, [...f.itemType]) : undefined,
  f.action?.length ? inArray(A.action, [...f.action]) : undefined,
  f.startDate ? gte(A.timestamp, f.startDate) : undefined,
  f.endDate ? lte(A.timestamp, f.endDate) : undefined
)

const MONTH = 30 * 24 * 60 * 60 * 1000
const WEEK = 7 * 24 * 60 * 60 * 1000
const trend = (recent: number, total: number) => (total > 0 ? Math.round((recent / total) * 100) : 0)

/** SQLite flavour of `DATE_TRUNC`: the bucket start (Monday for weeks) as `YYYY-MM-DD`. */
const bucket = (column: string, groupBy: string): string =>
  groupBy === "week" ? `date(${column} / 1000, 'unixepoch', 'weekday 0', '-6 days')`
    : groupBy === "month" ? `strftime('%Y-%m-01', ${column} / 1000, 'unixepoch')`
    : `strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`

const SERIES: Record<string, { from: string; value: string; column: string; owner: (u: string) => string }> = {
  aiRequests: { from: `"AIAnalysisLog" t`, value: "COUNT(*)", column: `t."createdAt"`, owner: (u) => `t."userId" = '${u}'` },
  cadDrawings: { from: `"Drawing" t JOIN "Project" p ON t."projectId" = p.id`, value: "COUNT(DISTINCT t.id)", column: `t."createdAt"`,
    owner: (u) => `(p."ownerId" = '${u}' OR p."organizationId" IN (SELECT "organizationId" FROM "UserOrganization" WHERE "userId" = '${u}'))` },
  projects: { from: `"Project" t`, value: "COUNT(DISTINCT t.id)", column: `t."createdAt"`,
    owner: (u) => `(t."ownerId" = '${u}' OR t."organizationId" IN (SELECT "organizationId" FROM "UserOrganization" WHERE "userId" = '${u}'))` },
  components: { from: `"Component" t JOIN "Project" p ON t."projectId" = p.id`, value: "COUNT(DISTINCT t.id)", column: `t."createdAt"`,
    owner: (u) => `(p."ownerId" = '${u}' OR p."organizationId" IN (SELECT "organizationId" FROM "UserOrganization" WHERE "userId" = '${u}'))` },
  toolpaths: { from: `"Toolpath" t`, value: "COUNT(*)", column: `t."createdAt"`, owner: (u) => `t."createdBy" = '${u}'` },
  storageUsage: { from: `"FileUpload" t`, value: `SUM(t."s3Size")`, column: `t."createdAt"`, owner: (u) => `t."ownerId" = '${u}'` }
}
const lit = (s: string) => s.replaceAll("'", "''")

export class AnalyticsRepo extends Context.Service<AnalyticsRepo, {
  logActivity(input: { userId: string; itemId: string; itemType: string; action: string; details: unknown }): Effect.Effect<void, DatabaseError>
  statistics(filters: ActivityFilters): Effect.Effect<{ countByType: Array<{ itemType: string; _count: number }>; countByAction: Array<{ action: string; _count: number }> }, DatabaseError>
  history(userId: string, limit: number, offset: number, filters: ActivityFilters): Effect.Effect<{ logs: unknown[]; total: number }, DatabaseError>
  dashboard(userId: string): Effect.Effect<{
    components: { total: number; trend: number; recentActivity: number }; projects: { total: number; trend: number; activeProjects: number }
    tools: { total: number; trend: number; mostUsed: string }; materials: { total: number; trend: number; lowStock: number }
  }, DatabaseError>
  recent(userId: string, limit: number): Effect.Effect<unknown[], DatabaseError>
  metrics(userId: string, input: { metric: string; groupBy: string; start: Date; end: Date; itemType: ReadonlyArray<string>; action: ReadonlyArray<string> }): Effect.Effect<{
    summary: Record<string, number>; series: Array<{ date: string; value: number }>
  }, DatabaseError>
  userEmail(userId: string): Effect.Effect<string | null, DatabaseError>
}>()("cadcamfun/AnalyticsRepo") {
  static readonly layer = Layer.effect(AnalyticsRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const P = schema.projectTable
    const owned = (db: Parameters<Parameters<typeof query>[1]>[0], userId: string) => db.select({ id: P.id }).from(P).where(eq(P.ownerId, userId))
    return AnalyticsRepo.of({
      logActivity: Effect.fn("AnalyticsRepo.logActivity")(function*(input) {
        yield* query("analytics.logActivity", async (db) => {
          await db.insert(A).values({
            userId: input.userId, itemId: input.itemId, itemType: input.itemType, action: input.action,
            details: input.details === undefined ? {} : input.details
          })
        })
      }),
      statistics: (filters) => query("analytics.statistics", async (db) => {
        const w = where(filters)
        const byType = await db.select({ itemType: A.itemType, n: count() }).from(A).where(w).groupBy(A.itemType)
        const byAction = await db.select({ action: A.action, n: count() }).from(A).where(w).groupBy(A.action)
        return {
          countByType: byType.map((r) => ({ itemType: r.itemType, _count: r.n })),
          countByAction: byAction.map((r) => ({ action: r.action, _count: r.n }))
        }
      }),
      history: (userId, limit, offset, filters) => query("analytics.history", async (db) => {
        const w = where({ ...filters, userIds: [userId] })
        const rows = await db.select().from(A).where(w).orderBy(desc(A.timestamp)).limit(limit).offset(offset)
        const [me] = await db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email, image: schema.userTable.image })
          .from(schema.userTable).where(eq(schema.userTable.id, userId)).limit(1)
        const [total] = await db.select({ n: count() }).from(A).where(w)
        return { logs: rows.map((r) => ({ ...r, timestamp: r.timestamp.toISOString(), user: me ?? null })), total: total?.n ?? 0 }
      }),
      dashboard: (userId) => query("analytics.dashboard", async (db) => {
        const now = Date.now()
        const lastMonth = new Date(now - MONTH)
        const lastWeek = new Date(now - WEEK)
        const n = async (table: typeof schema.componentTable | typeof schema.drawingTable, since?: Date) => {
          const [r] = await db.select({ n: count() }).from(table as typeof schema.componentTable)
            .where(and(inArray(table.projectId, owned(db, userId)), since ? gte(table.createdAt, since) : undefined))
          return r?.n ?? 0
        }
        const C = schema.componentTable, D = schema.drawingTable, T = schema.toolpathTable
        const [components, componentsMonth, componentsWeek, drawings, drawingsMonth] = await Promise.all([n(C), n(C, lastMonth), n(C, lastWeek), n(D), n(D, lastMonth)])
        const [projects] = await db.select({ n: count() }).from(P).where(eq(P.ownerId, userId))
        const [projectsMonth] = await db.select({ n: count() }).from(P).where(and(eq(P.ownerId, userId), gte(P.createdAt, lastMonth)))
        const [active] = await db.select({ n: count() }).from(P).where(and(eq(P.ownerId, userId), gte(P.updatedAt, lastWeek)))
        const [toolpaths] = await db.select({ n: count() }).from(T).where(eq(T.createdBy, userId))
        const [toolpathsMonth] = await db.select({ n: count() }).from(T).where(and(eq(T.createdBy, userId), gte(T.createdAt, lastMonth)))
        const [most] = await db.select({ name: T.name, n: count() }).from(T).where(eq(T.createdBy, userId)).groupBy(T.name).orderBy(desc(count())).limit(1)
        return {
          components: { total: components, trend: trend(componentsMonth, components), recentActivity: componentsWeek },
          projects: { total: projects?.n ?? 0, trend: trend(projectsMonth?.n ?? 0, projects?.n ?? 0), activeProjects: active?.n ?? 0 },
          tools: { total: toolpaths?.n ?? 0, trend: trend(toolpathsMonth?.n ?? 0, toolpaths?.n ?? 0), mostUsed: most?.name ?? "No tools used yet" },
          materials: { total: drawings, trend: trend(drawingsMonth, drawings), lowStock: 0 }
        }
      }),
      recent: (userId, limit) => query("analytics.recent", async (db) => {
        const take = Math.ceil(limit / 4)
        const [me] = await db.select({ name: schema.userTable.name }).from(schema.userTable).where(eq(schema.userTable.id, userId)).limit(1)
        const userName = me?.name || "Unknown User"
        const item = (kind: string, row: { id: string; name: string; createdAt: Date; updatedAt: Date }, fallback: string) => ({
          id: `${kind}-${row.id}`, type: kind === "toolpath" ? "tool" : kind,
          action: row.createdAt.getTime() === row.updatedAt.getTime() ? "created" : "updated",
          itemName: row.name || `${fallback} ${row.id}`, timestamp: row.updatedAt.toISOString(), userId, userName
        })
        const cols = (t: { id: unknown; name: unknown; createdAt: unknown; updatedAt: unknown }) => t
        void cols
        const projects = await db.select({ id: P.id, name: P.name, createdAt: P.createdAt, updatedAt: P.updatedAt }).from(P).where(eq(P.ownerId, userId)).orderBy(desc(P.updatedAt)).limit(take)
        const D = schema.drawingTable, C = schema.componentTable, T = schema.toolpathTable
        const drawings = await db.select({ id: D.id, name: D.name, createdAt: D.createdAt, updatedAt: D.updatedAt }).from(D).where(inArray(D.projectId, owned(db, userId))).orderBy(desc(D.updatedAt)).limit(take)
        const components = await db.select({ id: C.id, name: C.name, createdAt: C.createdAt, updatedAt: C.updatedAt }).from(C).where(inArray(C.projectId, owned(db, userId))).orderBy(desc(C.updatedAt)).limit(take)
        const toolpaths = await db.select({ id: T.id, name: T.name, createdAt: T.createdAt, updatedAt: T.updatedAt }).from(T).where(eq(T.createdBy, userId)).orderBy(desc(T.updatedAt)).limit(take)
        return [
          ...projects.map((r) => item("project", r, "Project")), ...drawings.map((r) => item("drawing", r, "Drawing")),
          ...components.map((r) => item("component", r, "Component")), ...toolpaths.map((r) => item("toolpath", r, "Toolpath"))
        ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit)
      }),
      metrics: (userId, input) => query("analytics.metrics", async (db) => {
        const u = lit(userId)
        const range = (column: string) => `${column} >= ${input.start.getTime()} AND ${column} <= ${input.end.getTime()}`
        const single = async (from: string, cond: string, value = "COUNT(*)") =>
          Number((db.all(sql.raw(`SELECT ${value} AS v FROM ${from} WHERE ${cond}`)) as Array<{ v: number | null }>)[0]?.v ?? 0)
        const s = {
          totalAiRequests: await single(`"AIAnalysisLog" t`, `t."userId" = '${u}' AND ${range(`t."createdAt"`)}`),
          totalCadDrawings: await single(SERIES["cadDrawings"]!.from, `${SERIES["cadDrawings"]!.owner(u)} AND ${range(`t."createdAt"`)}`, "COUNT(DISTINCT t.id)"),
          totalProjects: await single(SERIES["projects"]!.from, `${SERIES["projects"]!.owner(u)} AND ${range(`t."createdAt"`)}`, "COUNT(DISTINCT t.id)"),
          totalComponents: await single(SERIES["components"]!.from, `${SERIES["components"]!.owner(u)} AND ${range(`t."createdAt"`)}`, "COUNT(DISTINCT t.id)"),
          totalToolpaths: await single(`"Toolpath" t`, `t."createdBy" = '${u}' AND ${range(`t."createdAt"`)}`),
          storageBytes: await single(`"FileUpload" t`, `t."ownerId" = '${u}' AND ${range(`t."createdAt"`)}`, `COALESCE(SUM(t."s3Size"), 0)`),
          totalActivityCount: await single(`"ActivityLog" t`, `t."userId" = '${u}' AND ${range(`t."timestamp"`)}`)
        }
        const def = SERIES[input.metric]
        const base = def ?? { from: `"ActivityLog" t`, value: "COUNT(*)", column: `t."timestamp"`, owner: (id: string) => `t."userId" = '${id}'` }
        const extra = def ? "" : [
          input.itemType.length ? ` AND t."itemType" IN (${input.itemType.map((x) => `'${lit(x)}'`).join(",")})` : "",
          input.action.length ? ` AND t."action" IN (${input.action.map((x) => `'${lit(x)}'`).join(",")})` : ""
        ].join("")
        const rows = db.all(sql.raw(
          `SELECT ${bucket(base.column, input.groupBy)} AS date, ${base.value} AS v FROM ${base.from} WHERE ${base.owner(u)} AND ${range(base.column)}${extra} GROUP BY date ORDER BY date ASC`
        )) as Array<{ date: string; v: number | null }>
        return {
          summary: { ...s, totalStorageUsage: Math.round(s.storageBytes / (1024 * 1024)) },
          series: rows.map((r) => ({ date: r.date, value: Number(r.v ?? 0) }))
        }
      }),
      userEmail: (userId) => query("analytics.userEmail", async (db) =>
        (await db.select({ email: schema.userTable.email }).from(schema.userTable).where(eq(schema.userTable.id, userId)).limit(1))[0]?.email ?? null)
    })
  }))
}
