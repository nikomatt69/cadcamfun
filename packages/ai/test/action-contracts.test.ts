import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { ACTION_CONTRACTS, PERSISTENT_EFFECTS } from "@cadcamfun/api"
import { ACTION_CATALOGUE, toolKind, ACTION_TOOL_IDS } from "../src/actions/catalogue.ts"

const accepts = (schema: Schema.Top | undefined, value: unknown): boolean =>
  schema !== undefined && Effect.runSync(Schema.decodeUnknownEffect(schema as Schema.Decoder<unknown>)(value).pipe(Effect.isSuccess))

describe("action result contracts", () => {
  test("every catalogue action has exactly one contract, and every contract names a catalogue action", () => {
    const ids = ACTION_CATALOGUE.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(ACTION_CONTRACTS).sort()).toEqual([...ids].sort())
    for (const action of ACTION_CATALOGUE) expect(action.result as unknown).toBe(ACTION_CONTRACTS[action.id]!.result)
  })

  test("effects agree with kinds: reads touch nothing persistent, every write names what it stores", () => {
    for (const action of ACTION_CATALOGUE) {
      const persistent = action.effects.filter((effect: (typeof PERSISTENT_EFFECTS)[number]) => PERSISTENT_EFFECTS.includes(effect))
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

  // Refusals and conflicts are classified before the result is checked (`actions/outcome.ts`); the result is the success.
  test("no contract accepts an arbitrary value as a success", () => {
    for (const action of ACTION_CATALOGUE) {
      for (const arbitrary of ["done", 42, null, { ok: false }]) {
        expect({ id: action.id, arbitrary, accepted: accepts(action.result, arbitrary) }).toEqual({ id: action.id, arbitrary, accepted: false })
      }
    }
  })

  test("drawing changes must name their target and the ids they touched", () => {
    const change = { ok: true, ids: ["e1"], elements: [{ id: "e1", type: "box" }], drawingId: "d", projectId: "p" }
    expect(accepts(ACTION_CONTRACTS["cad_edit.add"]!.result, change)).toBe(true)
    const { drawingId: _drawingId, ...untargeted } = change
    expect(accepts(ACTION_CONTRACTS["cad_edit.add"]!.result, untargeted)).toBe(false)
    expect(accepts(ACTION_CONTRACTS["cad_edit.add"]!.result, { ...change, ids: "e1" })).toBe(false)
    // A generated program is answered by its statistics and a preview; an empty program is not a success.
    expect(accepts(ACTION_CONTRACTS["cam_edit.generate"]!.result, { ok: true, operationId: "o", stats: { lines: 900 }, programHash: "h", lines: 900, previewLines: 40, omittedLines: 860, preview: "G0" })).toBe(true)
    expect(accepts(ACTION_CONTRACTS["cam_edit.generate"]!.result, { stats: { error: "no geometry" }, preview: "" })).toBe(false)
  })
})
