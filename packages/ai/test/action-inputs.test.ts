/**
 * AI-11 Step 1 / RM-01: the library, parts, memory, research, version-control and delegation inputs are declared once in
 * Effect (`@cadcamfun/api`). The nikcli schema the host validates with is derived from them, so for every fixture the two
 * agree on what is accepted, and what they accept is what the zod declarations they replaced accepted.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { LIBRARY_ACTION_INPUTS, MEMORY_ACTION_INPUTS, VCS_ACTION_INPUTS } from "@cadcamfun/api"
import { actionById } from "../src/actions/catalogue.ts"
import { executeActionOutcome } from "../src/actions/action.ts"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const INPUTS: Record<string, Schema.Codec<unknown, unknown>> = { ...LIBRARY_ACTION_INPUTS, ...MEMORY_ACTION_INPUTS, ...VCS_ACTION_INPUTS } as never
const uuid = "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f"

/** Accepted and refused arguments per action, as the zod declarations they replaced judged them. */
const FIXTURES: Record<string, { readonly accept: ReadonlyArray<unknown>; readonly refuse: ReadonlyArray<unknown> }> = {
  "library.component_list": { accept: [{}], refuse: [[], null] },
  "library.lookup_component": { accept: [{}, { query: "" }, { query: "bracket" }], refuse: [{ query: 3 }] },
  "library.lookup_material": { accept: [{ query: "6061" }], refuse: [{}, { query: null }] },
  "library.lookup_tool": { accept: [{ query: "6mm" }], refuse: [{}] },
  "library.lookup_machine_config": { accept: [{}, { query: "haas" }], refuse: [{ query: [] }] },
  "parts.save": { accept: [{ ids: ["a"], name: "Bracket" }, { ids: ["a"], name: "Bracket", description: "L-bracket", type: "mechanical", isPublic: true }], refuse: [{ ids: [], name: "B" }, { ids: [""], name: "B" }, { ids: ["a"], name: "" }] },
  "parts.insert": {
    accept: [{ componentId: "c" }, { componentId: "c", transform: { move: { x: 1, y: 2, z: 3 }, rotate: { axis: "z", degrees: 90 } } }],
    refuse: [{ componentId: "" }, { componentId: "c", transform: { rotate: { axis: "w", degrees: 90 } } }, { componentId: "c", transform: { move: { x: 1 } } }]
  },
  "parts.delete": { accept: [{ componentId: "c", confirm: true }], refuse: [{ componentId: "c" }, { componentId: "c", confirm: false }] },
  "library_edit.upsert_material": {
    accept: [{ name: "6061-T6" }, { id: "m", name: "Steel", properties: { density: 7.85, iso: "P", magnetic: true }, isPublic: true }],
    refuse: [{ name: "" }, { name: "x", properties: { density: { value: 1 } } }]
  },
  "library_edit.upsert_tool": {
    accept: [{ name: "6mm flat", type: "flat", diameter: 6, material: "carbide", numberOfFlutes: 3 }, { name: "ball", type: "ballendmill", diameter: 6, material: "carbide", cornerRadius: 0, tipAngle: 90, holderDiameter: 25, holderLength: 40, stickout: 30 }],
    refuse: [{ name: "x", type: "flat", diameter: 6, material: "carbide", cornerRadius: -1 }, { name: "x", type: "flat", diameter: 6, material: "carbide", stickout: 0 }, { name: "x", type: "flat", diameter: 0, material: "carbide" }, { name: "x", type: "flat", diameter: 6, material: "carbide", numberOfFlutes: 2.5 }, { name: "x", type: "flat", material: "carbide" }]
  },
  "library_edit.upsert_machine_config": {
    // The control is optional: the machine's own words decide the post, and a machine without a post is still a machine.
    accept: [{ name: "VF2", kind: "mill", postProcessor: "haas" }, { name: "VF2", kind: "mill" }, { name: "VF2", kind: "mill", postProcessor: "haas", kinematics: { x: { min: 0, max: 762 } }, maxFeed: 25_400 }],
    refuse: [{ name: "VF2", kind: "laser", postProcessor: "haas" }, { name: "VF2", kind: "mill", postProcessor: "haas", maxRPM: 0 }]
  },
  "library_edit.upsert_library_item": {
    accept: [{ name: "Vise", category: "setup", type: "fixture", data: { jawWidth: 150 } }],
    refuse: [{ name: "Vise", category: "setup", type: "fixture" }, { name: "Vise", category: "", type: "fixture", data: {} }]
  },
  "library_edit.set_cost": {
    accept: [{ kind: "material", materialId: "m", costPerUnit: 4 }, { kind: "operation", name: "Mill", machineHourlyRate: 60, operatorHourlyRate: 35 }],
    refuse: [{ kind: "paint" }, { kind: "material", costPerUnit: -1 }]
  },
  "library_edit.set_default": { accept: [{}, { materialId: "m", toolId: "t" }], refuse: [{ materialId: 1 }] },
  "library_edit.delete": { accept: [{ kind: "tool", id: "t", confirm: true }], refuse: [{ kind: "tool", id: "t" }, { kind: "part", id: "t", confirm: true }] },
  "memory.recall": { accept: [{}, { prefix: "cam." }], refuse: [{ prefix: 1 }] },
  "memory.context_read": { accept: [{}], refuse: [[]] },
  "memory_edit.remember": { accept: [{ key: "units.default", value: "mm" }], refuse: [{ key: "has space", value: "mm" }, { key: "k", value: "" }, { key: "k".repeat(81), value: "v" }] },
  "memory_edit.context_update": { accept: [{ heading: "Tolerances", content: "ISO 2768-m" }], refuse: [{ heading: "", content: "x" }, { heading: "h", content: "" }, { heading: "h".repeat(81), content: "x" }] },
  "research.search": { accept: [{ query: "6061 cutting speed" }, { query: "x", numResults: 8 }], refuse: [{ query: "" }, { query: "x", numResults: 9 }, { query: "x", numResults: 1.5 }] },
  "research.read_attachment": { accept: [{ attachment: "notes.txt" }, { attachment: "a", offset: 10, maxChars: 20_000 }], refuse: [{ attachment: "" }, { attachment: "a", offset: -1 }, { attachment: "a", maxChars: 0 }] },
  "vcs.checkpoints": { accept: [{}], refuse: [[], null] },
  "vcs_edit.checkpoint": { accept: [{ label: "Before machining" }, { label: "Before machining", taskId: "task-1" }], refuse: [{}, { label: "" }, { label: "x".repeat(201) }] },
  "vcs_edit.restore_checkpoint": { accept: [{ commit: "abc", expectedRevision: "def", confirm: true }], refuse: [{ commit: "abc", confirm: true }, { commit: "abc", expectedRevision: "def", confirm: false }] },
  "vcs.status": { accept: [{}], refuse: [[]] },
  "vcs.diff": { accept: [{}, { from: "main", to: "ai/x" }], refuse: [{ to: 1 }] },
  "vcs.list_pull_requests": { accept: [{}, { state: "merged" }], refuse: [{ state: "draft" }] },
  "vcs_edit.start_change": { accept: [{ topic: "bracket fillets" }], refuse: [{ topic: "" }, { topic: "t".repeat(81) }] },
  "vcs_edit.commit": { accept: [{ message: "Add bracket" }], refuse: [{ message: "" }] },
  "vcs_edit.restore": { accept: [{ paths: ["drawing/a"], from: "HEAD~1", confirm: true }], refuse: [{ paths: [], from: "HEAD", confirm: true }, { paths: ["a"], from: "HEAD" }] },
  "vcs_edit.open_pull_request": { accept: [{ title: "Bracket" }, { title: "Bracket", body: "Why" }], refuse: [{ title: "" }, { title: "t", body: "b".repeat(4001) }] },
  "vcs_edit.run_workflows": { accept: [{}, { trigger: "push" }], refuse: [{ trigger: "nightly" }] },
  "agent.start": {
    accept: [{ description: "Check", prompt: "Check the part" }, { description: "Check", prompt: "p", agent: "reviewer", background: true }, { description: "Check", prompt: "p", background: "true" }],
    refuse: [{ description: "", prompt: "p" }, { description: "d" }, { description: "d", prompt: "p", background: "yes" }]
  },
  "agent.list": { accept: [{}], refuse: [[]] },
  "agent.read": { accept: [{ taskId: uuid }], refuse: [{ taskId: "t1" }, {}] },
  "agent.cancel": { accept: [{ taskId: uuid }], refuse: [{ taskId: "" }] }
}

const decodes = (schema: Schema.Codec<unknown, unknown>, input: unknown) =>
  Effect.runPromise(Schema.decodeUnknownEffect(schema)(input).pipe(Effect.isSuccess))

describe("Effect-owned action inputs", () => {
  test("every migrated action has fixtures, and the catalogue declares its input from the shared schema", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(INPUTS).sort())
    for (const id of Object.keys(INPUTS)) expect(actionById(id)).toBeDefined()
  })

  for (const [id, { accept, refuse }] of Object.entries(FIXTURES)) {
    test(`${id}: the derived nikcli schema and the Effect decode agree with the replaced declaration`, async () => {
      const schema = INPUTS[id]!
      const wire = nikcliWireSchema(schema)
      for (const input of accept) {
        expect([id, input, wire.safeParse(input).success]).toEqual([id, input, true])
        expect([id, input, await decodes(schema, input)]).toEqual([id, input, true])
      }
      for (const input of refuse) {
        // The derived schema may let through what only the decode can see (text that trims to nothing); the decode never does.
        expect([id, input, await decodes(schema, input)]).toEqual([id, input, false])
      }
    })
  }

  test("the decode applies what the JSON schema cannot say: defaults, trimming, a flag sent as text", async () => {
    const decode = (id: string, input: unknown) => Effect.runPromise(Schema.decodeUnknownEffect(INPUTS[id]!)(input))
    expect(await decode("research.read_attachment", { attachment: "a" })).toEqual({ attachment: "a", offset: 0, maxChars: 10_000 })
    expect(await decode("research.read_attachment", { attachment: "a", offset: 0 })).toEqual({ attachment: "a", offset: 0, maxChars: 10_000 })
    expect(await decode("research.search", { query: "  speeds  " })).toEqual({ query: "speeds", numResults: 5 })
    expect(await decode("agent.start", { description: " Check ", prompt: "p", background: "false" })).toEqual({ description: "Check", prompt: "p", background: false })
    expect(await decode("vcs_edit.open_pull_request", { title: "t" })).toEqual({ title: "t", body: "" })
    // The machine configuration carries only what the person wrote, plus the visibility flag.
    expect(await decode("library_edit.upsert_machine_config", { name: "VF2", kind: "mill", postProcessor: "haas" })).toMatchObject({ name: "VF2", kind: "mill", postProcessor: "haas", isPublic: false })
    expect(await decode("library.lookup_component", {})).toEqual({ query: "" })
  })

  test("text that trims to nothing is refused at the seam, naming the field", async () => {
    let entered = 0
    const result = await executeActionOutcome(actionById("agent.start")!, { description: "   ", prompt: "p" }, {
      handlers: {} as ToolHandlersShape, projectId: "p", contributions: { "agent.start": async () => { entered++; return {} } }
    })
    expect(entered).toBe(0)
    expect(result).toMatchObject({ kind: "refused", value: { _tag: "ActionInvalidInput", actionId: "agent.start" } })
    expect(String((result.value as { error: string }).error)).toContain("description: Expected a value with a length of at least 1")
  })

  test("the contribution receives the decoded value, never the raw arguments", async () => {
    let received: unknown
    await executeActionOutcome(actionById("agent.start")!, { description: "d", prompt: "p", background: "true" }, {
      handlers: {} as ToolHandlersShape, projectId: "p",
      contributions: { "agent.start": async (input: unknown) => { received = input; return { id: uuid, description: "d", status: "queued" } } }
    })
    expect(received).toEqual({ description: "d", prompt: "p", background: true })
  })
})
