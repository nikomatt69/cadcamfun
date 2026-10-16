import { expect, test } from "bun:test"
import { CadInspectionElements, CadInspectionInput, CadInspectionLayers, CadInspectionOrigins, CadInspectionProperty, CadInspectionSearch } from "@cadcamfun/api"
import { Effect, Schema } from "effect"
import { ACTION_CATALOGUE } from "../src/actions/catalogue.ts"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"

/** The model's `action` value, the leaf of the contract that decodes it, and the catalogue action that carries it. */
const leaves = {
  elements: { schema: CadInspectionElements, id: "cad.inspect_elements" },
  layers: { schema: CadInspectionLayers, id: "cad.inspect_layers" },
  search: { schema: CadInspectionSearch, id: "cad.inspect_search" },
  property: { schema: CadInspectionProperty, id: "cad.inspect_property" },
  origins: { schema: CadInspectionOrigins, id: "cad.inspect_origins" }
} as const

test("each inspection action's zod schema is the JSON Schema of the authoritative Effect contract", async () => {
  for (const input of [
    { action: "layers" }, { action: "elements" }, { action: "elements", limit: 20 }, { action: "elements", limit: 100 },
    { action: "search", query: "plate" }, { action: "search", query: "plate", limit: 51 }, { action: "search", query: "plate", limit: 101 },
    { action: "property", elementId: "part", path: ["history"] }, { action: "property", elementId: "part", path: ["history"], maxChars: 50_000 }, { action: "property", elementId: "part", path: ["history"], maxChars: 50_001 },
    { action: "property", elementId: "part", path: [] },
    { action: "elements", ids: Array.from({ length: 100 }, (_, index) => String(index)) },
    { action: "elements", ids: Array.from({ length: 101 }, (_, index) => String(index)) },
    { action: "origins" }, { action: "origins", limit: 100 }, { action: "origins", limit: 101 },
    { action: "elements", offset: -1 }, { action: "unknown" }
  ]) {
    const value = input.action as keyof typeof leaves
    if (!(value in leaves)) {
      // Not one of the five readings: no catalogue action carries it.
      expect(ACTION_CATALOGUE.some((spec) => spec.id === `cad.${input.action}`)).toBe(false)
      continue
    }
    const leaf = leaves[value]
    const spec = ACTION_CATALOGUE.find((candidate) => candidate.id === leaf.id)
    expect(spec, leaf.id).toBeDefined()
    const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "action"))
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(leaf.schema)(input).pipe(Effect.isSuccess))
    expect(spec!.parameters.safeParse(payload).success, JSON.stringify(input)).toBe(decoded)
  }
})

test("the union of the five leaves is still the contract the HTTP face decodes", async () => {
  const inputs = [
    { action: "layers" },
    { action: "elements", limit: 20 },
    { action: "search", query: "plate" },
    { action: "property", elementId: "part", path: ["history"] },
    { action: "origins", limit: 40 }
  ] as const
  for (const input of inputs) {
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(CadInspectionInput)(input))
    expect(decoded).toEqual(input)
  }
})

test("every inspection leaf is derived through the same adapter the other wire schemas use", () => {
  const wire = nikcliWireSchema(CadInspectionElements)
  expect(wire.safeParse({ action: "elements", limit: 5 }).success).toBe(true)
  expect(wire.safeParse({ action: "elements", limit: 99 }).success).toBe(true)
  expect(wire.safeParse({ action: "elements", limit: 101 }).success).toBe(false)
})
