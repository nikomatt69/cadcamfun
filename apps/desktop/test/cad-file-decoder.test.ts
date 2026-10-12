import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import createOcct, { type OcctModule } from "occt-import-js"
import { decodeCadFile } from "../src/features/ai/lib/cad-file-decoder.ts"
import { normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
const require = createRequire(import.meta.url)
const root = dirname(dirname(require.resolve("occt-import-js")))
let kernel: OcctModule
beforeAll(async () => { kernel = await createOcct({ wasmBinary: new Uint8Array(readFileSync(join(root, "dist/occt-import-js.wasm"))), print: () => {}, printErr: () => {} }) }, 60_000)
const decode = (format: "step" | "iges" | "brep", path: string) => JSON.parse(decodeCadFile(kernel, format, new Uint8Array(readFileSync(join(root, "test/testfiles", path))), path))
const extents = (mesh: { vertices: Array<{ x: number; y: number; z: number }> }) => (["x", "y", "z"] as const).map((axis) => Math.max(...mesh.vertices.map((p) => p[axis])) - Math.min(...mesh.vertices.map((p) => p[axis])))
describe("real OpenCascade neutral CAD decoder", () => {
  test("STEP and IGES decode the same actual 10mm cube with source face metadata", () => {
    for (const [format, file] of [["step", "cube-10x10mm/Cube 10x10.stp"], ["iges", "cube-10x10mm/Cube 10x10.igs"]] as const) {
      const result = decode(format, file)
      expect(result.elements.length).toBeGreaterThan(0)
      expect(extents(result.elements[0])).toEqual([10, 10, 10])
      expect(normalizeElement(result.elements[0]).ok).toBe(true)
      expect(result.elements[0].sourceMetadata.brepFaces.length).toBeGreaterThan(0)
    }
  }, 60_000)
  test("STEP unit declarations produce equivalent mm geometry", () => {
    const sizes = ["cube-mm.step", "cube-m.step", "cube-in.step"].map((file) => extents(decode("step", `cube-units/${file}`).elements[0]))
    for (const size of sizes.slice(1)) size.forEach((value, i) => expect(value).toBeCloseTo(sizes[0]![i]!, 6))
  }, 60_000)
  test("native BREP geometry is decoded and does not invent a unit declaration", () => {
    const result = decode("brep", "cax-if-brep/as1_pe_203.brep")
    expect(result.elements.length).toBeGreaterThan(0)
    expect(result.source.units).toBe("source units")
    expect(result.elements.every((e: Record<string, unknown>) => normalizeElement(e).ok)).toBe(true)
  }, 60_000)
  test("unreadable input fails rather than replacing geometry with a placeholder", () => {
    expect(() => decodeCadFile(kernel, "step", new TextEncoder().encode("not a STEP model"), "bad.step")).toThrow()
  })
})
