import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { HUMAN_APPROVAL } from "../src/nikcli/permission-modes.ts"
import { historyVolume, rebuild, withParameter, type History } from "@cadcamfun/core"
import { normalizeElement } from "../src/element-catalog.ts"
import { decodeHistory, parseHistory, parametricReport } from "../src/parametric.ts"
import { CADCAM_SKILLS, FUSION_EXAMPLE_HISTORY } from "../src/skills/index.ts"
import { PRIMITIVE_ELEMENTS } from "@cadcamfun/core"
import { Schema } from "effect"
import { PARAMETRIC_ACTION_INPUTS } from "@cadcamfun/api"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { TOOL_IDS } from "../src/tools/registry.ts"

setDefaultTimeout(60_000)

const parse = (history: unknown) => decodeHistory(history)

describe("the history schema offers the Fusion 360 commands to the assistant", () => {
  test("the skill's own example is valid, builds, and a parameter edit resizes it", () => {
    const parsed = parse(FUSION_EXAMPLE_HISTORY)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const built = rebuild(parsed.data as History)
    expect(built.issues.filter((i) => i.severity === "error")).toEqual([])
    // Plate with a slot cut through, and three posts standing on it.
    const plate = 80 * 50 * 8 - ((30 - 6) * 6 + Math.PI * 9) * 8
    const posts = 3 * Math.PI * 25 * 10
    expect(historyVolume(built)).toBeGreaterThan((plate + posts) * 0.97)
    expect(historyVolume(built)).toBeLessThan((plate + posts) * 1.03)
    const wider = rebuild(withParameter(parsed.data as History, "width", 120))
    expect(historyVolume(wider)).toBeGreaterThan(historyVolume(built) + 40 * 50 * 8 * 0.97)
  })

  test("every new feature type and shape kind passes the schema", () => {
    const base = { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 10, height: 10 }] } }
    const withFeature = (feature: unknown) => parse({ parameters: {}, features: [base, { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" }, feature] })
    for (const feature of [
      { id: "p", type: "primitive", element: "sphere", params: { radius: 5 }, operation: "union" },
      { id: "c", type: "coil", radius: 10, pitch: 5, turns: 3, wireDiameter: 2, operation: "new" },
      { id: "m", type: "move", translate: [1, 2, 3], rotate: { axis: "z", angle: 90 }, copy: true },
      { id: "k", type: "scale", factor: [1, 2, 3] },
      { id: "sp", type: "split", plane: "XY", offset: 2, keep: "both" },
      { id: "cb", type: "combine", target: "e", tools: ["p"], operation: "cut" }
    ]) expect(withFeature(feature).success, JSON.stringify(feature)).toBe(true)
    for (const shape of [
      { id: "a", kind: "circle", at: [0, 0], diameter: 5 }, { id: "b", kind: "polygon", at: [0, 0], sides: 6, radius: 5 },
      { id: "c", kind: "ellipse", at: [0, 0], radiusX: 5, radiusY: 3 }, { id: "d", kind: "slot", at: [0, 0], length: 20, width: 5 },
      { id: "e", kind: "polyline", points: [[0, 0], [5, 0], [5, 5]] }, { id: "f", kind: "curve", curve: "nurbs", points: [[0, 0], [5, 5], [10, 0]] }
    ]) expect(parse({ parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [shape] } }] }).success, JSON.stringify(shape)).toBe(true)
  })

  test("a sketch with nothing in it is refused, and so are a one-sided polygon and an unknown shape", () => {
    expect(parse({ parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: {} }] }).success).toBe(false)
    expect(parse({ parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "x", kind: "polygon", at: [0, 0], sides: 2, radius: 5 }] } }] }).success).toBe(false)
    expect(parse({ parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "x", kind: "star", at: [0, 0] }] } }] }).success).toBe(false)
  })

  test("the shared wire schema and assistant preserve chamfer callouts and rebuild their expressions", () => {
    const base = {
      parameters: { second: 1, degrees: 30 },
      features: [
        { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40, height: 25 }] } },
        { id: "e", type: "extrude", sketch: "s", depth: 6, operation: "new" }
      ]
    }
    for (const callout of [{ secondDistance: 1 }, { secondDistance: "second" }, { angle: 30 }, { angle: "degrees" }]) {
      const feature = { id: "ch", type: "fillet", style: "chamfer", radius: 2, edges: { within: { min: [0, 0, 5.5], max: [40, 25, 6.5] } }, ...callout }
      const history = { ...base, features: [...base.features, feature] }
      const wire = Schema.decodeUnknownSync(PARAMETRIC_ACTION_INPUTS["cad.parametric_validate"])({ history })
      expect(wire.history.features.at(-1)).toMatchObject(callout)
      const parsed = parseHistory(history) as History
      expect(parsed.features.at(-1)).toMatchObject(callout)
      const report = parametricReport(parsed)
      expect(report.ok, JSON.stringify(callout)).toBe(true)
      const lower = historyVolume(rebuild(parsed))
      expect(lower).toBeLessThan(40 * 25 * 6)
      expect(lower).toBeGreaterThan(40 * 25 * 5)
    }
    for (const callout of [{ secondDistance: 0 }, { secondDistance: -1 }, { angle: 0 }, { angle: 90 }, { secondDistance: 1, angle: 30 }, { style: "fillet", secondDistance: 1 }]) {
      const history = { ...base, features: [...base.features, { id: "ch", type: "fillet", style: "chamfer", radius: 2, ...callout }] }
      expect(parse(history).success, JSON.stringify(callout)).toBe(false)
    }
    // Expressions pass the structural schema, then the kernel checks the resolved value.
    const invalid = parseHistory({ ...base, parameters: { second: -1 }, features: [...base.features, { id: "ch", type: "fillet", style: "chamfer", radius: 2, secondDistance: "second" }] }) as History
    expect(parametricReport(invalid).ok).toBe(false)
  })

  test("a hand-drawn constraint can name a point a shape made; a missing one is reported", () => {
    const sketch = (ref: string) => parse({
      parameters: {},
      features: [{ id: "s", type: "sketch", plane: "XY", sketch: { entities: [{ id: "extra", kind: "point", x: 30, y: 30 }], constraints: [{ type: "coincident", a: ref, b: "extra" }], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 10, height: 10 }] } }]
    })
    expect(sketch("r.p2").success).toBe(true)
    expect(sketch("r.nothing").success).toBe(false)
  })

  test("a parametric element with shapes is created by cad_edit add and rebuilds", () => {
    const history = { parameters: { d: 24 }, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "c", kind: "circle", at: [0, 0], diameter: "d" }] } }, { id: "x", type: "extrude", sketch: "s", depth: 6, operation: "new" }] }
    const made = normalizeElement({ type: "parametric", history })
    expect(made.ok).toBe(true)
    const report = parametricReport(parseHistory(history) as History)
    expect(report.ok).toBe(true)
    expect(normalizeElement({ type: "parametric", history: { parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "sl", kind: "slot", at: [0, 0], length: 4, width: 8 }] } }, { id: "x", type: "extrude", sketch: "s", depth: 6, operation: "new" }] } }))
      .toMatchObject({ ok: false })
  })
})

describe("the assistant is told about them", () => {
  test("the Fusion 360 skill is shipped and names every new capability", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "fusion-360-modelling")
    expect(skill).toBeDefined()
    for (const word of ["rectangle", "slot", "polygon", "ellipse", "nurbs", "bezier", "spline", "sweep", "revolve", "loft", "coil", "primitive", "combine", "split", "move", "scale", "pattern", "mirror", "parameters"]) {
      expect(skill!.body, word).toContain(word)
    }
    // The example is embedded for real, not as the text of a template placeholder.
    expect(skill!.body).toContain(`"slot_cut"`)
    expect(skill!.body).not.toContain("FUSION_EXAMPLE_HISTORY")
  })

  test("the parametric skill and the modeller point at it", async () => {
    const parametric = CADCAM_SKILLS.find((s) => s.name === "parametric-design")!
    expect(parametric.body).toContain("fusion-360-modelling")
    const modeler = await Bun.file(new URL("../src/nikcli/prompts/modeler.txt", import.meta.url)).text()
    expect(modeler).toContain("fusion-360-modelling")
    const system = await Bun.file(new URL("../src/prompts/base/modelling.txt", import.meta.url)).text()
    expect(system).toContain("fusion-360-modelling")
  })
})

describe("recipes still behave", () => {
  test("the recipe schema is unchanged for the existing standard parts", () => {
    expect(Schema.is(PARAMETRIC_ACTION_INPUTS["cad.parametric_recipe"])({ recipe: "flange" })).toBe(true)
  })
})

describe("nikcli's policy and permission layers govern the new capabilities", () => {
  type Config = { agent: Record<string, { permission?: Record<string, unknown> }> }
  const host = (policies: ReadonlyArray<{ effect: "allow" | "deny"; action: string; resource: string }>) =>
    buildHostConfig({ providers: [], toolIds: [...TOOL_IDS], systemPrompt: "x", policies: [...policies] }) as unknown as Config

  test("a tool.use deny on cad_edit takes parametric creation away from the agent and every specialist, validation stays", () => {
    const config = host([{ effect: "deny", action: "tool.use", resource: "cad_edit" }])
    const holders: string[] = []
    for (const [name, agent] of Object.entries(config.agent)) {
      if (agent.permission === undefined) continue
      expect(agent.permission["cad_edit"], `${name} must not create parts`).not.toBe("allow")
      expect(agent.permission["cad_edit"], `${name} must not ask to create parts`).not.toEqual(HUMAN_APPROVAL)
      if (agent.permission["cad"] === "allow") holders.push(name)
    }
    // The tool that validates a history (cad parametric_validate) is a different tool and is still there.
    expect(holders).toContain("cadcam-build")
    expect(holders.length).toBeGreaterThan(1)
  })

  test("by default creating a part asks the person, only the agent, the editor and the modeller can, and every specialist can still validate", () => {
    const config = host([])
    const can = (name: string, tool: string) => config.agent[name]?.permission?.[tool]
    for (const name of ["cadcam-build", "cadcam-editor", "cadcam-modeler"]) expect(can(name, "cad_edit"), name).toEqual(HUMAN_APPROVAL)
    for (const name of ["cadcam-worker", "cadcam-reviewer", "cadcam-planner", "cadcam-diagnostician", "cadcam-machinist", "cadcam-verifier", "cadcam-optimizer"]) {
      expect(can(name, "cad_edit"), `${name} must not create parts`).toBeUndefined()
      expect(can(name, "cad"), `${name} reads the drawing and validates histories`).toBe("allow")
    }
    // Ask retains human approval; Auto delegates creation to the native classifier and denies deletion.
    expect(can("cadcam-modeler-ask", "cad_edit")).toEqual(HUMAN_APPROVAL)
    expect(can("cadcam-modeler-auto", "cad_edit")).toMatchObject({ "*": "ask", "action:delete": "deny" })
  })

  test("the catalogue marks the parametric writes as writes and the validation as a read, which is what the bridge and code_mode scope by", async () => {
    const { actionById } = await import("../src/actions/catalogue.ts")
    const kind = (id: string) => actionById(id)?.kind
    for (const id of ["cad_edit.parametric_create", "cad_edit.parametric_update", "cad_edit.parametric_recipe_create"]) expect(kind(id), id).toBe("write")
    for (const id of ["cad.parametric_validate", "cad.parametric_test", "cad.parametric_dfm", "cad.parametric_recipe", "cad.parametric_from_element"]) expect(kind(id), id).toBe("read")
    expect(kind("cad_edit.parametric_convert")).toBe("write")
  })
})

describe("every catalogue solid can be placed in a history, and the assistant can make a drawn element parametric", () => {
  test("each element type passes the schema as a primitive and builds with its default-ish measures", () => {
    const measures: Record<string, { params?: Record<string, number>; options?: Record<string, string>; extra?: Record<string, unknown> }> = {
      cube: { params: { width: 10, height: 10, depth: 10 } }, sphere: { params: { radius: 5 } }, ellipsoid: { params: { radiusX: 5, radiusY: 4, radiusZ: 3 } },
      cylinder: { params: { radius: 5, height: 10 } }, cone: { params: { radius: 5, height: 10 } }, prism: { params: { radius: 5, height: 10, sides: 6 } },
      pyramid: { params: { baseWidth: 10, baseDepth: 10, height: 10 } }, hemisphere: { params: { radius: 5 } }, capsule: { params: { radius: 3, height: 12 } },
      torus: { params: { radius: 10, tubeRadius: 2 } }, gear: { params: { moduleValue: 2, teeth: 20, thickness: 5, holeDiameter: 6 } },
      extrusion: { params: { depth: 4 }, options: { shape: "profile" }, extra: { profile: [[0, 0], [10, 0], [0, 10]] } },
      revolution: { options: { axis: "y" }, extra: { profile: [[0, 0], [8, 0], [8, 10], [0, 10]] } },
      sweep: { params: { radius: 2 }, extra: { path: [[0, 0, 0], [20, 0, 0], [20, 20, 0]] } },
      loft: { extra: { radii: [8, 4], positions: [[0, 0, 0], [0, 0, 20]] } },
      spring: { params: { radius: 10, wireRadius: 1, turns: 4, height: 30 } }, bolt: { params: { length: 20 }, options: { size: "M6" } }, screw: { params: { length: 12 }, options: { size: "M4" } },
      nut: { options: { size: "M6" } }, washer: { params: { outerDiameter: 12, thickness: 1 }, options: { size: "M6" } },
      wall: { params: { length: 50, thickness: 5, height: 30 } }, floor: { params: { width: 50, depth: 40, thickness: 4 } }, window: { params: { width: 20, height: 30, thickness: 2 } },
      door: { params: { width: 20, height: 40, thickness: 2 } }, column: { params: { radius: 5, height: 40 }, options: { style: "doric" } },
      roof: { params: { width: 50, depth: 40, height: 20 } }, stair: { params: { width: 30, height: 30, depth: 40, steps: 6 } }
    }
    for (const element of PRIMITIVE_ELEMENTS) {
      const m = measures[element]
      expect(m, `${element} has measures here`).toBeDefined()
      const history = { parameters: {}, features: [{ id: "p", type: "primitive", element, ...(m!.params ? { params: m!.params } : {}), ...(m!.options ? { options: m!.options } : {}), ...(m!.extra ?? {}), operation: "new" }] }
      const parsed = parse(history)
      expect(parsed.success, `${element}: ${parsed.success ? "" : JSON.stringify(parsed.problems.slice(0, 2))}`).toBe(true)
      if (!parsed.success) continue
      const built = rebuild(parsed.data as History)
      expect(built.issues.filter((i) => i.severity === "error"), element).toEqual([])
      expect(built.bodies, element).toHaveLength(1)
    }
  })

  test("the tool prompts and the skill tell the assistant about the conversion", async () => {
    const cad = await Bun.file(new URL("../src/tools/prompts/cad.txt", import.meta.url)).text()
    const edit = await Bun.file(new URL("../src/tools/prompts/cad_edit.txt", import.meta.url)).text()
    expect(cad).toContain("parametric_from_element")
    expect(edit).toContain("parametric_convert")
    expect(CADCAM_SKILLS.find((s) => s.name === "fusion-360-modelling")!.body).toContain("parametric_convert")
  })
})
