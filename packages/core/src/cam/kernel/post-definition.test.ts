import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { BUILTIN_DEFINITIONS } from "../post/index.ts"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(110_000)

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
const job = (post?: ManufacturingJob["post"]): ManufacturingJob => ({
  schemaVersion: 1, id: "plate-job", name: "Plate", material: "6061", part: { kind: "elements", elements: [plate] },
  stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }, ...(post !== undefined ? { post } : {})
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("a post definition in a kernel job (spec 54 C1)", () => {
  const plain = ok(runJob(job()))
  const custom = ok(runJob(job({ definition: { ...BUILTIN_DEFINITIONS.fanuc, name: "Shop", setup: ["G90", "G17", "G94", "G40", "G49", "G80", "G61"], toolChange: ["T{tool} M6", "G43 H{tool}", "(TOOL {tool} IN)"] } })))

  test("the definition's words are in the NC and nothing else changed", () => {
    expect(custom.nc).toContain("G90 G17 G94 G40 G49 G80 G61")
    expect(custom.nc).toMatch(/T\d+ M6\nG43 H(\d+)\n\(TOOL \1 IN\)/)
    expect(plain.nc).not.toContain("IN)")
    // The same motion: dropping the added words gives the plain program back.
    const strip = (nc: string) => nc.split("\n").filter((l) => !/^\(TOOL \d+ IN\)$/.test(l)).map((l) => l.replace(" G61", "")).join("\n")
    expect(strip(custom.nc)).toBe(strip(plain.nc))
  })

  test("the independent replay accepts it and the claims do not change", () => {
    expect(custom.claims.map((c) => [c.id, c.status])).toEqual(plain.claims.map((c) => [c.id, c.status]))
    expect(custom.release).toBe(plain.release)
  })

  test("a built-in written as a definition is the machine's own Fanuc post, byte for byte", () => {
    const asData = ok(runJob(job({ definition: BUILTIN_DEFINITIONS.fanuc })))
    expect(asData.nc).toBe(plain.nc)
  })

  test("a bad definition fails the job before planning, naming the field", () => {
    const r = runJob(job({ definition: { ...BUILTIN_DEFINITIONS.fanuc, toolChange: ["T{toool} M6"] } }))
    expect(r.status).toBe("failed")
    if (r.status === "failed") {
      expect(r.issues.map((i) => i.message).join("\n")).toContain("toolChange[0]")
      expect(r.issues[0]!.stage).toBe("prepare")
    }
  })
})
