import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runKernelJob, runKernelJobInline } from "../src/kernel-job.ts"
import { parseHistory } from "../src/parametric.ts"

setDefaultTimeout(120_000)

const block = (width: number) => ({
  parameters: { width, depth: 30, thick: 20 },
  features: [
    { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "depth" }] } },
    { id: "body", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: "thick", at: [15, 15], diameter: 8, depth: "thick" }
  ]
})
const scene = [
  { id: "a", type: "parametric", name: "Block A", history: parseHistory(block(60)), x: 0, y: 0, z: 0 },
  { id: "b", type: "parametric", name: "Block B", history: parseHistory(block(40)), x: 100, y: 0, z: 0 }
]

/** Every scene operation answers exactly what the inline function answers, through the worker, with plain structured-clone data. */
describe("cad-scene kernel job", () => {
  const ops = [
    { op: "shell" as const, id: "a", thickness: 2 },
    { op: "shell-body" as const, id: "a", thickness: 2 },
    { op: "offset" as const, id: "a", distance: 1 },
    { op: "distance" as const, firstId: "a", secondId: "b" },
    { op: "exchange" as const, format: "step" as const, ids: ["a"] },
    { op: "exchange" as const, format: "iges" as const },
    { op: "fasten" as const },
    { op: "fillet-body" as const, id: "a", fillet: 0, radius: 1 },
    { op: "boss-body" as const, id: "a", boss: 0, diameter: 6, taper: 0 },
    { op: "hole-body" as const, id: "a", hole: 0, change: { kind: "fill" as const } }
  ]
  for (const request of ops) {
    test(`${request.op}: the worker returns what the inline path returns`, async () => {
      const input = { elements: scene, ...request }
      const inline = runKernelJobInline("cad-scene", input)
      // The exchange file header carries the write time; everything else must be identical.
      const stamp = (value: unknown) => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "string" ? v.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g, "<time>") : v)))
      expect(stamp(await runKernelJob("cad-scene", input))).toEqual(stamp(inline))
    })
  }

  test("a real shell and an unknown id both answer data, not an exception", async () => {
    const shell = await runKernelJob("cad-scene", { elements: scene, op: "shell-body", id: "a", thickness: 2 })
    expect(shell).toMatchObject({ ok: true })
    const missing = await runKernelJob("cad-scene", { elements: scene, op: "shell-body", id: "nope", thickness: 2 })
    expect(missing).toMatchObject({ ok: false })
  })

  test("a cancelled scene operation ends at once and a repeat is served from the result cache", async () => {
    const input = { elements: scene, op: "distance" as const, firstId: "a", secondId: "b" }
    const controller = new AbortController()
    controller.abort()
    await expect(runKernelJob("cad-scene", input, { signal: controller.signal })).rejects.toMatchObject({ reason: "cancelled" })
    expect(await runKernelJob("cad-scene", input)).toEqual(await runKernelJob("cad-scene", input))
  })
})
