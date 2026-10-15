/**
 * Local Studio API. Opens the same SQLite file Drizzle migrates
 * (`data/cadcamfun.db`, or `CADCAMFUN_DB` / `DATABASE_URL`) and checks
 * passwords the way the sidecar does (`Bun.password`, bcrypt).
 */
import { Database } from "bun:sqlite"
import { userTable, projectTable, sessionTable, drawingTable, toolpathTable } from "@cadcamfun/db/schema"
import { count, desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const PORT = 4396
const COOKIE = "cadcamfun-studio"
const root = resolve(import.meta.dir, "../../..")
const dbPath =
  process.env.CADCAMFUN_DB ??
  process.env.DATABASE_URL?.replace(/^file:/, "") ??
  resolve(root, "data/cadcamfun.db")

const sqlite = existsSync(dbPath) ? new Database(dbPath) : null
if (sqlite) {
  sqlite.run("PRAGMA foreign_keys = ON")
}
const db = sqlite ? drizzle({ client: sqlite, schema: { userTable, projectTable, sessionTable, drawingTable, toolpathTable } }) : null

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? ""
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null
}

async function sessionUser(request: Request) {
  if (!db) return null
  const token = readCookie(request)
  if (!token) return null
  const [session] = await db.select().from(sessionTable).where(eq(sessionTable.token, token)).limit(1)
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  const [user] = await db
    .select({ id: userTable.id, email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, session.userId))
    .limit(1)
  return user ?? null
}

try {
  Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    if (!db) {
      return json({ error: `No SQLite file at ${dbPath}. Run bun run db:migrate from the repo root.` }, 503)
    }

    if (url.pathname === "/studio/api/session" && request.method === "GET") {
      const user = await sessionUser(request)
      if (!user) return json({ error: "Sign in required" }, 401)
      return json({ user })
    }

    if (url.pathname === "/studio/api/overview" && request.method === "GET") {
      const user = await sessionUser(request)
      if (!user) return json({ error: "Sign in required" }, 401)
      const [users] = await db.select({ n: count() }).from(userTable)
      const [projects] = await db.select({ n: count() }).from(projectTable)
      const [drawings] = await db.select({ n: count() }).from(drawingTable)
      const [toolpaths] = await db.select({ n: count() }).from(toolpathTable)
      const recent = await db
        .select({ id: projectTable.id, name: projectTable.name, updatedAt: projectTable.updatedAt })
        .from(projectTable)
        .orderBy(desc(projectTable.updatedAt))
        .limit(8)
      return json({
        user,
        database: dbPath,
        counts: {
          users: users?.n ?? 0,
          projects: projects?.n ?? 0,
          drawings: drawings?.n ?? 0,
          toolpaths: toolpaths?.n ?? 0,
        },
        projects: recent.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      })
    }

    if (url.pathname === "/studio/api/login" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null
      const email = body?.email?.trim() ?? ""
      const password = body?.password ?? ""
      if (!email || !password) return json({ error: "Email and password are required" }, 400)
      const [user] = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1)
      if (!user?.password) return json({ error: "Email or password is wrong" }, 401)
      const ok = await Bun.password.verify(password, user.password).catch(() => false)
      if (!ok) return json({ error: "Email or password is wrong" }, 401)
      const token = crypto.randomUUID()
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
      await db.insert(sessionTable).values({
        id: crypto.randomUUID(),
        token,
        userId: user.id,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      return json(
        { user: { id: user.id, email: user.email, name: user.name } },
        200,
        { "set-cookie": `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}` },
      )
    }

    if (url.pathname === "/studio/api/logout" && request.method === "POST") {
      const token = readCookie(request)
      if (token) await db.delete(sessionTable).where(eq(sessionTable.token, token))
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
    }

    return json({ error: "Not found" }, 404)
  },
})
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
  if (code === "EADDRINUSE") {
    console.log(`Studio API already listening on http://127.0.0.1:${PORT}`)
    process.exit(0)
  }
  throw error
}

console.log(`Studio API on http://127.0.0.1:${PORT} (${sqlite ? dbPath : "database missing"})`)
