/**
 * Every route in the table mounts over the real sidecar handlers (no browser, no fake API).
 * A page that is still a generated `PageStub` must render the stub, and a ported page must
 * not, so this file keeps the route table and the page files honest.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const read = (rel: string) => readFileSync(join(import.meta.dir, "../src", rel), "utf8")
const table = [...read("app/routes.tsx").matchAll(/path: "([^"]+)", component: lazy\(\(\) => import\("\.\.\/pages\/([^"]+)"\)\)/g)]
  .map((m) => ({ path: m[1]!, file: m[2]! }))
/** A page file is a stub when it renders `PageStub`; ported pages re-export or build a screen. */
const isStub = (file: string) => read(`pages/${file}`).includes("PageStub")
const concrete = (pattern: string) => pattern.replace(/:\w+/g, "sample-id")

describe("route table", () => {
  test("covers every legacy page", () => { expect(table.length).toBe(66) })

  for (const route of table.filter((r) => r.path !== "*")) {
    test(`${route.path} mounts`, async () => {
      const { root, dispose } = app.visit(concrete(route.path))
      try {
        await app.wait(() => root.querySelector("main, section, h1, article, form, div[role=alert]"))
        await new Promise((r) => setTimeout(r, 50))
        expect((root.textContent ?? "").includes("Not ported yet")).toBe(isStub(route.file))
      } finally { dispose() }
    })
  }

  test("no page is left as a stub", () => {
    expect(table.filter((r) => isStub(r.file)).map((r) => r.path)).toEqual([])
  })
})
