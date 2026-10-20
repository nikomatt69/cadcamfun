import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamProgramDocument } from "@cadcamfun/api"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
let otherId: string

beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Preview" } })).body.id
  otherId = (await app.call("/api/projects", { method: "POST", json: { name: "Other" } })).body.id
})
afterAll(async () => { await app.dispose() })

const cube = { id: "box", name: "Box", type: "cube", width: 10, height: 20, depth: 30, color: "#888" }
const gcode = "G21\nG0 X10 Y0 Z5\nG1 X20 Y0 Z-1 F200\n"

/** A saved CAM document with the generator defaults, patched for the machine and the evidence it must carry. */
const documentOf = (patch: Record<string, unknown>): CamProgramDocument => Schema.decodeUnknownSync(CamProgramDocument)({
  format: "cadcamfun-cam", version: 1, gcode: "",
  program: cam.makeProgram("preview", [], {}),
  settings: cam.generator.DEFAULT_SETTINGS,
  printer: cam.generator.DEFAULT_PRINTER_EXTRAS,
  stock: { width: 100, height: 60, depth: 20 },
  drawing: {},
  ...patch,
})

describe("companion workspace preview", () => {
  test("drawing and component previews are meshes, and lists omit the document", async () => {
    const drawing = await app.call(`/api/projects/${projectId}/drawings`, {
      method: "POST",
      json: { name: "Plate", description: "pocket", data: { elements: [cube] } },
    })
    expect(drawing.status).toBe(201)
    const component = await app.call(`/api/projects/${projectId}/components`, {
      method: "POST",
      json: { name: "Bracket", type: "custom", data: { name: "Bracket", type: "custom", width: 12, elements: [cube] } },
    })
    expect(component.status).toBe(201)

    const drawings = await app.call(`/api/projects/${projectId}/workspace/drawings`)
    expect(drawings.status).toBe(200)
    expect(drawings.body[0]).toMatchObject({ id: drawing.body.id, name: "Plate", subtitle: "pocket" })
    expect(drawings.body[0].data).toBeUndefined()

    const mesh = await app.call(`/api/projects/${projectId}/workspace/drawings/${drawing.body.id}/preview`)
    expect(mesh.status).toBe(200)
    expect(mesh.body.parts[0]).toMatchObject({ id: "box", name: "Box" })
    expect(mesh.body.positions.length).toBeGreaterThan(0)
    expect(mesh.body.normals).toHaveLength(mesh.body.positions.length)
    expect(mesh.body.truncated).toBe(false)
    expect(mesh.body.revision).toBe(drawing.body.updatedAt)
    expect(mesh.body.data).toBeUndefined()

    const componentMesh = await app.call(`/api/projects/${projectId}/workspace/components/${component.body.id}/preview`)
    expect(componentMesh.status).toBe(200)
    expect(componentMesh.body.parameters).toEqual(expect.arrayContaining([{ key: "width", value: "12" }]))
    expect(componentMesh.body.positions.length).toBeGreaterThan(0)

    expect((await app.call(`/api/projects/${otherId}/workspace/drawings/${drawing.body.id}/preview`)).status).toBe(404)
    expect((await app.call(`/api/projects/${projectId}/workspace/drawings`, { method: "POST", json: {} })).status).toBe(404)
    expect((await app.call("/api/projects/missing/workspace/drawings")).status).toBe(404)
  })

  test("toolpath review returns G-code and a line-mapped path, and the library lists the component", async () => {
    const created = await app.call("/api/toolpaths", {
      method: "POST",
      json: { name: "Face", projectId, operationType: "face", data: { note: "preview" }, gcode },
    })
    expect(created.status).toBe(201)

    const list = await app.call(`/api/projects/${projectId}/workspace/toolpaths`)
    expect(list.body[0]).toMatchObject({ id: created.body.id, name: "Face", subtitle: "face" })
    expect(list.body[0].gcode).toBeUndefined()

    const review = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}`)
    expect(review.status).toBe(200)
    expect(review.body.gcode).toBe(gcode)
    expect(review.body.stats.rapidMoves).toBe(1)
    expect(review.body.stats.linearMoves).toBe(1)
    expect(review.body.data).toBeUndefined()

    const path = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`)
    expect(path.status).toBe(200)
    // The first rapid only sets the start point: where the tool was before it is unknown.
    expect(path.body.segments.map((segment: { kind: string; line: number }) => [segment.kind, segment.line])).toEqual([
      ["linear", 3],
    ])
    expect(path.body.stock.min).toEqual(path.body.bounds.min)

    const library = await app.call(`/api/projects/${projectId}/workspace/library`)
    expect(library.status).toBe(200)
    expect(library.body.components.map((item: { name: string }) => item.name)).toContain("Bracket")
    expect(library.body.materials).toEqual([])
    expect((await app.call(`/api/projects/${otherId}/workspace/toolpaths/${created.body.id}`)).status).toBe(404)
  })

  test("previews carry an entity tag; a phone holding it gets a body-less 304, and an edit changes the tag", async () => {
    const drawing = await app.call(`/api/projects/${projectId}/drawings`, {
      method: "POST",
      json: { name: "Tagged", data: { elements: [cube] } },
    })
    const url = `/api/projects/${projectId}/workspace/drawings/${drawing.body.id}/preview`
    const first = await app.call(url)
    const tag = first.headers.get("etag")
    expect(tag).toMatch(/^"[A-Za-z0-9_-]{32}"$/)
    expect(first.headers.get("cache-control")).toBe("private, no-cache")
    expect(first.body.parts[0].id).toBe("box")

    const again = await app.call(url, { headers: { "if-none-match": tag! } })
    expect(again.status).toBe(304)
    expect(again.bytes.byteLength).toBe(0)
    expect(again.headers.get("etag")).toBe(tag)
    // A weak form or a list that contains the tag also matches; another tag does not.
    expect((await app.call(url, { headers: { "if-none-match": `"other", W/${tag}` } })).status).toBe(304)
    const stale = await app.call(url, { headers: { "if-none-match": "\"stale\"" } })
    expect(stale.status).toBe(200)
    expect(stale.body).toEqual(first.body)

    const edited = await app.call(`/api/drawings/${drawing.body.id}`, { method: "PUT", json: { data: { elements: [{ ...cube, width: 40 }] } } })
    expect(edited.status).toBe(200)
    const after = await app.call(url, { headers: { "if-none-match": tag! } })
    expect(after.status).toBe(200)
    expect(after.headers.get("etag")).not.toBe(tag)
    expect(after.body.bounds.max[0] - after.body.bounds.min[0]).toBeCloseTo(40, 3)
    // Access is still checked before any tag is compared: another project's route is a 404, never a 304.
    expect((await app.call(`/api/projects/${otherId}/workspace/drawings/${drawing.body.id}/preview`, { headers: { "if-none-match": tag! } })).status).toBe(404)
  })

  test("toolpath review and path previews are conditional too", async () => {
    const created = await app.call("/api/toolpaths", { method: "POST", json: { name: "Tagged path", projectId, operationType: "face", data: {}, gcode } })
    for (const url of [`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}`, `/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`]) {
      const first = await app.call(url)
      expect(first.status).toBe(200)
      const tag = first.headers.get("etag")!
      expect((await app.call(url, { headers: { "if-none-match": tag } })).status).toBe(304)
    }
    const review = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}`)
    const path = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`)
    // The review and the path are different payloads of one toolpath, so their tags differ.
    expect(review.headers.get("etag")).not.toBe(path.headers.get("etag"))
  })
})

describe("companion machine scene preview", () => {
  test("a lathe document is drawn on its machine, in display coordinates", async () => {
    const lathe = ["G18 G90", "M3 S600", "G0 X52 Z2", "G0 X44", "G1 Z-90 F60", "M5", "G0 X52", "M30"].join("\n")
    const document = documentOf({
      gcode: lathe,
      program: cam.generator.analyseGcode(lathe).program,
      settings: { ...cam.generator.DEFAULT_SETTINGS, machineType: "lathe", stockDiameter: 50, stockLength: 100 },
    })
    const created = await app.call("/api/toolpaths", {
      method: "POST",
      json: { name: "Turn", projectId, type: "lathe", operationType: "turning", data: document, gcode: lathe },
    })
    expect(created.status).toBe(201)

    const path = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`)
    expect(path.status).toBe(200)
    expect(path.body.machine).toMatchObject({ kind: "lathe", source: "generator", axes: 2, xMode: "diameter", turret: "rear" })
    // Display x is Z and display z is +X/2: the program is already mapped, the phone never sees X as a diameter.
    expect(path.body.segments[0]).toMatchObject({ kind: "rapid", from: [2, 0, 26], to: [2, 0, 22] })
    expect(path.body.segments.some((segment: { to: number[] }) => segment.to[1] !== 0)).toBe(false)
    expect(path.body.machine.bodies.map((body: { role: string }) => body.role)).toContain("chuck")
    expect(path.body.machine.spin[0]).toEqual({ segment: 0, rate: 2 })
    expect(path.body.machine.collisions.length).toBeGreaterThan(0)
    expect(path.body.stats).toMatchObject({ rapidMoves: 3, linearMoves: 1 })
  })

  test("a mill program reports its operations, their cutters and its contacts", async () => {
    const nc = ["M3 S600", "G0 X0 Y0 Z5", "G1 X10 F100", "G0 Z-10"].join("\n")
    const document = documentOf({
      gcode: nc,
      program: cam.generator.analyseGcode(nc).program,
      settings: { ...cam.generator.DEFAULT_SETTINGS, machineType: "mill", toolDiameter: 6 },
      stock: { width: 100, height: 60, depth: 20 },
    })
    const created = await app.call("/api/toolpaths", {
      method: "POST",
      json: { name: "Mill", projectId, type: "mill", operationType: "face", data: document, gcode: nc },
    })
    expect(created.status).toBe(201)

    const path = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`)
    expect(path.status).toBe(200)
    // The operations own a run of the path's segments, each with the tool it runs.
    expect(path.body.machine.operations.length).toBe(1)
    expect(path.body.machine.operations[0].startSegment).toBe(0)
    expect(path.body.machine.operations[0].endSegment).toBe(path.body.segments.length - 1)
    expect(path.body.machine.operations[0].cutter.diameter).toBe(6)
    // The rapid into the stock is a contact on the clock, on the segment that made it.
    const contact = path.body.machine.events.find((event: { code: string }) => event.code === "RAPID_INTO_STOCK")
    expect(contact).toBeDefined()
    expect(contact.severity).toBe("error")
    expect(path.body.segments[contact.segment].kind).toBe("rapid")
    // A contact is a red segment too.
    expect(path.body.machine.collisions).toContain(contact.segment)
  })

  test("a kernel document carries its stock, its machine preset's table and the chosen tool", async () => {
    const request = {
      schemaVersion: 1, id: "preview-kernel", name: "Plate", material: "6061", machine: "vmc-standard",
      elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5, layerId: "default" }],
    }
    const generated = await app.call("/api/toolpaths/manufacture", { method: "POST", json: request })
    expect(generated.status).toBe(200)
    const artifact = generated.body.value
    const document = documentOf({
      gcode: artifact.nc,
      program: artifact.program,
      settings: { ...cam.generator.DEFAULT_SETTINGS, toolDiameter: 6 },
      stock: { width: 34, height: 24, depth: 6 },
      drawing: { elements: request.elements },
      kernelRequest: request,
      kernelArtifact: artifact,
    })
    const tool = (await app.call("/api/tools", { method: "POST", json: { name: "EM6", type: "endmill", diameter: 6, material: "Carbide" } })).body
    const created = await app.call("/api/toolpaths", {
      method: "POST",
      json: { name: "Kernel", projectId, toolId: tool.id, type: "mill", operationType: "kernel", data: document, gcode: artifact.nc },
    })
    expect(created.status).toBe(201)

    const path = await app.call(`/api/projects/${projectId}/workspace/toolpaths/${created.body.id}/preview`)
    expect(path.status).toBe(200)
    expect(path.body.machine).toMatchObject({ kind: "mill", source: "kernel", axes: 3, tool: { family: "mill", diameter: 6 } })
    // The kernel's stock box, not the generator's 34 x 24 x 6 one.
    const { min, max } = artifact.stockBounds
    expect(path.body.stock).toEqual({
      min: [min.x - artifact.origin.x, min.y - artifact.origin.y, min.z - artifact.origin.z],
      max: [max.x - artifact.origin.x, max.y - artifact.origin.y, max.z - artifact.origin.z],
    })
    const table = path.body.machine.bodies.find((body: { role: string }) => body.role === "table")
    expect(table.shape.max.x - table.shape.min.x).toBeCloseTo(1000, 6)
    expect(path.body.machine.bodies.some((body: { role: string }) => body.role === "vise-base")).toBe(true)
  })
})
