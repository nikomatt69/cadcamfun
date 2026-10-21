/** External reader oracle: an internal writer/reader round-trip can share a wire-format mistake. */
import { expect, test, setDefaultTimeout } from "bun:test"
import { createRequire } from "node:module"
import { brep } from "@cadcamfun/core"
setDefaultTimeout(120_000)
interface ImportedMesh { attributes: { position: { array: number[] } }; index: { array: number[] } }
interface Imported { success: boolean; meshes: ImportedMesh[] }
interface Occt { ReadIgesFile(content: Uint8Array, parameters: Record<string, unknown>): Imported }
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
