import { expect, test } from "bun:test"
import { CadInspectionInput } from "@cadcamfun/api"
import { Effect, Schema } from "effect"
import { cadInspectInputSchema, withHostDefaults } from "../src/tools/cad_inspect.ts"

test("CAD inspection wire schemas agree on every action and preserve host defaults", async () => {
  for (const input of [
    { action: "layers" }, { action: "elements" }, { action: "elements", limit: 20 },
    { action: "search", query: "plate" }, { action: "search", query: "plate", limit: 51 },
    { action: "property", elementId: "part", path: ["history"] },
    { action: "property", elementId: "part", path: [] },
    { action: "elements", ids: Array.from({ length: 21 }, (_, index) => String(index)) },
    { action: "elements", offset: -1 }, { action: "unknown" }
  ]) {
    expect(cadInspectInputSchema.safeParse(input).success).toBe(await Effect.runPromise(Schema.decodeUnknownEffect(CadInspectionInput)(input).pipe(Effect.isSuccess)))
  }
  // The defaults are applied on the way to the handlers, not inside the wire schema: a transform
  // there is not representable as JSON Schema and would fail every turn. See tool-schemas-json-schema.
  expect(withHostDefaults({ action: "elements" })).toEqual({ action: "elements", offset: 0, limit: 10 })
  expect(withHostDefaults({ action: "search", query: "plate" })).toEqual({ action: "search", query: "plate", limit: 20 })
  expect(withHostDefaults({ action: "property", elementId: "part", path: ["history"] })).toEqual({ action: "property", elementId: "part", path: ["history"], offset: 0, maxChars: 10000 })
  // What the model sends is kept as it is.
  expect(withHostDefaults({ action: "elements", limit: 20, offset: 5 })).toEqual({ action: "elements", offset: 5, limit: 20 })
  expect(withHostDefaults({ action: "layers" })).toEqual({ action: "layers" })
})
