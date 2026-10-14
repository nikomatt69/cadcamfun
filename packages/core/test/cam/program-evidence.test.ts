import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../src/cad/recipes.ts"
import { analyseGcode, DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath, programRecord, reliefsFor, targetMeshesFor } from "../../src/cam/generator/index.ts"
import { cuttingData, DEFAULT_CUTTERS, DEFAULT_MACHINE, findMaterial, recommendForSettings, sha256 } from "../../src/cam/kernel/index.ts"
import { verifyRequestFor, verifyToolpath } from "../../src/cam/verify/index.ts"

setDefaultTimeout(90_000)

/**
 * Every generated program carries an evidence record about its exact NC: inputs digest, tool, process values and the source
 * of the cutting data, the NC's SHA-256, and the checks run on the replay of that NC (safe height, rapids, stock, gouges
 * against the finished part). The fixture is the 120 x 80 x 12 mounting plate of `parametric-machining.test.ts`.
 */
const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = {
  id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0,
  history: { parameters: { ...recipe.history.parameters, tap: 4.2 }, features: [...recipe.history.features, { id: "tapped", type: "hole", plane: "XY", offset: "thick", at: ["width / 2", "depth / 2"], diameter: "tap", depth: "thick" }] }
}
const plateStock = { width: 126, height: 86, depth: 14, radius: 0, x: 60, y: 40, topZ: 0, allowance: 1 }
const requestFor = (over: Record<string, unknown>, stock: Record<string, unknown> | undefined = plateStock, elements: ReadonlyArray<unknown> = [plate]) => ({
  settings: { ...DEFAULT_SETTINGS, toolType: "endmill", toolDiameter: 6, depth: 12, stepdown: 2, ...over },
  geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: elements, ...(stock ? { stock } : {}) },
  printer: DEFAULT_PRINTER_EXTRAS
}) as never

const operations = {
  surface: requestFor({ operationType: "3d_surface", depth: 13, surfaceStrategy: "roughing", finishingPass: false }, { ...plateStock, topZ: 13 }),
  contour: requestFor({ operationType: "contour" }),
  pocket: requestFor({ operationType: "pocket" }),
  drill: requestFor({ operationType: "drill", toolType: "drill", toolDiameter: 5.5 }),
  threading: requestFor({ operationType: "threading", toolType: "threadmill", toolDiameter: 3 })
}
const generated = Object.fromEntries(Object.entries(operations).map(([k, r]) => [k, generateToolpath(r).response])) as Record<keyof typeof operations, ReturnType<typeof generateToolpath>["response"]>
const check = (r: { evidence?: { checks: ReadonlyArray<{ id: string; status: string }> } }, id: string) => r.evidence!.checks.find((c) => c.id === id)?.status

describe("the evidence record of a generated program", () => {
  test("every operation of the plate passes safe height, rapids, stock, interpretation and gouge against the part", () => {
    for (const [name, response] of Object.entries(generated)) {
      const e = response.evidence
      expect(e, name).toBeDefined()
      expect(e!.schema).toBe("cadcamfun/program-record@1")
      expect(e!.program.sha256, name).toBe(sha256(response.gcode))
      expect(e!.program.lines, name).toBe(response.stats.lines)
      for (const id of ["generated", "safe-height", "no-rapid-in-material", "within-stock", "no-gouge", "nc-interpretation"]) expect(`${name} ${id} ${check(response, id)}`).toBe(`${name} ${id} passed`)
      // Flute length and holder are not in the settings: the record says so instead of passing the check.
      expect(check(response, "tool-clearance")).toBe("unresolved")
      expect(e!.result).not.toBe("failed")
    }
  })

  test("a 120 x 80 x 12 plate in 3D surface roughing stays under 20 000 lines", () => {
    expect(generated.surface.evidence!.program.lines).toBeLessThan(20_000)
  })

  test("the same request gives the same NC hash and the same record", () => {
    const again = generateToolpath(operations.surface).response
    expect(again.gcode).toBe(generated.surface.gcode)
    expect(again.evidence).toEqual(generated.surface.evidence)
    expect(again.evidence!.inputs.digest).toMatch(/^[0-9a-f]{64}$/)
    // Any change of the input changes the digest.
    const other = generateToolpath(requestFor({ operationType: "contour", toolDiameter: 8 })).response
    expect(other.evidence!.inputs.digest).not.toBe(generated.contour.evidence!.inputs.digest)
  })

  test("a contour on the inside of the plate's outline cuts the part: the gouge check fails", () => {
    const inside = generateToolpath(requestFor({ operationType: "contour", offset: "inside" })).response
    expect(check(inside, "no-gouge")).toBe("failed")
    expect(inside.evidence!.result).toBe("failed")
  })

  test("a first rapid below the stock top fails the safe height and the rapid check", () => {
    const request = operations.surface
    const unsafe = generated.surface.gcode.replace("G0 Z23.000 ; Move to safe height", "G0 Z10 ; Move to safe height")
    expect(unsafe).not.toBe(generated.surface.gcode)
    const record = programRecord(request, unsafe, analyseGcode(unsafe).stats)
    expect(record.checks.find((c) => c.id === "safe-height")?.status).toBe("failed")
    expect(record.checks.find((c) => c.id === "no-rapid-in-material")?.status).toBe("failed")
    expect(record.program.sha256).not.toBe(generated.surface.evidence!.program.sha256)
  })

  test("thread milling cuts the thread form only inside the declared relief of the tapped hole", () => {
    const request = operations.threading
    const reliefs = reliefsFor(request)
    expect(reliefs).toHaveLength(1)
    expect(reliefs[0]!.radius).toBeCloseTo(2.52, 2)
    // Without the relief the replay finds the thread form below the modelled Ø4.2 wall: the relief is what makes it pass.
    const target = targetMeshesFor(request)!
    const built = verifyRequestFor(request, generated.threading.gcode, { target: { solids: [], meshes: target.map((m) => ({ positions: Array.from(m.positions), indices: Array.from(m.indices) })) } })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(verifyToolpath(built.request).issues.some((i) => i.code === "Gouge")).toBe(true)
    expect(verifyToolpath({ ...built.request, target: { ...built.request.target!, reliefs } }).issues.some((i) => i.code === "Gouge")).toBe(false)
  })

  test("a selection that is not a finished part leaves the gouge check unresolved, never passed", () => {
    const cube = { id: "c", type: "cube", x: 0, y: 0, z: 5, width: 40, height: 30, depth: 10 }
    const r = generateToolpath(requestFor({ operationType: "pocket", depth: 4 }, { width: 60, height: 50, depth: 12, radius: 0, x: 0, y: 0, topZ: 10, allowance: 0 }, [cube])).response
    expect(check(r, "no-gouge")).toBe("unresolved")
  })

  test("a lathe program records the checks as not run, not passed", () => {
    const r = generateToolpath({ settings: { ...DEFAULT_SETTINGS, machineType: "lathe", operationType: "turning", toolType: "turning" }, geometry: DEFAULT_GEOMETRY, printer: DEFAULT_PRINTER_EXTRAS } as never).response
    expect(r.evidence!.cuttingData.status).toBe("not-applicable")
    for (const id of ["safe-height", "no-rapid-in-material", "no-gouge"]) expect(check(r, id)).toBe("not-run")
  })

  test("evidence can be turned off by the request", () => {
    expect(generateToolpath({ ...(operations.contour as object), evidence: false } as never).response.evidence).toBeUndefined()
  })
})

describe("the cutting data of a program names its table row", () => {
  test("settings at the kernel's recommendation are recorded as kernel data with the MATERIALS row", () => {
    const base = (operations.contour as { settings: Record<string, unknown> }).settings
    const rec = recommendForSettings(base as never)!
    const r = generateToolpath(requestFor({ operationType: "contour", ...rec.patch })).response
    const cd = r.evidence!.cuttingData
    expect(cd.status).toBe("kernel")
    expect(cd.reference?.table).toBe("MATERIALS")
    expect(cd.reference?.row).toBe("al-6061-t6")
    expect(cd.recommended?.rpm).toBe(rec.data.rpm)
    expect(check(r, "cutting-data")).toBe("passed")
  })

  test("other values are recorded as manual with their deviation from the row", () => {
    const cd = generated.contour.evidence!.cuttingData
    expect(cd.status).toBe("manual")
    expect(cd.detail).toMatch(/rpm 10000 vs \d+ \(-\d+%\)/)
    expect(cd.reference?.row).toBe("al-6061-t6")
    expect(check(generated.contour, "cutting-data")).toBe("unresolved")
  })

  test("the reference reproduces the recommended cutting speed: column x tool material x coating x cut factor", () => {
    for (const grade of ["al-6061-t6", "steel-c45", "stainless-304", "titanium-ti6al4v", "cast-iron-gg25"]) {
      const material = findMaterial(grade)
      if (material === undefined) continue
      for (const cutter of DEFAULT_CUTTERS.filter((c) => c.kind === "flat" || c.kind === "drill").slice(0, 4)) {
        for (const cut of cutter.kind === "drill" ? (["drill"] as const) : (["rough-side", "finish-wall", "adaptive"] as const)) {
          const d = cuttingData({ material, cutter, cut, machine: DEFAULT_MACHINE.limits })
          const ref = d.reference
          expect(ref.row).toBe(material.id)
          const speedKey = Object.keys(ref.columns).find((k) => k.startsWith("vc"))!
          const drill = cut === "drill" ? ref.columns["drillSpeedFactor"]! : 1
          const vc = ref.columns[speedKey]! * ref.factors["toolMaterialSpeed"]! * ref.factors["coating"]! * ref.factors["cutSpeed"]! * drill
          expect(Math.abs(vc - d.vcRecommended) / d.vcRecommended, `${grade} ${cutter.id} ${cut}`).toBeLessThan(0.01)
        }
      }
    }
  })
})
