import { expect, test } from "bun:test"
import { CadInspectionInput } from "@cadcamfun/api"
import { Effect, Schema } from "effect"
import { cadInspectInputSchema } from "../src/tools/cad_inspect.ts"

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
  expect(cadInspectInputSchema.parse({ action: "elements" })).toEqual({ action: "elements", offset: 0, limit: 10 })
  expect(cadInspectInputSchema.parse({ action: "search", query: "plate" })).toEqual({ action: "search", query: "plate", limit: 20 })
  expect(cadInspectInputSchema.parse({ action: "property", elementId: "part", path: ["history"] })).toEqual({ action: "property", elementId: "part", path: ["history"], offset: 0, maxChars: 10000 })
})
