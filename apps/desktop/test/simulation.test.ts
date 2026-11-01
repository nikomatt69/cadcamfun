import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, fea } from "@cadcamfun/core"
import {
  DEFAULT_FEM, autoSize, cuttingMaterials, cuttingResultant, femStudy, fieldsOf, interferenceStudy, massStudy, partGeometry, projectResult, solidParts
} from "../src/features/cad/lib/simulation.ts"

setDefaultTimeout(60_000)

const plate = (id: string, x: number) => ({ id, type: "parametric", name: id, x, y: 0, z: 0, layerId: "default", history: buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true }).history })
const drawing = [plate("a", 0), plate("b", 60), plate("c", 400), { id: "t", type: "text", name: "t", x: 0, y: 0, z: 0, layerId: "default", text: "x" }]

describe("desktop simulations", () => {
  const geometry = partGeometry(drawing[0]!, drawing)
  if ("reason" in geometry) throw new Error(geometry.reason)

  test("a part's geometry comes from its exact solid; a text has none and says why", () => {
    expect(geometry.max[0] - geometry.min[0]).toBeCloseTo(120, 1)
    expect("reason" in partGeometry(drawing[3]!, drawing)).toBe(true)
    expect(autoSize(geometry)).toBeGreaterThan(0.2)
  })

  test("a static form becomes a clamped, loaded study that solves and can be drawn", () => {
    const study = femStudy({ ...DEFAULT_FEM, analysis: "static", material: "aluminium-6061-t6", forceN: 200, size: 8 }, geometry)
    expect(study.supports?.[0]?.region).toMatchObject({ kind: "plane", axis: "x", value: geometry.min[0] })
    const r = fea.runStudy(study)
    if (!r.ok) throw new Error(r.message)
    expect(fieldsOf(r)[0]).toBe("vonMises")
    const drawn = projectResult(r, "vonMises", 0, { yaw: 0.6, pitch: 0.5, zoom: 1 }, 1, 800, 500)
    expect(drawn.triangles.length).toBeGreaterThan(50)
    expect(drawn.max).toBeGreaterThan(drawn.min)
    for (const t of drawn.triangles.slice(0, 40)) for (const v of t.points) expect(Number.isFinite(v)).toBe(true)
    // painter order: far triangles first
    for (let i = 1; i < drawn.triangles.length; i++) expect(drawn.triangles[i - 1]!.depth).toBeGreaterThanOrEqual(drawn.triangles[i]!.depth)
    const safety = projectResult(r, "safety", 0, { yaw: 0, pitch: 0, zoom: 1 }, 0, 400, 400)
    expect(safety.max).toBeLessThanOrEqual(10)
  })

  test("a cutting load uses the Kienzle force of the CAM material, and thermal forms give temperature fields", () => {
    const aluminium = cuttingMaterials().find((m) => m.name.toLowerCase().includes("alumin"))!
    const form = { ...DEFAULT_FEM, loadMode: "cutting" as const, cutMaterial: aluminium.id, ap: 3, fz: 0.12, teeth: 2, size: 9 }
    expect(cuttingResultant(form)).toBeGreaterThan(100)
    const study = femStudy(form, geometry)
    expect(study.loads?.[0]).toMatchObject({ kind: "force", region: { kind: "sphere" } })
    const thermal = fea.runStudy(femStudy({ ...DEFAULT_FEM, analysis: "thermal", material: "aluminium-6061-t6", hot: 100, cold: 20, size: 9 }, geometry))
    if (!thermal.ok) throw new Error(thermal.message)
    expect(thermal.summary.maxTemperature!.value).toBeCloseTo(100, 3)
    expect(fieldsOf(thermal)).toContain("temperature")
    const modal = fea.runStudy(femStudy({ ...DEFAULT_FEM, analysis: "modal", material: "aluminium-6061-t6", modes: 2, size: 9 }, geometry))
    if (!modal.ok) throw new Error(modal.message)
    expect(fieldsOf(modal)).toEqual(["mode"])
    expect(projectResult(modal, "mode", 0, { yaw: 0.3, pitch: 0.3, zoom: 1 }, 1, 400, 300).triangles.length).toBeGreaterThan(10)
  })

  test("interference finds the overlapping plates and reports the third as clear; mass follows density", () => {
    const parts = solidParts(drawing)
    expect(parts.map((p) => p.id)).toEqual(["a", "b", "c"])
    const s = interferenceStudy(parts)
    expect(s.clashes.map((c) => `${c.a}/${c.b}`)).toContain("a/b")
    expect(s.clashes.every((c) => c.a !== "c" && c.b !== "c")).toBe(true)
    const m = massStudy(parts[0]!, "aluminium-6061-t6")
    if ("reason" in m) throw new Error(m.reason)
    expect(m.massKg).toBeGreaterThan(0.28); expect(m.massKg).toBeLessThan(0.32)
    expect(m.inertia[0]).toBeLessThanOrEqual(m.inertia[2])
    expect("reason" in massStudy(parts[0]!, "nope")).toBe(true)
  })
})
