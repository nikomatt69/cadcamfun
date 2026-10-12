/**
 * `SchemaForm` description tests (spec 06-desktop-ui.md §1, §3).
 *
 * The CAM parameter forms must follow the WP2 Schemas, so the interesting tests
 * are the ones that would fail if the UI ever hand-wrote a parameter: a field
 * added to `ProfileParams` shows up, a `isGreaterThan(0)` bound is enforced, and a
 * bad value never throws.
 */
import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import {
  decodeForm,
  defaultsOf,
  describeSchema,
  validateForm,
  type FormDescription
} from "../src/shared/components/schema-form.ts"

const fieldOf = (description: FormDescription, key: string) => {
  const field = description.fields.find((f) => f.key === key)
  if (field === undefined) throw new Error(`no field ${key}`)
  return field
}

describe("describeSchema", () => {
  const description = describeSchema(cam.ProfileParams)

  test("every WP2 parameter becomes a field", () => {
    const keys = description.fields.map((f) => f.key)
    for (const key of ["totalDepth", "stepdown", "feed", "plungeFeed", "spindleRpm", "side", "leadIn", "coolant"]) {
      expect(keys).toContain(key)
    }
  })

  test("kinds are derived from the Schema, not hard-coded", () => {
    expect(fieldOf(description, "totalDepth").kind).toBe("number")
    expect(fieldOf(description, "climb").kind).toBe("boolean")
    expect(fieldOf(description, "id").kind).toBe("string")
    expect(fieldOf(description, "side").kind).toBe("enum")
  })

  test("enum fields expose their literals", () => {
    expect(fieldOf(description, "side").options).toEqual(["outside", "inside", "onLine"])
    expect(fieldOf(description, "leadIn").options).toContain("helix")
    expect(fieldOf(description, "coolant").options).toEqual(["off", "flood", "mist"])
  })

  test("bounds come from the checks, exclusive or not", () => {
    const depth = fieldOf(description, "totalDepth")
    expect(depth.minimum).toBe(0)
    expect(depth.exclusiveMinimum).toBe(true)
    const ramp = fieldOf(description, "rampAngle")
    expect(ramp.minimum).toBe(0.1)
    expect(ramp.exclusiveMinimum).toBe(false)
    expect(ramp.maximum).toBe(45)
  })

  test("only parameters without a default are required", () => {
    expect(fieldOf(description, "totalDepth").required).toBe(true)
    // `id`, `name` and the heights carry constructor defaults.
    expect(fieldOf(description, "id").required).toBe(false)
    expect(fieldOf(description, "safeHeight").required).toBe(false)
  })

  test("unsupported shapes are reported, not dropped", () => {
    expect(fieldOf(description, "tabs").kind).toBe("unknown")
    expect(describeSchema({}).fields).toEqual([])
  })

  test("fields are stable and sorted, so the form does not jump around", () => {
    const keys = description.fields.map((f) => f.key)
    expect(keys).toEqual([...keys].sort())
    expect(describeSchema(cam.ProfileParams).fields).toEqual(description.fields)
  })
})

describe("validateForm", () => {
  const description = describeSchema(cam.ProfileParams)

  test("an exclusive bound rejects the boundary value", () => {
    const issues = validateForm(description, { totalDepth: 0, stepdown: 1 })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.key).toBe("totalDepth")
    expect(issues[0]?.message).toContain("greater than 0")
  })

  test("missing required fields are reported, defaults are not", () => {
    const issues = validateForm(description, {})
    expect(issues.map((i) => i.key).sort()).toEqual(["stepdown", "totalDepth"])
  })

  test("numeric strings from inputs are coerced", () => {
    expect(validateForm(description, { totalDepth: "3", stepdown: "1" })).toEqual([])
  })

  test("a non-numeric value is rejected with a readable message", () => {
    expect(validateForm(description, { totalDepth: "abc", stepdown: 1 })[0]?.message).toContain("must be a number")
  })

  test("an enum value outside the literals is rejected", () => {
    expect(validateForm(description, { totalDepth: 1, stepdown: 1, side: "sideways" })[0]?.message).toContain(
      "outside, inside, onLine"
    )
  })
})

describe("decodeForm", () => {
  test("valid values decode into a typed parameter object with defaults filled in", () => {
    const result = decodeForm(cam.ProfileParams, { totalDepth: 4, stepdown: 2 })
    expect(result._tag).toBe("Valid")
    if (result._tag !== "Valid") return
    expect(result.value.totalDepth).toBe(4)
    expect(result.value.stepdown).toBe(2)
    // Defaults the form never asked for are still there.
    expect(result.value.leadIn).toBeTypeOf("string")
    expect(result.value.clearanceHeight).toBeGreaterThan(0)
  })

  test("an invalid value never throws, it comes back as an issue", () => {
    const result = decodeForm(cam.ProfileParams, { totalDepth: -2, stepdown: 1 })
    expect(result._tag).toBe("Invalid")
    if (result._tag !== "Invalid") return
    expect(result.issues.some((i) => i.key === "totalDepth")).toBe(true)
  })

  test("a cross-field failure is surfaced, not thrown", () => {
    // `heightsOrdered` rejects clearance below safe.
    const result = decodeForm(cam.ProfileParams, {
      totalDepth: 1,
      stepdown: 1,
      clearanceHeight: 0,
      safeHeight: 5
    })
    expect(result._tag).toBe("Invalid")
  })

  test("defaultsOf seeds the form from a constructed instance", () => {
    const instance = new cam.ProfileParams({ totalDepth: 4, stepdown: 2 })
    const values = defaultsOf(instance, cam.ProfileParams)
    expect(values.totalDepth).toBe(4)
    expect(values.side).toBe(instance.side)
    expect(typeof values.clearanceHeight).toBe("number")
    // Every described field gets a value, so the form never renders `undefined`.
    for (const field of describeSchema(cam.ProfileParams).fields) {
      expect(values[field.key]).toBeDefined()
    }
  })
})

describe("describeSchema on hand-written schemas", () => {
  class Params extends Schema.Class<Params>("test/Params")({
    count: Schema.Finite.check(Schema.isGreaterThan(0)),
    label: Schema.optional(Schema.String),
    mode: Schema.Literals(["a", "b"])
  }) {}

  test("the same rules apply outside WP2", () => {
    const description = describeSchema(Params)
    expect(fieldOf(description, "count")).toMatchObject({
      kind: "number",
      required: true,
      minimum: 0,
      exclusiveMinimum: true
    })
    expect(fieldOf(description, "label")).toMatchObject({ kind: "string", required: false })
    expect(fieldOf(description, "mode").options).toEqual(["a", "b"])
  })
})
