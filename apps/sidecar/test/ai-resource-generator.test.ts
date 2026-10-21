/**
 * The Resources generator end to end, below the model: the brief names `library_edit` / `cad_edit` / `parts` and every
 * parameter a row stores, so each tool is run with exactly those fields — through the tool's input schema, as the
 * assistant's call would be — and the stored row is read back through the API the Resources pages use.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string

beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Generator" } })).body.id
})
afterAll(async () => { await app.dispose() })

/** The catalogue's HTTP face: the same registry, input schemas and handlers the in-app assistant calls. */
const run = async (tool: string, input: Record<string, unknown>) => {
  const response = await app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })
  return (response.body.result ?? response.body) as Record<string, any>
}

describe("Resources generator writes complete rows", () => {
  test("a material keeps its description and every property", async () => {
    const properties = { density: 2700, hardness: "95 HB", thermalConductivity: 167, elasticModulus: 68.9, poissonRatio: 0.33, yieldStrength: 276, ultimateStrength: 310, color: "#c0c0c8" }
    const out = await run("library_edit", { action: "upsert_material", name: "6061-T6", description: "Plate, solution treated and aged", properties, isPublic: true })
    expect(out).toMatchObject({ ok: true, created: true })
    const row = (await app.call(`/api/materials/${out.id}`)).body
    expect(row).toMatchObject({ name: "6061-T6", description: "Plate, solution treated and aged", isPublic: true, properties })
  })

  test("a tool keeps every column, including the 3D model shape and its notes", async () => {
    const input = { name: "Ø6 3-flute carbide end mill", type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: 3, maxRPM: 24000, coolantType: "flood", cuttingLength: 18, totalLength: 60, shankDiameter: 6, cornerRadius: 0, tipAngle: 90, threadPitch: 1.25, holderDiameter: 25, holderLength: 40, stickout: 30, notes: "Vc 300 m/min, fz 0.04", isPublic: false }
    const out = await run("library_edit", { action: "upsert_tool", ...input })
    expect(out).toMatchObject({ ok: true, created: true })
    expect((await app.call(`/api/tools/${out.id}`)).body).toMatchObject(input)
  })

  test("a machine configuration keeps its description, kinematics and ceilings, and the kernel reads them", async () => {
    const config = { kinematics: { x: { min: 0, max: 762 }, y: { min: 0, max: 406 }, z: { min: -508, max: 0 } }, postProcessor: "fanuc", workOffsets: ["G54", "G55"], maxRPM: 8100, maxFeed: 16500 }
    const out = await run("library_edit", { action: "upsert_machine_config", name: "Haas VF-2", kind: "mill", description: "Fanuc-style control, general milling", isPublic: false, ...config })
    expect(out).toMatchObject({ ok: true, created: true })
    const row = (await app.call(`/api/machine-configs/${out.id}`)).body
    const data = row.data ?? row
    expect(data).toMatchObject({ name: "Haas VF-2", type: "mill", description: "Fanuc-style control, general milling" })
    // The configuration is stored as the machine profile: the figures the model gave survive, in the canonical shape.
    expect(data.config).toMatchObject({
      kind: "mill",
      post: "fanuc",
      spindle: { maxRpm: 8100 },
      feed: { max: 16500 }
    })
    expect(data.config["axisTable"]).toEqual([
      { id: "X", kind: "linear", min: 0, max: 762, sense: 1 },
      { id: "Y", kind: "linear", min: 0, max: 406, sense: 1 },
      { id: "Z", kind: "linear", min: -508, max: 0, sense: 1 }
    ])
    // The machine the assistant configured is the machine the kernel plans against.
    const machine = cam.kernel.kernelMachineOfConfig({ id: String(out.id), name: "Haas VF-2", type: "mill", config: data.config })
    expect(machine?.limits.maxRpm).toBe(8100)
    expect(machine?.limits.maxFeed).toBe(16500)
    expect(machine?.post).toBe("fanuc")
  })

  test("a component is built with cad_edit, saved with parts and lands in the library with its metadata", async () => {
    const added = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 60, height: 6, depth: 6, name: "Bar" }] })
    expect(added.ok).toBe(true)
    const saved = await run("parts", { action: "save", ids: added.ids, name: "L-bracket 60", description: "60 x 6 x 6 mm bar", type: "mechanical", isPublic: false })
    expect(saved.ok).toBe(true)
    const list = await app.call(`/api/projects/${projectId}/components`)
    expect(JSON.stringify(list.body)).toContain("L-bracket 60")
  })
})
