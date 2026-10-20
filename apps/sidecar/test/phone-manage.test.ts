import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

/** The exact bodies `apps/mobile/lib/client.ts` sends when the phone manages the desktop's data. */
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("what the phone sends to manage projects and resources", () => {
  test("project and contents: create, rename, delete", async () => {
    const project = await app.call("/api/projects", { method: "POST", json: { name: "Phone project" } })
    expect(project.status).toBe(201)
    const id = project.body.id as string

    const drawing = await app.call(`/api/projects/${id}/drawings`, { method: "POST", json: { name: "D1", data: { elements: [], version: "1.0" } } })
    const component = await app.call(`/api/projects/${id}/components`, { method: "POST", json: { name: "C1", type: "custom" } })
    const toolpath = await app.call("/api/toolpaths", { method: "POST", json: { name: "T1", type: "custom", operationType: "milling", projectId: id, data: {}, gcode: "", isPublic: false } })
    expect([drawing.status, component.status, toolpath.status]).toEqual([201, 201, 201])

    for (const [kind, row] of [["drawings", drawing], ["components", component], ["toolpaths", toolpath]] as const) {
      const renamed = await app.call(`/api/${kind}/${row.body.id}`, { method: "PUT", json: { name: "Renamed" } })
      expect(renamed.status).toBe(200)
      expect(renamed.body.name).toBe("Renamed")
    }
    expect((await app.call(`/api/drawings/${drawing.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call(`/api/toolpaths/${toolpath.body.id}`, { method: "DELETE" })).status).toBe(200)

    const renamedProject = await app.call(`/api/projects/${id}`, { method: "PUT", json: { name: "Renamed project" } })
    expect(renamedProject.status).toBe(200)
    expect((await app.call(`/api/projects/${id}`, { method: "DELETE" })).status).toBe(200)
    // The component went with the project (cascade), and the project is gone for the list too.
    expect((await app.call(`/api/components/${component.body.id}`)).status).toBe(404)
    expect((await app.call("/api/projects")).body.map((p: { id: string }) => p.id)).not.toContain(id)
  })

  test("resources: materials, tools and machines", async () => {
    const material = await app.call("/api/materials", { method: "POST", json: { name: "Phone steel", properties: { density: 7.85 } } })
    const tool = await app.call("/api/tools", { method: "POST", json: { name: "Phone mill", type: "endmill", diameter: 6, material: "Carbide", numberOfFlutes: 3, maxRPM: 12000 } })
    expect([material.status, tool.status]).toEqual([201, 201])
    expect((await app.call(`/api/materials/${material.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call(`/api/tools/${tool.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call("/api/machine-configs")).status).toBe(200)
  })
})
