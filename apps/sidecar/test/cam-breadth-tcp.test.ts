import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamKernelResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

// The panel's breadth switches, its tip-control switch and the vendor machine presets, over the route the desktop calls.
setDefaultTimeout(110_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const post = (json: unknown) => app.call("/api/toolpaths/manufacture", { method: "POST", json })
const artifactOf = async (json: unknown) => {
  const response = await post(json)
  if (response.status !== 200) throw new Error(JSON.stringify(response.body).slice(0, 600))
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
  return result.value
}

const plate = {
  id: "p", type: "parametric", name: "Plate", x: 0, y: 0, z: 0,
  history: {
    parameters: {},
    features: [
      { id: "base", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "baser", kind: "rectangle", at: [0, 0], width: 80, height: 50 }] } },
      { id: "plate", type: "extrude", sketch: "base", depth: 12, operation: "new" },
      { id: "c", type: "hole", plane: "XY", offset: 12, at: [30, 25], diameter: 5, depth: 12, kind: "countersink", headDiameter: 10, angle: 90 }
    ]
  }
}
const plateRequest = { schemaVersion: 1, id: "breadth-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [plate], resolution: 0.5, stock: { x: 40, y: 25, width: 84, height: 54, depth: 13 } }

test("breadth is part of the request contract and its decisions come back in the notes with their rule", async () => {
  expect((await post({ ...plateRequest, breadth: { holeCycles: "yes" } })).status).toBe(400)
  const off = await artifactOf(plateRequest)
  expect(off.notes.some((n) => n.startsWith("H1-countersink-cycle"))).toBe(false)
  const on = await artifactOf({ ...plateRequest, breadth: { holeCycles: true, tilted: true } })
  expect(on.notes).toContainEqual(expect.stringMatching(/^H1-countersink-cycle: c planned/))
  expect(on.notes).toContainEqual(expect.stringMatching(/^Tilted drilling needs a five-axis machine/))
})

const dome = [
  { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 },
  { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
]
const domeRequest = {
  schemaVersion: 1, id: "tcp-job", name: "Dome", material: "6061", machine: "trunnion-5ax", elements: dome, resolution: 0.4,
  stock: { x: 0, y: 0, width: 44, height: 44, depth: 17 },
  operations: [{ id: "five-finish", strategy: "multiaxis", tool: "ball-10", top: 17, stepover: 20, toolAxis: "normal" }]
}

test("tcp is part of the request contract: the tip-control word is written and the verdicts are the machine-coordinate job's", async () => {
  expect((await post({ ...domeRequest, tcp: "yes" })).status).toBe(400)
  const off = await artifactOf(domeRequest)
  const on = await artifactOf({ ...domeRequest, tcp: true })
  expect(on.nc).toMatch(/^G43\.4 H\d+$/m)
  expect(off.nc).not.toContain("G43.4")
  expect(on.release).toBe(off.release)
  expect(on.claims.map((c) => [c.id, c.status])).toEqual(off.claims.map((c) => [c.id, c.status]))
})

test("tcp on a three-axis machine is refused with the reason in an error issue", async () => {
  const refused = await artifactOf({ ...plateRequest, tcp: true })
  const issue = refused.issues.find((i) => i.severity === "error" && i.message.startsWith("tcp: true refused"))
  expect(issue?.message).toMatch(/no five-axis table/)
  expect(refused.nc).toBe("")
  expect(refused.release).toBe("blocked")
})

test("a Mitsubishi machine preset runs a job and the artifact names its post", async () => {
  const run = await artifactOf({ ...plateRequest, machine: "mitsubishi-vmc" })
  expect(run.machine.post).toBe("mitsubishi")
  expect(run.nc.length).toBeGreaterThan(100)
  expect(run.issues.filter((i) => i.severity === "error")).toEqual([])
  const brother = await artifactOf({ ...plateRequest, machine: "brother-speedio" })
  expect(brother.machine.post).toBe("brother")
  expect(brother.nc).toMatch(/^G100 T\d+ M6$/m)
})
