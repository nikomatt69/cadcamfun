/** External reader oracle: an internal writer/reader round-trip can share a wire-format mistake. */
import { expect, test, setDefaultTimeout } from "bun:test"
import { createRequire } from "node:module"
import { brep, model, rebuildExact, type History } from "@cadcamfun/core"
setDefaultTimeout(120_000)
interface ImportedMesh { attributes: { position: { array: number[] } }; index: { array: number[] } }
interface Imported { success: boolean; meshes: ImportedMesh[] }
interface Occt {
  ReadIgesFile(content: Uint8Array, parameters: Record<string, unknown>): Imported
  ReadStepFile(content: Uint8Array, parameters: Record<string, unknown>): Imported
}
const volume = (meshes: ImportedMesh[]): number => {
  let v = 0
  for (const mesh of meshes) {
    const p = mesh.attributes.position.array, ix = mesh.index.array
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i]! * 3, b = ix[i + 1]! * 3, c = ix[i + 2]! * 3
      v += p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)
    }
  }
  return v / 6
}

test("OpenCascade reads IGES primitive and drilled-part geometry at the expected volumes", async () => {
  const factory = createRequire(import.meta.url)("occt-import-js") as () => Promise<Occt>
  const occt = await factory()
  const f = brep.frame({ x: 12, y: -7, z: 5 }, { x: 1, y: 2, z: 3 })
  const shapes = [brep.makeBox(10, 12, 14, f), brep.makeCylinder(4, 10, f), brep.makeCone(4, 2, 10, f), brep.makeSphere(5, f), brep.makeTorus(8, 2, f), brep.booleanBrep(brep.makeBox(20, 20, 10), brep.makeCylinder(3, 10, brep.frame({ x: 10, y: 10, z: 0 })), "subtract").brep]
  for (const shape of shapes) {
    const text = brep.writeIgesBreps([{ name: "Oracle", brep: shape }])
    // Numeric fields end at a delimiter before crossing physical records; splitting 14 into 1 / 4 lost a box vertex.
    for (const line of text.split("\n").filter((l) => l[72] === "P")) expect(line.slice(0, 64).trimEnd()).toMatch(/[,;]$/)
    const imported = occt.ReadIgesFile(new TextEncoder().encode(text), { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: 0.002, angularDeflection: 0.1 })
    expect(imported.success).toBe(true)
    expect(imported.meshes.length).toBeGreaterThan(0)
    const expected = brep.massProperties(shape).volume
    expect(Math.abs(volume(imported.meshes) - expected) / expected).toBeLessThan(0.002)
  }
})

test("OpenCascade reads nominal ellipse and Bezier STEP exports at their analytic volumes", async () => {
  const factory = createRequire(import.meta.url)("occt-import-js") as () => Promise<Occt>
  const occt = await factory()
  const ellipse = model(), slender = model(), bezier = model(), revolve = model(), sweep = model()
  ellipse.extrude(ellipse.sketch("XY").ellipse([0, 0], 12, 6, { segments: 8 }), { depth: 4 })
  slender.extrude(slender.sketch("XY").ellipse([3, -2], 80, 2), { depth: 3 })
  bezier.extrude(bezier.sketch("XY").curve("bezier", [[0, 0], [4, 8], [8, 8], [12, 0]], { chord: true, divisions: 4 }), { depth: 2 })
  revolve.revolve(revolve.sketch("XY").ellipse([3, 10], 2, 1), { axis: "x" })
  sweep.sweep(sweep.sketch("XY").ellipse([0, 0], 3, 1), sweep.sketch("YZ").path([[0, 0], [0, 10]]))
  const cases: ReadonlyArray<readonly [History, number]> = [
    [ellipse.build(), Math.PI * 12 * 6 * 4], [slender.build(), Math.PI * 80 * 2 * 3], [bezier.build(), 96],
    [revolve.build(), 40 * Math.PI ** 2], [sweep.build(), Math.PI * 3 * 10]
  ]
  for (const [history, expected] of cases) {
    const shape = rebuildExact(history).bodies[0]!.brep!
    const text = brep.writeStepBreps([{ name: "Nominal curves", brep: shape }])
    const imported = occt.ReadStepFile(new TextEncoder().encode(text), { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: 0.001, angularDeflection: 0.05 })
    expect(imported.success).toBe(true)
    expect(imported.meshes.length).toBeGreaterThan(0)
    expect(Math.abs(volume(imported.meshes) - expected) / expected).toBeLessThan(0.001)
  }
})
