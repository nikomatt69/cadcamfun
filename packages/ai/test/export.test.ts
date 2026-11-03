/**
 * `cad_edit.export` and `cam_edit.export` through the catalogue seam: the real kernels write the bytes, a fake host keeps them, and
 * every expected number is analytic or read back from an independent parse of the stored file.
 */
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { buildRecipe, exchange, rebuildExact } from "@cadcamfun/core"
import { decodeHistory } from "../src/parametric.ts"
import { runAction } from "../src/actions/catalogue.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import { clearKernelJobCache, kernelJobStats, runKernelJob, runKernelJobInline } from "../src/kernel-job.ts"

const bracket = {
  parameters: { w: 40 },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: 25 }] } },
    { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new" }
  ]
}

test("export workers preserve binary mesh bytes and the solid evidence across the worker seam", async () => {
  for (const format of ["stl", "stl_ascii", "obj", "3mf"] as const) {
    const input = { input: { history: bracket, format, name: "equivalence" } }
    const inline = runKernelJobInline("cad-export", input)
    const worker = await runKernelJob("cad-export", input)
    expect(worker).toEqual(inline)
  }
  const decoded = decodeHistory(bracket)
  if (!decoded.success) throw new Error("Invalid scene fixture")
  const scene = { elements: [{ id: "plate", type: "parametric", name: "Plate", history: decoded.data, x: 0, y: 0, z: 0 }], ids: ["plate"] }
  clearKernelJobCache()
  const selected = await runKernelJob("cad-export-scene", scene)
  expect(selected.ok).toBe(true)
  expect(selected).toEqual(runKernelJobInline("cad-export-scene", scene))
  const stock = { input: { kind: "stock" as const, operationId: "op", format: "stl" as const }, floor: 0,
    preview: { nx: 2, ny: 2, minX: 0, minY: 0, cellX: 5, cellY: 5, minZ: 6, maxZ: 12, heights: [12, 6, 12, 12], gouge: [] } }
  expect(await runKernelJob("cam-export-stock", stock)).toEqual(runKernelJobInline("cam-export-stock", stock))
}, 30_000)

const host = () => {
  const files = new Map<string, Uint8Array>()
  const handlers = {
    saveFile: async (projectId: string, file: { name: string; mime: string; bytes: Uint8Array }) => {
      const key = `exports/${projectId}/${file.name}`
      files.set(key, file.bytes)
      return { ok: true as const, name: file.name, key }
    }
  } as unknown as ToolHandlersShape
  return { files, handlers }
}

const call = async (id: string, input: Record<string, unknown>, handlers: ToolHandlersShape): Promise<Record<string, any>> =>
  await runAction(id, input, { handlers, projectId: "p1" }) as Record<string, any>

const volumeOfStl = (bytes: Uint8Array): number => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let v = 0
  for (let t = 0; t < dv.getUint32(80, true); t++) {
    const o = 84 + 50 * t + 12
    const p = (k: number) => [dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)] as const
    const [a, b, c] = [p(0), p(1), p(2)]
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return v
}

describe("cad_edit.export", () => {
  test("cancelling an admitted export worker never stores a partial file", async () => {
    const { files, handlers } = host()
    const controller = new AbortController()
    const before = kernelJobStats().counters.started
    const pending = runAction("cad_edit.export", { format: "stl", history: bracket }, { handlers, projectId: "p1", signal: controller.signal })
    try {
      const deadline = Date.now() + 3_000
      while (kernelJobStats().counters.started === before && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1))
      expect(kernelJobStats().counters.started).toBeGreaterThan(before)
      controller.abort()
      expect(await pending).toMatchObject({ ok: false })
      expect(files.size).toBe(0)
    } finally { controller.abort(); await pending }
  })

  test("an STL of a history is stored, closed, with the volume of the part, and the answer carries no bytes", async () => {
    const { files, handlers } = host()
    const r = await call("cad_edit.export", { format: "stl", history: bracket, name: "bracket" }, handlers)
    expect(r).toMatchObject({ ok: true, format: "stl", unit: "millimeter", file: { name: "bracket.stl", key: "exports/p1/bracket.stl", mime: "model/stl" } })
    const bytes = files.get(r["file"].key)!
    expect(r["file"].bytes).toBe(bytes.length)
    expect(r["file"].sha256).toBe(createHash("sha256").update(bytes).digest("hex"))
    expect(volumeOfStl(bytes)).toBeCloseTo(10_000, 2)
    expect(r["bodies"][0]).toMatchObject({ solid: true, volumeMm3: 10_000 })
    expect(JSON.stringify(r)).not.toContain('"data"')
  })

  test("ASCII STL, OBJ and 3MF are the same part in their own container", async () => {
    const { files, handlers } = host()
    const ascii = await call("cad_edit.export", { format: "stl_ascii", history: bracket, name: "a" }, handlers)
    const [parsed] = exchange.parseStl(files.get(ascii["file"].key)!)
    expect(parsed!.mesh.indices.length / 3).toBe(12)
    const obj = await call("cad_edit.export", { format: "obj", history: bracket, name: "o" }, handlers)
    expect(new TextDecoder().decode(files.get(obj["file"].key)!)).toContain("\nv ")
    const mf = await call("cad_edit.export", { format: "3mf", history: bracket, name: "m", unit: "inch" }, handlers)
    expect(mf).toMatchObject({ ok: true, unit: "inch", file: { name: "m.3mf", mime: "model/3mf" } })
    const meshes = exchange.read3mfMeshes(files.get(mf["file"].key)!)
    expect(meshes).toHaveLength(1)
    expect(meshes[0]!.mesh.indices.length / 3).toBe(12)
  })

  test("STEP and IGES are text files of the exact body", async () => {
    const { files, handlers } = host()
    const step = await call("cad_edit.export", { format: "step", history: bracket }, handlers)
    expect(step).toMatchObject({ ok: true, file: { name: expect.stringMatching(/\.step$/) } })
    expect(new TextDecoder().decode(files.get(step["file"].key)!)).toContain("ISO-10303-21")
    const iges = await call("cad_edit.export", { format: "iges", history: bracket }, handlers)
    expect(iges["file"].name).toMatch(/\.igs$/)
    expect(files.get(iges["file"].key)!.length).toBeGreaterThan(200)
  })

  test("solids of the drawing come from the host, and the ones without an exact model are named", async () => {
    const { files, handlers } = host()
    const decoded = decodeHistory(bracket)
    if (!decoded.success) throw new Error("fixture history is invalid")
    const exact = rebuildExact(decoded.data).bodies[0]!
    const withDrawing = { ...handlers, cadExportBodies: async () => ({ ok: true as const, bodies: [{ id: "el1", name: "Base plate", brep: exact.brep! }], skipped: ["Sketch (not a solid)"] }) } as ToolHandlersShape
    const r = await call("cad_edit.export", { format: "stl" }, withDrawing)
    expect(r).toMatchObject({ ok: true, file: { name: "Base_plate.stl" }, warnings: [expect.stringContaining("Sketch (not a solid)")] })
    expect(volumeOfStl(files.get(r["file"].key)!)).toBeCloseTo(10_000, 2)
  })

  test("recipes whose faces sample a shared edge differently still export as closed solids, with the same volume", async () => {
    const { files, handlers } = host()
    // Each of these left cracks in the kernel's own tessellation (flange: a bolt circle; enclosure: a shell; duct: a NURBS loft).
    const expected = { flange: 132_700, enclosure: 76_400, duct_transition: 48_480 } as const
    for (const name of ["flange", "enclosure", "duct_transition"] as const) {
      const r = await call("cad_edit.export", { format: "stl", history: buildRecipe(name, {}).history, name }, handlers)
      expect(r, name).toMatchObject({ ok: true, bodies: [{ solid: true }] })
      expect(Math.abs(r["bodies"][0].volumeMm3 - expected[name]) / expected[name], name).toBeLessThan(0.002)
      expect(Math.abs(volumeOfStl(files.get(r["file"].key)!) - r["bodies"][0].volumeMm3), name).toBeLessThan(5)
    }
  }, 90_000)

  test("catalogue parts that were mesh-only (nut, gear, stair, door, styled column) export as STEP and as closed STL", async () => {
    const { files, handlers } = host()
    const at = (k: number): [number, number, number] => [k * 60, 0, 0]
    const history = { parameters: {}, features: [
      { id: "nut", type: "primitive", element: "nut", params: {}, options: { size: "M8" }, at: at(0), operation: "new" },
      { id: "gear", type: "primitive", element: "gear", params: { moduleValue: 2, teeth: 18, thickness: 8, holeDiameter: 10 }, at: at(1), operation: "new" },
      { id: "stair", type: "primitive", element: "stair", params: { width: 40, height: 30, depth: 50, steps: 5 }, at: at(2), operation: "new" },
      { id: "door", type: "primitive", element: "door", params: { width: 30, height: 60, thickness: 3 }, at: at(3), operation: "new" },
      { id: "column", type: "primitive", element: "column", params: { radius: 5, height: 60 }, options: { style: "ionic" }, at: at(4), operation: "new" }
    ] }
    const stl = await call("cad_edit.export", { format: "stl", history, name: "parts" }, handlers)
    expect(stl).toMatchObject({ ok: true })
    expect(stl["bodies"]).toHaveLength(5)
    for (const body of stl["bodies"]) expect(body, JSON.stringify(body)).toMatchObject({ solid: true })
    const step = await call("cad_edit.export", { format: "step", history, name: "parts" }, handlers)
    expect(step).toMatchObject({ ok: true })
    expect(new TextDecoder().decode(files.get(step["file"].key)!)).toContain("MANIFOLD_SOLID_BREP")
  }, 60_000)

  test("it refuses ids with a history, a host that stores nothing, and a name that leaves the folder", async () => {
    const { handlers } = host()
    expect(await call("cad_edit.export", { format: "stl", ids: ["a"], history: bracket }, handlers)).toMatchObject({ ok: false })
    expect(await call("cad_edit.export", { format: "stl", history: bracket }, {} as ToolHandlersShape)).toMatchObject({ ok: false, error: expect.stringContaining("unavailable") })
    expect(await call("cad_edit.export", { format: "stl", history: bracket, name: "../../etc/passwd" }, handlers)).toMatchObject({ ok: false })
  })
})

describe("cam_edit.export", () => {
  test("a stored program is written with the controller's extension and its hash", async () => {
    const { files, handlers } = host()
    const h = { ...handlers, operationProgram: async () => ({ ok: true as const, operationId: "op1", gcode: "G21\nG0 X0 Y0\nM30" }) } as ToolHandlersShape
    const r = await call("cam_edit.export", { kind: "program", operationId: "op1", extension: "tap", name: "part-1" }, h)
    expect(r).toMatchObject({ ok: true, format: "tap", lines: 3, file: { name: "part-1.tap" } })
    expect(new TextDecoder().decode(files.get(r["file"].key)!)).toBe("G21\nG0 X0 Y0\nM30\n")
  })

  test("the verified stock becomes a closed STL with the volume of the height field", async () => {
    const { files, handlers } = host()
    const preview = { nx: 4, ny: 4, minX: 0, minY: 0, cellX: 5, cellY: 5, minZ: 6, maxZ: 12, heights: Array.from({ length: 16 }, (_, k) => (k === 5 ? 6 : 12)), gouge: [] }
    const h = { ...handlers, operationStock: async () => ({ ok: true as const, preview, floor: 0, programHash: "abc" }) } as ToolHandlersShape
    const r = await call("cam_edit.export", { kind: "stock", operationId: "op1" }, h)
    expect(r).toMatchObject({ ok: true, format: "stl", programHash: "abc", thinCells: 0, cellMm: 5 })
    // 15 cells of 12 mm and one of 6 mm, 25 mm² each.
    expect(volumeOfStl(files.get(r["file"].key)!)).toBeCloseTo(25 * (15 * 12 + 6), 1)
    expect(r["bodies"][0]).toMatchObject({ solid: true })
    expect(r["warnings"][0]).toContain("height field")
  })

  test("a stale or missing verification is a refusal, not an empty file", async () => {
    const { files, handlers } = host()
    const h = { ...handlers, operationStock: async () => ({ ok: false as const, error: "The stored program changed since it was verified." }) } as ToolHandlersShape
    expect(await call("cam_edit.export", { kind: "stock", operationId: "op1" }, h)).toMatchObject({ ok: false, error: expect.stringContaining("changed") })
    expect(files.size).toBe(0)
  })
})
