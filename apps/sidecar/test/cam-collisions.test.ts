import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamCollisionsReport } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

/** The collision report over HTTP: the preview's own timeline, set-up and checks (`machine-run.ts`) as a route. */
setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const post = (json: unknown, auth = true) => app.call("/api/toolpaths/collisions", { method: "POST", json, auth })
const report = async (json: unknown) => {
  const response = await post(json)
  expect(response.status).toBe(200)
  return Schema.decodeUnknownSync(CamCollisionsReport)(response.body)
}

test("the route is authenticated and refuses a body without a program", async () => {
  expect((await post({ gcode: "G0 X0" }, false)).status).toBe(401)
  expect((await post({})).status).toBe(400)
  expect((await post({ gcode: "" })).status).toBe(400)
})

test("a rapid into the stock is reported at its NC line and the program is not clear", async () => {
  const found = await report({ gcode: "G21 G90\nG0 X0 Y0 Z5\nG0 Z-4\nM30", params: { stock, workholding: "plate" } })
  expect(found.collisions.map((c) => [c.code, c.severity, c.line])).toEqual([["RAPID_INTO_STOCK", "error", 3]])
  expect(found.clear).toBe(false)
  expect(found.moves).toBeGreaterThan(0)
})

test("a program that cuts beside and across the stock without a rapid through it is clear", async () => {
  const sound = await report({ gcode: "G21 G90\nG0 X-60 Y0 Z5\nG1 Z-5 F200\nG1 X60 F800\nG0 Z5\nM30", params: { stock, workholding: "plate" } })
  expect(sound.collisions.filter((c) => c.severity === "error")).toEqual([])
  expect(sound.clear).toBe(true)
})

test("stock that is not a stock is a 400 that says what it wants", async () => {
  const response = await post({ gcode: "G21 G90\nG0 X0 Y0 Z5\nM30", params: { stock: "big" } })
  expect(response.status).toBe(400)
  expect(JSON.stringify(response.body)).toContain("stock")
})
