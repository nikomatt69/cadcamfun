import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"

test("derived nikcli validation matches authoritative Effect bounds and discriminated actions", async () => {
  const schema = Schema.Union([
    Schema.Struct({ action: Schema.Literal("inspect"), id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(10)) }),
    Schema.Struct({ action: Schema.Literal("page"), offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(20)) })
  ])
  const adapter = nikcliWireSchema(schema)
  for (const input of [
    { action: "inspect", id: "part" }, { action: "inspect", id: "" }, { action: "inspect", id: "long-part-identifier" },
    { action: "page", offset: 0, limit: 20 }, { action: "page", offset: -1, limit: 1 },
    { action: "page", offset: 0.5, limit: 1 }, { action: "page", offset: 0, limit: 21 },
    { action: "unknown" }, {}, null
  ]) {
    const effectAccepted = await Effect.runPromise(Schema.decodeUnknownEffect(schema)(input).pipe(Effect.isSuccess))
    expect(adapter.safeParse(input).success).toBe(effectAccepted)
  }
})

test("derived wire adapter preserves accepted fields and handles optional fields consistently", async () => {
  const schema = Schema.Struct({
    action: Schema.Literal("inspect"),
    id: Schema.String,
    limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)))
  })
  const adapter = nikcliWireSchema(schema)
  for (const input of [{ action: "inspect", id: "part" }, { action: "inspect", id: "part", limit: 2 }]) {
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(schema)(input))
    expect(adapter.parse(input)).toEqual(decoded)
  }
  expect(adapter.safeParse({ action: "inspect", id: "part", limit: null }).success).toBe(false)
})
