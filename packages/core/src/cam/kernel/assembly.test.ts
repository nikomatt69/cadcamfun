import { describe, expect, test } from "bun:test"
import { assemblyMeshes, assemblyProfile, assemblyVolume, DEFAULT_CUTTERS, genericHolder, type Cutter } from "./index.ts"

const base: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }

/** Volume enclosed by a closed triangle mesh (divergence theorem). */
const meshVolume = (meshes: ReturnType<typeof assemblyMeshes>): number => {
  let v = 0
  for (const m of meshes) {
    const p = m.positions, ix = m.indices
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3
      v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
    }
  }
  return v
}

describe("tool assembly profile", () => {
  test("a flat end mill is a cylinder from the tip to the holder face", () => {
    const p = assemblyProfile(base)
    expect(p.points[0]).toEqual({ r: 0, z: 0 })
    expect(p.points[p.points.length - 1]).toEqual({ r: 0, z: 40 })
    expect(p.length).toBe(40)
    expect(p.assumedHolder).toBe(false)
    expect(assemblyVolume(p)).toBeCloseTo(Math.PI * 25 * 40, 6)
    expect(assemblyVolume(p, "cutting")).toBeCloseTo(Math.PI * 25 * 22, 6)
  })

  test("a ball nose has a hemispherical tip of the cutter radius", () => {
    const p = assemblyProfile({ ...base, kind: "ball" })
    const tip = p.points.filter((q, i) => p.parts[Math.max(0, i - 1)] === "cutting" && q.z <= 5 + 1e-9)
    for (const q of tip) expect(Math.hypot(q.r, q.z - 5)).toBeCloseTo(5, 9)
    // Hemisphere (2/3 π R³) plus the cylinder above it, polygonal arc slightly under the true sphere.
    const exact = (2 / 3) * Math.PI * 125 + Math.PI * 25 * (40 - 5)
    const v = assemblyVolume(p)
    expect(v).toBeLessThan(exact)
    expect(v / exact).toBeGreaterThan(0.995)
  })

  test("a bull nose keeps a flat bottom inside its corner radius", () => {
    const p = assemblyProfile({ ...base, kind: "bull", cornerRadius: 1 })
    expect(p.points[1]).toEqual({ r: 4, z: 0 })
    expect(p.points.some((q) => Math.abs(q.r - 5) < 1e-9 && Math.abs(q.z - 1) < 1e-9)).toBe(true)
  })

  test("a drill point is a cone of its point angle", () => {
    const p = assemblyProfile({ ...base, kind: "drill", angle: 118 })
    expect(p.points[1]!.r).toBe(5)
    expect(p.points[1]!.z).toBeCloseTo(5 / Math.tan((59 * Math.PI) / 180), 9)
  })

  test("a chamfer cone starts at its tip diameter", () => {
    const p = assemblyProfile({ ...base, kind: "chamfer", angle: 90, tipDiameter: 1 })
    expect(p.points[1]).toEqual({ r: 0.5, z: 0 })
    expect(p.points[2]!.z).toBeCloseTo(4.5, 9)
  })

  test("a necked tool steps at 45° from the cutting diameter to the shank", () => {
    const p = assemblyProfile({ ...base, diameter: 4, fluteLength: 8, shankDiameter: 6, stickout: 30 })
    const i = p.points.findIndex((q) => q.r === 3)
    expect(p.points[i]!.z - p.points[i - 1]!.z).toBeCloseTo(1, 9)
    expect(p.parts[i - 1]).toBe("shank")
  })

  test("a holder is drawn from the cutter, or a generic one flagged assumed", () => {
    const own = assemblyProfile({ ...base, holder: { diameter: 32, length: 50 } })
    expect(own.length).toBe(90)
    expect(own.assumedHolder).toBe(false)
    expect(Math.max(...own.points.map((q) => q.r))).toBe(16)
    const none = assemblyProfile(base)
    expect(none.parts.includes("holder")).toBe(false)
    const assumed = assemblyProfile(base, { assumeHolder: true })
    expect(assumed.assumedHolder).toBe(true)
    expect(assumed.length).toBe(40 + genericHolder(base).length)
  })
})

describe("tool assembly meshes", () => {
  test("every default cutter revolves to a closed solid whose volume matches the profile", () => {
    for (const cutter of DEFAULT_CUTTERS) {
      for (const assumeHolder of [false, true]) {
        const meshes = assemblyMeshes(cutter, { assumeHolder, segments: 96 })
        const profile = assemblyProfile(cutter, { assumeHolder })
        expect(meshes.map((m) => m.part)).toEqual(["cutting", "shank", ...(assumeHolder || cutter.holder ? ["holder" as const] : [])])
        // A 96-gon encloses n sin(2π/n) / 2π of the circle's area.
        const ratio = (96 * Math.sin((2 * Math.PI) / 96)) / (2 * Math.PI)
        expect(meshVolume(meshes) / (assemblyVolume(profile) * ratio), cutter.id).toBeCloseTo(1, 6)
        for (const m of meshes) {
          for (let k = 0; k < m.positions.length; k += 3) {
            const z = m.positions[k + 2]!
            expect(z).toBeGreaterThanOrEqual(-1e-6)
            expect(z).toBeLessThanOrEqual(profile.length + 1e-6)
          }
          expect(m.normals.length).toBe(m.positions.length)
          expect(m.indices.every((i) => i < m.positions.length / 3)).toBe(true)
        }
      }
    }
  })

  test("normals point away from the axis on the side wall", () => {
    const [cutting] = assemblyMeshes(base, { segments: 12 })
    let outward = 0
    for (let k = 0; k < cutting!.positions.length; k += 3) {
      const r = Math.hypot(cutting!.positions[k]!, cutting!.positions[k + 1]!)
      if (r < 4.99) continue
      if (cutting!.normals[k]! * cutting!.positions[k]! + cutting!.normals[k + 1]! * cutting!.positions[k + 1]! > 0) outward++
    }
    expect(outward).toBeGreaterThan(0)
  })
})
