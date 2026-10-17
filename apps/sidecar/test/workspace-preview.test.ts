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
