/**
 * Local Studio API. Opens the same SQLite file Drizzle migrates
 * (`data/cadcamfun.db`, or `CADCAMFUN_DB` / `DATABASE_URL`) and checks
 * passwords the way the sidecar does (`Bun.password`, bcrypt).
 *
 * Account edits write the same tables the desktop user API uses:
 * `User`, credential `Account` rows, `ApiKey`, and `GitProfile`.
 */
import { Database } from "bun:sqlite"
import { createHash, randomBytes } from "node:crypto"
import { accountTable, apiKeyTable, drawingTable, gitProfileTable, projectTable, sessionTable, toolpathTable, userTable } from "@cadcamfun/db/schema"
import { and, count, desc, eq } from "drizzle-orm"
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

const schema = { accountTable, apiKeyTable, drawingTable, gitProfileTable, projectTable, sessionTable, toolpathTable, userTable }
const sqlite = existsSync(dbPath) ? new Database(dbPath) : null
if (sqlite) sqlite.run("PRAGMA foreign_keys = ON")
const db = sqlite ? drizzle({ client: sqlite, schema }) : null

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

function cookie(token: string, maxAge: number) {
  return { "set-cookie": `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` }
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

function isValidUrl(url: string) {
  return URL.canParse(url.startsWith("http") ? url : `https://${url}`)
}

function clean(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value == null) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false }
  return { ok: true, value: trimmed }
}

function asBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

async function profileOf(userId: string) {
  if (!db) return null
  const [row] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      bio: userTable.bio,
      location: userTable.location,
      website: userTable.website,
      company: userTable.company,
      title: userTable.title,
      publicProfile: userTable.publicProfile,
      showEmail: userTable.showEmail,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  return row ?? null
}

async function gitOf(userId: string) {
  if (!db) return null
  const [row] = await db
    .select({ name: gitProfileTable.name, email: gitProfileTable.email })
    .from(gitProfileTable)
    .where(eq(gitProfileTable.userId, userId))
    .limit(1)
  return row ?? null
}

async function keysOf(userId: string) {
  if (!db) return []
  const rows = await db
    .select({
      id: apiKeyTable.id,
      name: apiKeyTable.name,
      createdAt: apiKeyTable.createdAt,
      lastUsed: apiKeyTable.lastUsed,
      expiresAt: apiKeyTable.expiresAt,
    })
    .from(apiKeyTable)
    .where(eq(apiKeyTable.userId, userId))
    .orderBy(desc(apiKeyTable.createdAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsed: row.lastUsed?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }))
}

try {
  Bun.serve({
    hostname: "127.0.0.1",
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url)
      if (!db) return json({ error: `No SQLite file at ${dbPath}. Run bun run db:migrate from the repo root.` }, 503)

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

      if (url.pathname === "/studio/api/account" && request.method === "GET") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const profile = await profileOf(user.id)
        if (!profile) return json({ error: "User not found" }, 404)
        return json({ profile, git: await gitOf(user.id), apiKeys: await keysOf(user.id) })
      }

      if (url.pathname === "/studio/api/profile" && request.method === "PUT") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        const name = typeof body?.name === "string" ? body.name.trim() : ""
        if (!name) return json({ error: "Name is required" }, 400)
        if (name.length > 100) return json({ error: "Name must be less than 100 characters" }, 400)
        const bio = clean(body?.bio, 500)
        const location = clean(body?.location, 200)
        const website = clean(body?.website, 300)
        const company = clean(body?.company, 200)
        const title = clean(body?.title, 200)
        if (!bio.ok) return json({ error: "Bio must be less than 500 characters" }, 400)
        if (!location.ok || !website.ok || !company.ok || !title.ok) return json({ error: "A profile field is too long" }, 400)
        if (website.value && !isValidUrl(website.value)) return json({ error: "Invalid website URL" }, 400)
        const current = await profileOf(user.id)
        if (!current) return json({ error: "User not found" }, 404)
        await db.update(userTable).set({
          name,
          bio: bio.value,
          location: location.value,
          website: website.value,
          company: company.value,
          title: title.value,
          publicProfile: asBool(body?.publicProfile, current.publicProfile),
          showEmail: asBool(body?.showEmail, current.showEmail),
          updatedAt: new Date(),
        }).where(eq(userTable.id, user.id))
        return json({ profile: await profileOf(user.id) })
      }

      if (url.pathname === "/studio/api/password" && request.method === "PUT") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null
        const currentPassword = body?.currentPassword ?? ""
        const newPassword = body?.newPassword ?? ""
        if (!currentPassword || !newPassword) return json({ error: "Current password and new password are required" }, 400)
        if (newPassword.length < 8) return json({ error: "New password must be at least 8 characters long" }, 400)
        const [row] = await db.select({ password: userTable.password }).from(userTable).where(eq(userTable.id, user.id)).limit(1)
        if (!row?.password) return json({ error: "No password is set for this account" }, 400)
        const valid = await Bun.password.verify(currentPassword, row.password).catch(() => false)
        if (!valid) return json({ error: "Current password is invalid" }, 400)
        const hash = await Bun.password.hash(newPassword, { algorithm: "bcrypt", cost: 12 })
        const now = new Date()
        await db.update(userTable).set({ password: hash, updatedAt: now }).where(eq(userTable.id, user.id))
        await db.update(accountTable).set({ password: hash, updatedAt: now }).where(and(eq(accountTable.userId, user.id), eq(accountTable.providerId, "credential")))
        return json({ message: "Password updated" })
      }

      if (url.pathname === "/studio/api/git-profile" && request.method === "PUT") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const body = (await request.json().catch(() => null)) as { name?: string; email?: string } | null
        const name = body?.name?.trim() ?? ""
        const email = body?.email?.trim() ?? ""
        if (!name || name.length > 100) return json({ error: "Name is required" }, 400)
        if (!email || email.length > 254 || !email.includes("@") || /\s/.test(email)) return json({ error: "A valid email is required" }, 400)
        const now = new Date()
        const existing = await gitOf(user.id)
        if (existing) {
          await db.update(gitProfileTable).set({ name, email, updatedAt: now }).where(eq(gitProfileTable.userId, user.id))
        } else {
          await db.insert(gitProfileTable).values({ userId: user.id, name, email, createdAt: now, updatedAt: now })
        }
        return json({ git: { name, email } })
      }

      if (url.pathname === "/studio/api/api-keys" && request.method === "POST") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const body = (await request.json().catch(() => null)) as { name?: string } | null
        const name = body?.name?.trim() ?? ""
        if (!name || name.length > 100) return json({ error: "Key name is required" }, 400)
        const apiKey = `cad_${randomBytes(24).toString("hex")}`
        await db.insert(apiKeyTable).values({
          name,
          keyHash: createHash("sha256").update(apiKey).digest("hex"),
          userId: user.id,
        })
        return json({ apiKey, name, apiKeys: await keysOf(user.id) }, 201)
      }

      if (url.pathname === "/studio/api/api-keys" && request.method === "DELETE") {
        const user = await sessionUser(request)
        if (!user) return json({ error: "Sign in required" }, 401)
        const keyId = url.searchParams.get("keyId") ?? ""
        if (!keyId) return json({ error: "Key ID is required" }, 400)
        const removed = await db.delete(apiKeyTable).where(and(eq(apiKeyTable.id, keyId), eq(apiKeyTable.userId, user.id))).returning({ id: apiKeyTable.id })
        if (removed.length === 0) return json({ error: "API key not found" }, 404)
        return json({ apiKeys: await keysOf(user.id) })
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
        return json({ user: { id: user.id, email: user.email, name: user.name } }, 200, cookie(token, 7 * 24 * 3600))
      }

      if (url.pathname === "/studio/api/logout" && request.method === "POST") {
        const token = readCookie(request)
        if (token) await db.delete(sessionTable).where(eq(sessionTable.token, token))
        return json({ ok: true }, 200, cookie("", 0))
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
