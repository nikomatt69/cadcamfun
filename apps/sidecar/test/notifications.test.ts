import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { decodeCursor, encodeCursor } from "../src/repos/notification-repo.ts"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
const TOTAL = 25

beforeAll(async () => {
  app = await makeApp()
  const me = (await app.call("/api/user/profile")).body.id
  // Created back to back, so several share a millisecond: the id must break the tie for paging to be stable.
  for (let i = 0; i < TOTAL; i++) {
    const created = await app.call("/api/app-control/notify", { method: "POST", json: { userId: me, message: { type: "NEW_MESSAGE", title: `n${i}`, content: "Body" } } })
    expect(created.status).toBe(200)
  }
})
afterAll(async () => { await app.dispose() })

type Page = { notifications: Array<{ id: string; title: string; isRead: boolean }>; unreadCount: number; nextCursor: string | null }
const page = async (query: string): Promise<Page> => {
  const res = await app.call(`/api/notifications${query}`)
  expect(res.status).toBe(200)
  return res.body
}

describe("notification feed", () => {
  test("cursor paging walks every row once, newest first, and ends with a null cursor", async () => {
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const next: Page = await page(`?limit=10${cursor ? `&cursor=${cursor}` : ""}`)
      seen.push(...next.notifications.map((row) => row.id))
      expect(next.unreadCount).toBe(TOTAL)
      cursor = next.nextCursor
      pages++
    } while (cursor !== null && pages < 10)
    expect(pages).toBe(3)
    expect(new Set(seen).size).toBe(TOTAL)
    const all = await page(`?limit=${TOTAL}`)
    expect(all.notifications.map((row) => row.id)).toEqual(seen)
    expect(all.nextCursor).toBeNull()
  })

  test("a notification arriving between pages neither repeats nor shifts the next page", async () => {
    const first = await page("?limit=5")
    const me = (await app.call("/api/user/profile")).body.id
    await app.call("/api/app-control/notify", { method: "POST", json: { userId: me, message: { type: "NEW_MESSAGE", title: "late", content: "Body" } } })
    const second = await page(`?limit=5&cursor=${first.nextCursor}`)
    const ids = new Set(first.notifications.map((row) => row.id))
    expect(second.notifications.some((row) => ids.has(row.id))).toBe(false)
    expect(second.notifications.some((row) => row.title === "late")).toBe(false)
  })

  test("unreadCount counts every unread row whatever the filter; marking read is idempotent", async () => {
    const before = await page("?limit=1&onlyUnread=true")
    const target = before.notifications[0]!
    for (let i = 0; i < 2; i++) {
      const res = await app.call(`/api/notifications/${target.id}`, { method: "PUT", json: { isRead: true } })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: target.id, isRead: true })
    }
    const after = await page("?limit=1")
    expect(after.unreadCount).toBe(before.unreadCount - 1)
    expect((await page("?limit=100&onlyUnread=true")).notifications.some((row) => row.id === target.id)).toBe(false)
    const all = await app.call("/api/notifications/mark-all-read", { method: "POST" })
    expect(all.body.count).toBe(before.unreadCount - 1)
    expect((await app.call("/api/notifications/mark-all-read", { method: "POST" })).body.count).toBe(0)
    expect((await page("")).unreadCount).toBe(0)
  })

  test("malformed paging is a 400 with a message, never a 500", async () => {
    for (const query of ["?limit=abc", "?limit=0", "?limit=101", "?limit=5abc", "?offset=-1", "?offset=1e3", "?offset=10001", "?onlyUnread=yes", "?cursor=***", "?cursor=bm9wZQ", `?cursor=${encodeCursor({ createdAt: 1, id: "x" })}&offset=2`]) {
      const res = await app.call(`/api/notifications${query}`)
      expect({ query, status: res.status }).toEqual({ query, status: 400 })
      expect(typeof res.body.message).toBe("string")
    }
    expect((await app.call("/api/notifications/missing", { method: "PUT", json: { isRead: true } })).status).toBe(404)
    expect((await app.call("/api/notifications/missing", { method: "DELETE" })).status).toBe(404)
  })

  test("cursors round-trip and reject what the server never issued", () => {
    expect(decodeCursor(encodeCursor({ createdAt: 1_700_000_000_000, id: "a:b" }))).toEqual({ createdAt: 1_700_000_000_000, id: "a:b" })
    expect(decodeCursor("")).toBeUndefined()
    expect(decodeCursor(Buffer.from(":x").toString("base64url"))).toBeUndefined()
    expect(decodeCursor(Buffer.from("-1:x").toString("base64url"))).toBeUndefined()
  })
})
