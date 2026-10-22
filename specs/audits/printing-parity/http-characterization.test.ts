import { beforeAll, afterAll, test, expect } from "bun:test"
import { makeApp } from "../../../apps/sidecar/test/helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const cube = { id: "cube", type: "cube", x: 0, y: 0, z: 0.5, width: 20, height: 20, depth: 1 }
const post = (patch: Record<string, unknown> = {}, element = cube) => app.call("/api/toolpaths/generate", { method: "POST", auth: true, json: {
  settings: { machineType: "3dprinter", operationType: "standard", toolType: "standard", ...patch },
  geometry: { geometryType: "selected", selectedElements: [element] }
} })

test("HTTP returns 200 and passed evidence for an oversized printer build", async () => {
  const res = await post({ bedWidth: 10, bedDepth: 10, buildHeight: 0.5 })
  expect(res.status).toBe(200)
  expect(res.body.warnings).toEqual([])
  expect(res.body.evidence.result).toBe("passed")
  console.log(`AUDIT HTTP oversized: status=${res.status}; warnings=${JSON.stringify(res.body.warnings)}; evidence=${res.body.evidence.result}`)
})

test("HTTP accepts cross-machine operation and tool combinations", async () => {
  const res = await post({ operationType: "pocket", toolType: "endmill" })
  expect(res.status).toBe(200)
  expect(res.body.gcode).toContain("Print Start G-code")
  console.log(`AUDIT HTTP incompatible printer/pocket/endmill: status=${res.status}`)
})

test("HTTP parse has extrusion track; generate returns no track", async () => {
  const generated = await post()
  expect(generated.status).toBe(200)
  expect(generated.body.motion).toBeUndefined()
  const parsed = await app.call("/api/toolpaths/parse", { method: "POST", auth: true, json: { gcode: generated.body.gcode } })
  expect(parsed.status).toBe(200)
  expect(parsed.body.motion.paths.some((p: { extrude?: number[] }) => p.extrude?.some(e => e > 0))).toBe(true)
  console.log("AUDIT HTTP extrusion track: generate=absent; parse=present")
})
