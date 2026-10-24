/** External reader oracle for the exact modelled thread: an internal writer/reader round trip can share a mistake. */
import { expect, setDefaultTimeout, test } from "bun:test"
import { createRequire } from "node:module"
import { brep, cad } from "@cadcamfun/core"
setDefaultTimeout(180_000)

interface ImportedMesh { attributes: { position: { array: number[] } }; index: { array: number[] } }
interface Occt { ReadStepFile(content: Uint8Array, parameters: Record<string, unknown>): { success: boolean; meshes: ImportedMesh[] } }
const meshVolume = (meshes: ImportedMesh[]): number => {
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

test("OpenCascade reads the STEP of an exact M6 and a 1/2-13 UNC thread at 0.1 % of their volume", async () => {
  const occt = await (createRequire(import.meta.url)("occt-import-js") as () => Promise<Occt>)()
  for (const spec of [
    { diameter: 6, pitch: 1, length: 10, internal: false },
    { diameter: 12.7, pitch: 25.4 / 13, length: 20, internal: false }
  ]) {
    const b = cad.makeThreadBrep(spec)
    const step = brep.writeStepBreps([{ name: "thread", brep: b }], { author: "oracle" })
    const imported = occt.ReadStepFile(new TextEncoder().encode(step), { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: 0.002, angularDeflection: 0.1 })
    expect(imported.success).toBe(true)
    const expected = brep.massProperties(b).volume
    expect(Math.abs(meshVolume(imported.meshes) - expected) / expected).toBeLessThan(0.001)
    // And the analytic volume of the thread itself, not only the kernel's own: Pappus for the ridge plus the core.
    const analytic = cad.exactThreadVolume(spec) as number
    expect(Math.abs(meshVolume(imported.meshes) - analytic) / analytic).toBeLessThan(0.002)
  }
})
