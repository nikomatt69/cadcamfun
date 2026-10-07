import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const post = (path: string, json: unknown, auth = true) => app.call(path, { method: "POST", json, auth })

describe("POST /api/toolpaths/generate", () => {
  test("requires the bearer token", async () => {
    expect((await post("/api/toolpaths/generate", {}, false)).status).toBe(401)
  })

  test("an empty body generates the legacy default mill program", async () => {
    const res = await post("/api/toolpaths/generate", {})
    expect(res.status).toBe(200)
    expect(res.body.gcode.startsWith("; CAD/CAM SYSTEM - Generated Mill G-code with AI assistance")).toBe(true)
    expect(res.body.gcode).toContain("; Rectangle toolpath")
    expect(res.body.stats.minZ).toBeCloseTo(-5, 6)
    expect(res.body.program.toolpaths).toHaveLength(1)
    expect(res.body.cycles).toEqual([])
  })

  test("is deterministic", async () => {
    const a = await post("/api/toolpaths/generate", { settings: { operationType: "pocket" } })
    const b = await post("/api/toolpaths/generate", { settings: { operationType: "pocket" } })
    expect(a.body).toEqual(b.body)
  })

  test("a selected element is machined from the stock top with the chosen action", async () => {
    const res = await post("/api/toolpaths/generate", {
      settings: { operationType: "drill", depth: 6, stepdown: 3, toolDiameter: 3 },
      geometry: {
        geometryType: "selected",
        stock: { width: 100, height: 60, depth: 20 },
        selectedElements: [{ id: "h", type: "circle", x: 10, y: 5, z: 40, radius: 4 }]
      }
    })
    expect(res.status).toBe(200)
    expect(res.body.gcode).toContain("; Stock: 100.000 x 60.000 x 20.000 mm, top Z0.000")
    expect(res.body.gcode).toContain("G83 X10.000 Y5.000 Z-6.000 R2.000 Q3.000 F300")
    expect(res.body.cycles).toEqual([{ gcode: expect.stringContaining("G83") }])
  })

  test("warnings from the generator come back as data", async () => {
    const res = await post("/api/toolpaths/generate", {
      settings: { depth: 50, stepdown: 5 },
      geometry: { geometryType: "selected", stock: { width: 100, height: 60, depth: 12 }, selectedElements: [{ type: "circle", x: 90, y: 0, radius: 10 }] }
    })
    expect(res.body.warnings).toEqual(expect.arrayContaining(["element leaves the stock rectangle", "Depth 50.000mm limited to the 12.000mm of stock"]))
  })

  test("3D printing without an element is a 400 with a message", async () => {
    const res = await post("/api/toolpaths/generate", { settings: { machineType: "3dprinter", operationType: "standard", toolType: "standard" } })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Please select a CAD element for 3D printing.")
  })

  test("invalid settings are rejected", async () => {
    expect((await post("/api/toolpaths/generate", { settings: { depth: 0 } })).status).toBe(400)
    expect((await post("/api/toolpaths/generate", { settings: { operationType: "teleport" } })).status).toBe(400)
  })
})

describe("POST /api/toolpaths/suggest", () => {
  test("element parameters, feedback and stock warnings", async () => {
    const res = await post("/api/toolpaths/suggest", {
      settings: { depth: 40 },
      geometry: { geometryType: "selected", stock: { width: 100, height: 60, depth: 20 }, selectedElements: [{ type: "cube", x: 0, y: 0, z: 0, width: 30, height: 30, depth: 12 }] }
    })
    expect(res.status).toBe(200)
    expect(res.body.parameters).toMatchObject({ depth: 12, operationType: "pocket" })
    expect(res.body.operation.title).toBe("Contouring")
    expect(res.body.warnings).toContain("Depth 40mm exceeds the stock thickness 20mm: it will be limited")
    expect(res.body.suggestions).toHaveLength(3)
  })
})

describe("POST /api/toolpaths/parse", () => {
  test("rebuilds the IR and statistics from pasted G-code", async () => {
    const res = await post("/api/toolpaths/parse", { gcode: "G21 G90\nG0 X1 Y1 Z5\nG1 Z-1 F100\nG1 X11 Y1 F300\n", name: "Pasted" })
    expect(res.status).toBe(200)
    expect(res.body.program.name).toBe("Pasted")
    expect(res.body.program.toolpaths[0].moves).toHaveLength(3)
    expect(res.body.stats).toMatchObject({ minZ: -1 })
    expect(res.body.stats.cutLength).toBeCloseTo(16, 6) // 6 mm plunge + 10 mm cut
  })

  test("a missing body field is a 400", async () => {
    expect((await post("/api/toolpaths/parse", {})).status).toBe(400)
  })
})

describe("existing toolpath routes are unaffected", () => {
  test("GET /api/toolpaths/generate is still an id lookup", async () => {
    const res = await app.call("/api/toolpaths/generate")
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Toolpath not found or access denied")
  })
})

describe("POST /api/toolpaths/verify", () => {
  const stock = { minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -10, maxZ: 0 }
  const tool = { kind: "endmill", diameter: 4 }

  test("requires the bearer token", async () => {
    expect((await post("/api/toolpaths/verify", {}, false)).status).toBe(401)
  })

  test("a safe slot reports removal and no errors", async () => {
    const res = await post("/api/toolpaths/verify", { gcode: "G0 X-10 Y0 Z5\nG1 Z-3 F200\nG1 X10 F400\nG0 Z5", stock, tool, resolution: 0.5 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.stats.removedVolume).toBeGreaterThan(200)
    expect(res.body.preview.heights.length).toBe(res.body.preview.nx * res.body.preview.ny)
  })

  test("a rapid into the stock comes back as an error issue with its line", async () => {
    const res = await post("/api/toolpaths/verify", { gcode: "G0 X0 Y0 Z5\nG0 Z-2", stock, tool })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RapidInMaterial", severity: "error", line: 2 })]))
  })

  test("an invalid body is rejected", async () => {
    expect((await post("/api/toolpaths/verify", { gcode: "G0 X0", stock, tool: { diameter: -1 } })).status).toBe(400)
  })

  test("gcode and program together are reported as invalid input, not simulated", async () => {
    const res = await post("/api/toolpaths/verify", { gcode: "G0 X0", program: { name: "p", units: "mm", workOffset: "G54", toolpaths: [] }, stock, tool })
    expect(res.body.ok).toBe(false)
    expect(res.body.issues[0].code).toBe("InvalidInput")
  })
})
