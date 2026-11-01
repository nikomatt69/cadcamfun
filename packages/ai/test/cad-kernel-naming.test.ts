/**
 * `cad.kernel` end to end (spec 41 N7, spec 42 R0): the assistant asks for stable references, edits a dimension, and resolves the
 * references against the edited model; the naming health and the Boolean report come from the real kernel.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { ACTION_CONTRACTS } from "@cadcamfun/api"
import { runAction } from "../src/actions/catalogue.ts"
import type { ActionContext } from "../src/actions/action.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"

setDefaultTimeout(60_000)

const part = (extra: Array<Record<string, unknown>> = []) => ({
  parameters: { width: 40, depth: 30, thick: 10 },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "depth" }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "thick", operation: "new" },
    { id: "h", type: "hole", plane: "XY", offset: "thick", at: [20, 15], diameter: 8, depth: "thick" },
    ...extra
  ]
})
const context = { handlers: {}, projectId: "p" } as unknown as ActionContext
const call = async (input: Record<string, unknown>) => runAction("cad.kernel", input, context) as Promise<Record<string, any>>
const wire = (result: unknown) => Schema.decodeUnknownSync(ACTION_CONTRACTS["cad.kernel"]!.result! as Schema.Decoder<unknown>)(result)

describe("cad.kernel", () => {
  test("health: every entity of the plate has a stable name, the Booleans were exact, the answer matches the wire contract", async () => {
    const r = await call({ op: "health", history: part() })
    expect(r["ok"]).toBe(true)
    wire(r)
    const body = r["bodies"].find((b: any) => b.id === "plate")
    expect(body).toMatchObject({ unnamedFaces: 0, ordinalKeys: 0, duplicateKeys: 0, stable: true })
    expect(body.faces).toBe(7)
    expect(r["booleans"].failed).toBe(0)
    expect(r["booleans"].recoveredByDisplacement).toBe(0)
    expect(r["booleans"].calls).toBeGreaterThan(0)
    expect(r["booleans"].note).toContain("plain pipeline")
  })

  test("refs then resolve across an edit: the same named entities after the width goes from 40 to 48 and the thickness from 10 to 8", async () => {
    const listed = await call({ op: "refs", history: part(), kinds: ["face", "edge"] })
    expect(listed["ok"]).toBe(true)
    wire(listed)
    expect(listed["refs"].length).toBe(7 + 15)
    const top = listed["refs"].find((x: any) => x.key === "plate.top")
    expect(top.ref).toBe("face:plate|plate.top")
    const edge = listed["refs"].find((x: any) => x.key === "edge(plate.side0.0,plate.top)")
    expect(edge).toBeDefined()
    const resolved = await call({ op: "resolve", history: part(), refs: [top.ref, edge.ref], parameters: { width: 48, thick: 8 } })
    expect(resolved["ok"]).toBe(true)
    wire(resolved)
    expect(resolved["results"].map((x: any) => x.outcome)).toEqual(["exact", "exact"])
    expect(resolved["results"].map((x: any) => x.key)).toEqual(["plate.top", "edge(plate.side0.0,plate.top)"])
  })

  test("resolve reports a split, with every piece, when a later feature cuts the face", async () => {
    const slot = [
      { id: "s2", type: "sketch", plane: "XY", offset: "thick", sketch: { entities: [], constraints: [], shapes: [{ id: "r2", kind: "rectangle", at: [4, -2], width: 4, height: "depth + 4" }] } },
      { id: "slot", type: "extrude", sketch: "s2", depth: "thick", direction: "down", operation: "subtract" }
    ]
    const r = await call({ op: "resolve", history: part(slot), refs: ["face:plate|plate.top"] })
    expect(r["ok"]).toBe(true)
    expect(r["results"][0].outcome).toBe("split")
    expect(r["results"][0].indices.length).toBe(2)
    expect(r["results"][0].keys.every((k: string) => k.startsWith("plate.top"))).toBe(true)
  })

  test("refusals are typed: both or neither of elementId/history, a malformed reference, an unknown body", async () => {
    expect((await call({ op: "health" }))["error"]).toContain("exactly one")
    expect((await call({ op: "resolve", history: part(), refs: ["nonsense"] }))["_tag"]).toBe("ActionInvalidInput")
    const missing = await call({ op: "refs", history: part(), body: "ghost" })
    expect(missing["ok"]).toBe(false)
    expect(missing["error"]).toContain("ghost")
    const gone = await call({ op: "resolve", history: part(), refs: ["face:plate|plate.nothing"] })
    expect(gone["results"][0].outcome).toBe("deleted")
  })

  test("the cad-naming skill exists and names the five outcomes", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "cad-naming")
    expect(skill).toBeDefined()
    for (const word of ["exact", "split", "merged", "deleted", "ambiguous", "recoveredByDisplacement"]) expect(skill!.body).toContain(word)
  })
})
