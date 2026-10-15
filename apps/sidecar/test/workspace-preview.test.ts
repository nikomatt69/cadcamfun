import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

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
    expect(path.body.segments.map((segment: { kind: string; line: number }) => [segment.kind, segment.line])).toEqual([
      ["rapid", 2],
      ["linear", 3],
    ])
    expect(path.body.stock.min).toEqual(path.body.bounds.min)

    const library = await app.call(`/api/projects/${projectId}/workspace/library`)
    expect(library.status).toBe(200)
    expect(library.body.components.map((item: { name: string }) => item.name)).toContain("Bracket")
    expect(library.body.materials).toEqual([])
    expect((await app.call(`/api/projects/${otherId}/workspace/toolpaths/${created.body.id}`)).status).toBe(404)
  })
})
