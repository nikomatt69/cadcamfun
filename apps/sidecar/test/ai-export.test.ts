import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { freeKey, safeFileName, stockOfVerification } from "../src/services/ai-export.ts"

describe("safeFileName", () => {
  test("keeps a plain name and removes whatever could leave the folder", () => {
    expect(safeFileName("bracket v2.stl")).toBe("bracket v2.stl")
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd")
    expect(safeFileName(".hidden")).toBe("hidden")
    expect(safeFileName("???")).toBe("_")
    expect(safeFileName("")).toBe("export")
    expect(safeFileName("a".repeat(300)).length).toBe(100)
  })
})

describe("freeKey", () => {
  test("the first free key in the project's export folder, never an existing file", async () => {
    const taken = new Set(["exports/p/part.stl", "exports/p/part-2.stl"])
    expect(await freeKey(async (k) => taken.has(k), "p", "part.stl")).toBe("exports/p/part-3.stl")
    expect(await freeKey(async (k) => taken.has(k), "p", "other.nc")).toBe("exports/p/other.nc")
    expect(await freeKey(async (k) => taken.has(k), "p", "noext")).toBe("exports/p/noext")
  })

  test("a folder full of the same name is refused", async () => {
    await expect(freeKey(async () => true, "p", "x.stl")).rejects.toThrow(RangeError)
  })
})

describe("stockOfVerification", () => {
  const gcode = "G21\nG0 Z5\nM30"
  const preview = { nx: 2, ny: 2, minX: 0, minY: 0, cellX: 1, cellY: 1, minZ: 4, maxZ: 8, heights: [8, 8, 4, 8], gouge: [] }
  const current = { revision: "r1", requestRevision: "q1", programRevision: "pr1" }
  const data = (over: Record<string, unknown> = {}) => ({
    verification: {
      revision: "r1", requestRevision: "q1", programRevision: "pr1", programHash: cam.kernel.sha256(gcode),
      report: { ok: true, preview }, request: { stock: { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: -3, maxZ: 8 } }, ...over
    }
  })

  test("a current verification gives the height field and the bottom of the stock", () => {
    expect(stockOfVerification(data(), gcode, current)).toMatchObject({ ok: true, floor: -3, programHash: cam.kernel.sha256(gcode), preview: { nx: 2, heights: [8, 8, 4, 8] } })
  })

  test("no verification, a changed program, a changed drawing and a missing height field are each refused with their own reason", () => {
    expect(stockOfVerification({}, gcode, current)).toMatchObject({ ok: false, error: expect.stringContaining("no verification") })
    expect(stockOfVerification(data(), gcode + "\nG0 X1", current)).toMatchObject({ ok: false, error: expect.stringContaining("program changed") })
    expect(stockOfVerification(data(), gcode, { ...current, revision: "r2" })).toMatchObject({ ok: false, error: expect.stringContaining("drawing, stock or operation") })
    expect(stockOfVerification(data({ report: { ok: true, preview: { nx: 2 } } }), gcode, current)).toMatchObject({ ok: false, error: expect.stringContaining("height field") })
    expect(stockOfVerification(data({ request: {} }), gcode, current)).toMatchObject({ ok: false, error: expect.stringContaining("bottom of the stock") })
    expect(stockOfVerification(data(), null, current)).toMatchObject({ ok: false })
  })
})

// ---------------------------------------------------------------- through the real host: the bridge, the kernel, the storage folder

import { afterAll, beforeAll, setDefaultTimeout } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildRecipe } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)

describe("export through the bridge", () => {
  let app: Awaited<ReturnType<typeof makeApp>>
  beforeAll(async () => { app = await makeApp() })
  afterAll(async () => { await app.dispose() })

  const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true }).history }
  const label = { id: "note", type: "text", name: "note", x: 0, y: 0, z: 0, layerId: "default", text: "not a solid" }

  const setup = async (mode: "read" | "write") => {
    const project = (await app.call("/api/projects", { method: "POST", json: { name: `Export ${mode}` } })).body.id as string
    await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate, label] } } })
    const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "export-test", projectId: project, mode } })).body.token as string
    const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
      method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input }
    })
    return { project, invoke }
  }

  test("a STEP and an STL of the plate are written into the project's export folder, and a second export does not overwrite the first", async () => {
    const { project, invoke } = await setup("write")
    const step = await invoke("cad_edit", { action: "export", format: "step", ids: ["plate"], name: "plate" })
    expect(step.status).toBe(200)
    expect(step.body.result).toMatchObject({ ok: true, format: "step", file: { name: "plate.step", key: `exports/${project}/plate.step` } })
    const onDisk = join(app.dataDir, "storage", step.body.result.file.key)
    expect(existsSync(onDisk)).toBe(true)
    expect(readFileSync(onDisk, "utf8")).toContain("ISO-10303-21")
    expect(step.body.result.file.bytes).toBe(readFileSync(onDisk).length)
    expect(JSON.stringify(step.body.result)).not.toContain(app.dataDir)

    const stl = await invoke("cad_edit", { action: "export", format: "stl", ids: ["plate"], name: "plate" })
    expect(stl.body.result).toMatchObject({ ok: true, file: { key: `exports/${project}/plate.stl` }, bodies: [{ solid: true }] })
    const again = await invoke("cad_edit", { action: "export", format: "stl", ids: ["plate"], name: "plate" })
    expect(again.body.result.file.key).toBe(`exports/${project}/plate-2.stl`)
    expect(existsSync(join(app.dataDir, "storage", stl.body.result.file.key))).toBe(true)
  })

  test("the whole drawing exports its exact solids, and an export is not an edit to diagnose", async () => {
    const { invoke } = await setup("write")
    const all = await invoke("cad_edit", { action: "export", format: "3mf" })
    expect(all.body.result).toMatchObject({ ok: true, format: "3mf", bodies: [{ name: "Plate", solid: true }] })
    expect(all.body.result.diagnostics).toBeUndefined()
  })

  test("a read-only token cannot write a file, and a request for a missing element writes nothing", async () => {
    const readOnly = await setup("read")
    const refused = await readOnly.invoke("cad_edit", { action: "export", format: "stl" })
    expect(refused.body.result?.ok ?? false).toBe(false)
    expect(existsSync(join(app.dataDir, "storage", "exports", readOnly.project))).toBe(false)

    const { project, invoke } = await setup("write")
    const missing = await invoke("cad_edit", { action: "export", format: "stl", ids: ["ghost"] })
    expect(missing.body.result).toMatchObject({ ok: false, missing: ["ghost"] })
    expect(existsSync(join(app.dataDir, "storage", "exports", project))).toBe(false)
  })

  test("an operation with no stored program gives no file", async () => {
    const { invoke } = await setup("write")
    const none = await invoke("cam_edit", { action: "export", kind: "program", operationId: "nope" })
    expect(none.body.result).toMatchObject({ ok: false })
  })

  test("a generated and verified operation gives its NC file and the stock it leaves as an STL, and a changed program refuses the stock", async () => {
    const { project, invoke } = await setup("write")
    const stock = { width: 126, height: 86, depth: 14, x: 60, y: 40, topZ: 13, allowance: 1 }
    expect((await invoke("cam_edit", { action: "stock_set", stock })).body.result.ok).toBe(true)
    const created = await invoke("cam_edit", { action: "create", type: "contour", params: { toolDiameter: 6, depth: 12, stepdown: 2 } })
    const operationId = created.body.result.operationId as string
    expect(operationId).toBeString()

    // Nothing generated yet: no program, so no file.
    expect((await invoke("cam_edit", { action: "export", kind: "program", operationId })).body.result).toMatchObject({ ok: false })
    expect((await invoke("cam_edit", { action: "generate", operationId })).body.result.ok).toBe(true)
    // Generated but not verified: the program exports, the stock does not.
    const nc = await invoke("cam_edit", { action: "export", kind: "program", operationId, extension: "tap", name: "contour" })
    expect(nc.body.result).toMatchObject({ ok: true, format: "tap", file: { name: "contour.tap", key: `exports/${project}/contour.tap` } })
    const text = readFileSync(join(app.dataDir, "storage", nc.body.result.file.key), "utf8")
    expect(text.split("\n").length - 1).toBe(nc.body.result.lines)
    expect(text).toMatch(/G0?1|G0?0/)
    expect((await invoke("cam_edit", { action: "export", kind: "stock", operationId })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("verify") })

    expect((await invoke("cam_edit", { action: "verify", operationId })).body.result.status).toBeOneOf(["pass", "failed"])
    const mesh = await invoke("cam_edit", { action: "export", kind: "stock", operationId, name: "after-contour" })
    expect(mesh.body.result).toMatchObject({ ok: true, format: "stl", file: { name: "after-contour.stl" }, bodies: [{ solid: true }] })
    const bytes = readFileSync(join(app.dataDir, "storage", mesh.body.result.file.key))
    expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)).toBe(mesh.body.result.bodies[0].triangles)
    // The mesh holds the stock minus what the contour took: less than the whole block, more than nothing.
    expect(mesh.body.result.bodies[0].volumeMm3).toBeGreaterThan(0)
    expect(mesh.body.result.bodies[0].volumeMm3).toBeLessThan(126 * 86 * 14)

    // Changing the operation invalidates the program and with it the verification: the stock export refuses.
    await invoke("cam_edit", { action: "update", operationId, params: { depth: 8 } })
    expect((await invoke("cam_edit", { action: "export", kind: "stock", operationId })).body.result).toMatchObject({ ok: false })
  })

  test("fasten inserts the screws, washers and nuts the shared holes need, once, and the assembly exports with them", async () => {
    const { model } = await import("@cadcamfun/core")
    const block = (h: number, d: number, depth: number) => {
      const m = model()
      m.extrude(m.sketch("XY").rectangle([0, 0], 60, 30), { depth: h, id: "block" })
      m.hole({ plane: "XY", offset: h, at: [15, 15], diameter: d, depth, id: "a" })
      m.hole({ plane: "XY", offset: h, at: [45, 15], diameter: d, depth, id: "b" })
      return m.build()
    }
    const elements = [
      { id: "base", type: "parametric", name: "Base", history: block(20, 6.8, 16), x: 0, y: 0, z: 0, layerId: "default", metadata: { material: "aluminium" } },
      { id: "plate", type: "parametric", name: "Plate", history: block(8, 9, 8), x: 0, y: 0, z: 20, layerId: "default", metadata: { material: "S235JR" } }
    ]
    const project = (await app.call("/api/projects", { method: "POST", json: { name: "Fasten" } })).body.id as string
    await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Joint", data: { elements } } })
    const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "fasten", projectId: project, mode: "write" } })).body.token as string
    const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
      method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input }
    })

    const missingBefore = (await invoke("cad", { action: "assembly" })).body.result
    expect(missingBefore.ok).toBe(true)
    const first = await invoke("cad_edit", { action: "fasten" })
    expect(first.body.result).toMatchObject({ ok: true, plans: 2, existing: 0, unfastened: [] })
    expect(first.body.result.added.map((a: { name: string }) => a.name)).toEqual(["ISO 4762 M8x20", "ISO 7089 M8", "ISO 4762 M8x20", "ISO 7089 M8"])
    expect(first.body.result.added.map((a: { role: string }) => a.role)).toEqual(["screw", "washer", "screw", "washer"])

    const again = await invoke("cad_edit", { action: "fasten" })
    expect(again.body.result).toMatchObject({ ok: true, added: [], plans: 0, existing: 2 })

    // The fasteners are exact solids of the drawing: the whole joint goes out as one STEP file.
    const step = await invoke("cad_edit", { action: "export", format: "step", name: "joint" })
    expect(step.body.result).toMatchObject({ ok: true, file: { name: "joint.step" } })
    expect(step.body.result.bodies).toHaveLength(6)
  })
})

