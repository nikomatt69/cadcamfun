import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamVerifyNcResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({
  positions: [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
})
const flat = { id: "f6", name: "flat 6", kind: "flat", diameter: 6, flutes: 3, material: "carbide", coating: "none", fluteLength: 20, shankDiameter: 6, stickout: 30 }
// A 20 x 20 x 10 block in a stock 3 mm proud on every side; the 6 mm flat clears the ring at offset `o` from the wall.
const ring = (o: number): string => ["G21 G90 G54", "T1 M6", "S10000 M3", "G0 Z15", `G0 X${-o} Y${-o}`, "G1 Z-1 F300", `G1 X${20 + o} F800`, `G1 Y${20 + o}`, `G1 X${-o}`, `G1 Y${-o}`, "G0 Z15", "M30"].join("\n")
const body = (nc: string, over: Record<string, unknown> = {}) => ({
  nc, part: [box(0, 0, 0, 20, 20, 10)], stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 23, y: 23, z: 10 } },
  tools: [{ number: 1, cutter: flat }], tolerance: 0.005, cell: 0.05, ...over
})
const post = (json: unknown, auth = true) => app.call("/api/toolpaths/verify-nc", { method: "POST", json, auth })

test("the verify-nc route is authenticated and refuses a body without a program", async () => {
  expect((await post(body(ring(3)), false)).status).toBe(401)
  expect((await post({})).status).toBe(400)
})

test("a clean hand-written program verifies over HTTP", async () => {
  const response = await post(body(ring(3)))
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamVerifyNcResult)(response.body)
  expect(result.verdict).toBe("clean")
  expect(result.complete).toBe(true)
  expect(result.findings).toEqual([])
  expect(result.feedMoves).toBe(5)
})

test("an overcut of 0.1 mm comes back as a gouge with the NC line that made it", async () => {
  const result = Schema.decodeUnknownSync(CamVerifyNcResult)((await post(body(ring(2.9)))).body)
  expect(result.verdict).toBe("faults")
  const gouge = result.findings.find((f) => f.kind === "gouge")
  expect(gouge?.line).toBeGreaterThan(0)
  expect(result.gouge.depth).toBeGreaterThan(0.05)
})

test("a rapid through the stock and a move outside the travel are reported", async () => {
  const nc = ["G21 G90", "T1 M6", "S10000 M3", "G0 Z15", "G0 X-5 Y10", "G0 Z-2", "G0 X30", "G0 Z15", "M30"].join("\n")
  const result = Schema.decodeUnknownSync(CamVerifyNcResult)((await post(body(nc, { machine: { travel: { minX: -50, maxX: 25, minY: -50, maxY: 50, minZ: -50, maxZ: 50 } } }))).body)
  expect(result.verdict).toBe("faults")
  expect(result.findings.some((f) => f.kind === "rapid-in-stock")).toBe(true)
  expect(result.findings.some((f) => f.kind === "travel")).toBe(true)
})

test("a program with a tool the caller did not describe has no verdict", async () => {
  const nc = ring(3).replace("T1 M6", "T7 M6")
  const result = Schema.decodeUnknownSync(CamVerifyNcResult)((await post(body(nc))).body)
  expect(result.verdict).toBe("incomplete")
  expect(result.findings.some((f) => f.kind === "unknown-tool")).toBe(true)
})

test("a mesh that points past its vertices and a flat stock are 400s that say why", async () => {
  const broken = await post(body(ring(3), { part: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 9] }] }))
  expect(broken.status).toBe(400)
  expect(JSON.stringify(broken.body)).toContain("past the 3 vertices")
  const flatStock = await post(body(ring(3), { stock: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } } }))
  expect(flatStock.status).toBe(400)
})
