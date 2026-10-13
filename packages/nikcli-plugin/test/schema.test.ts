import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { toolShape, toZod } from "../src/schema.ts"

const actionSchema = (name: string, shape: z.ZodRawShape) => z.object({ action: z.literal(name), ...shape })
const tool = z.union([
  actionSchema("add", { elements: z.array(z.object({ type: z.string(), width: z.number().optional() })).min(1), layer: z.string().optional() }),
  actionSchema("modify", { changes: z.array(z.object({ id: z.string(), set: z.record(z.string(), z.unknown()) })), layer: z.string().optional() }),
  actionSchema("delete", { ids: z.array(z.string()), confirm: z.literal(true), layer: z.number().optional() })
])

describe("JSON Schema -> zod for nikcli's tool arguments", () => {
  test("primitives, enums, consts, arrays, nested objects and unions survive", () => {
    const converted = toZod(z.toJSONSchema(z.object({
      name: z.string(), count: z.number().int(), flag: z.boolean(), mode: z.enum(["a", "b"]), kind: z.literal("x"),
      list: z.array(z.object({ id: z.string() })), either: z.union([z.string(), z.number()]), free: z.record(z.string(), z.number()), maybe: z.string().optional()
    })), z)
    expect(converted.safeParse({ name: "n", count: 2, flag: true, mode: "a", kind: "x", list: [{ id: "1" }], either: 3, free: { a: 1 } }).success).toBe(true)
    expect(converted.safeParse({ name: "n", count: 2.5, flag: true, mode: "a", kind: "x", list: [], either: "s", free: {} }).success).toBe(false)
    expect(converted.safeParse({ name: "n", count: 2, flag: true, mode: "c", kind: "x", list: [], either: "s", free: {} }).success).toBe(false)
  })

  test("descriptions travel to the model", () => {
    const converted = toZod(z.toJSONSchema(z.object({ width: z.number().describe("Width in mm") })), z)
    expect(JSON.stringify(z.toJSONSchema(converted))).toContain("Width in mm")
  })

  test("an unknown or recursive shape degrades to any instead of failing the plugin", () => {
    expect(toZod({ $ref: "#/$defs/missing" }, z).safeParse(5).success).toBe(true)
    expect(toZod({ type: "weird" }, z).safeParse({}).success).toBe(true)
    const loop: Record<string, unknown> = { $defs: { Node: { type: "object", properties: { next: { $ref: "#/$defs/Node" } } } }, $ref: "#/$defs/Node" }
    expect(() => toZod(loop, z)).not.toThrow()
  })
})

describe("flattening a tool's per-action union", () => {
  const { shape, actions, summary } = toolShape(z.toJSONSchema(tool), z)

  test("action is the enum of the actions, every other field of any action is optional", () => {
    expect(actions).toEqual(["add", "modify", "delete"])
    const args = z.object(shape)
    expect(args.safeParse({ action: "add", elements: [{ type: "cube", width: 10 }] }).success).toBe(true)
    expect(args.safeParse({ action: "nope" }).success).toBe(false)
    expect(args.safeParse({ elements: [] }).success).toBe(false)
    expect(Object.keys(shape).sort()).toEqual(["action", "changes", "confirm", "elements", "ids", "layer"])
  })

  test("a field two actions type differently is any, one they agree on keeps its type", () => {
    const args = z.object(shape)
    expect(args.safeParse({ action: "add", layer: 7 }).success).toBe(true)
    expect(args.safeParse({ action: "add", layer: "walls" }).success).toBe(true)
    expect(args.safeParse({ action: "add", elements: "not an array" }).success).toBe(false)
  })

  test("the summary names each action with its required fields, for the tool's description", () => {
    expect(summary).toContain("add (elements)")
    expect(summary).toContain("modify (changes)")
    expect(summary).toContain("delete (ids, confirm)")
  })

  test("a schema that is a single object works as one action-less shape", () => {
    const single = toolShape(z.toJSONSchema(z.object({ query: z.string() })), z)
    expect(single.actions).toEqual([])
    expect(Object.keys(single.shape)).toEqual(["query"])
  })
})
