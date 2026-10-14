import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { ACTION_RESULTS, PERSISTENT_EFFECTS } from "@cadcamfun/api"
import { ACTION_CATALOGUE, toolKind, ACTION_TOOL_IDS } from "../src/actions/catalogue.ts"

const accepts = (schema: Schema.Decoder<unknown>, value: unknown): boolean =>
  Effect.runSync(Schema.decodeUnknownEffect(schema)(value).pipe(Effect.isSuccess))

describe("action result contracts", () => {
  test("every catalogue action has exactly one contract, and every contract names a catalogue action", () => {
    const ids = ACTION_CATALOGUE.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(ACTION_RESULTS).sort()).toEqual([...ids].sort())
    for (const action of ACTION_CATALOGUE) expect(action.result as unknown).toBe((ACTION_RESULTS as Record<string, unknown>)[action.id])
  })

  test("effects agree with kinds: reads touch nothing persistent, every write names what it stores", () => {
    for (const action of ACTION_CATALOGUE) {
      const persistent = action.effects.filter((effect) => PERSISTENT_EFFECTS.includes(effect))
      if (action.kind === "read") expect({ id: action.id, persistent }).toEqual({ id: action.id, persistent: [] })
      else expect({ id: action.id, persistent: persistent.length > 0 }).toEqual({ id: action.id, persistent: true })
    }
    // Delegation's listing and reading are honest reads, yet the tool that carries them stays a write tool.
    expect(ACTION_CATALOGUE.find((action) => action.id === "agent.list")?.kind).toBe("read")
    expect(toolKind("agent")).toBe("write")
    // Verification stores a report, never a program.
    expect(ACTION_CATALOGUE.find((action) => action.id === "cam_edit.verify")?.effects).toEqual(["report"])
  })

  test("a tool's kind is the strongest kind of its actions", () => {
    const rank = { read: 0, write: 1, destructive: 2 } as const
    for (const tool of ACTION_TOOL_IDS) {
      const strongest = ACTION_CATALOGUE.filter((action) => action.id.startsWith(`${tool}.`)).reduce((max, action) => Math.max(max, rank[action.kind]), 0)
      expect({ tool, kind: rank[toolKind(tool)] as number }).toEqual({ tool, kind: strongest })
    }
  })

  test("every contract accepts a refusal and a conflict, and none accepts an arbitrary value as a success", () => {
    const conflict = { ok: false, _tag: "ActionConflict", actionId: "a", projectId: "p", drawingId: "d", expectedRevision: 1, actualRevision: 2, message: "moved" }
    for (const action of ACTION_CATALOGUE) {
      expect({ id: action.id, refusal: accepts(action.result, { ok: false, error: "Nothing was done." }) }).toEqual({ id: action.id, refusal: true })
      expect({ id: action.id, conflict: accepts(action.result, conflict) }).toEqual({ id: action.id, conflict: true })
      for (const arbitrary of [{ ok: true }, { done: 1 }, "done", 42, null, { ok: false }]) {
        expect({ id: action.id, arbitrary, accepted: accepts(action.result, arbitrary) }).toEqual({ id: action.id, arbitrary, accepted: false })
      }
    }
  })

  test("drawing changes must name their target and the ids they touched", () => {
    const change = { ok: true, ids: ["e1"], elements: [{ id: "e1" }], drawingId: "d", projectId: "p" }
    expect(accepts(ACTION_RESULTS["cad_edit.add"], change)).toBe(true)
    const { drawingId: _drawingId, ...untargeted } = change
    expect(accepts(ACTION_RESULTS["cad_edit.add"], untargeted)).toBe(false)
    expect(accepts(ACTION_RESULTS["cad_edit.add"], { ...change, ids: "e1" })).toBe(false)
    // A generated program is answered by its identity and size; an empty program is not a success.
    expect(accepts(ACTION_RESULTS["cam_edit.generate"], { ok: true, operationId: "o", lines: 900, returned: 40, omitted: 860, preview: "G0", programHash: "h" })).toBe(true)
    expect(accepts(ACTION_RESULTS["cam_edit.generate"], { stats: { error: "no geometry" }, preview: "" })).toBe(false)
  })
})
