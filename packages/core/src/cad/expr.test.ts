import { describe, expect, test } from "bun:test"
import { ExpressionError, dimensionValue, evaluate, namesIn, resolveParameters } from "./expr.ts"

describe("expressions", () => {
  test("arithmetic with the usual precedence, and a power that binds tighter than a minus", () => {
    expect(evaluate("1 + 2 * 3")).toBe(7)
    expect(evaluate("(1 + 2) * 3")).toBe(9)
    expect(evaluate("10 / 4 - 1")).toBe(1.5)
    expect(evaluate("2 ^ 3 ^ 2")).toBe(512) // right-associative
    expect(evaluate("-2 ^ 2")).toBe(-4)
    expect(evaluate("2 ^ -1")).toBe(0.5)
    expect(evaluate("7 % 4")).toBe(3)
    expect(evaluate("1e-3 * 1000")).toBeCloseTo(1, 12)
  })

  test("units become millimetres and radians", () => {
    expect(evaluate("2in")).toBeCloseTo(50.8, 12)
    expect(evaluate("3cm + 5mm")).toBeCloseTo(35, 12)
    expect(evaluate("1m")).toBe(1000)
    expect(evaluate("90deg")).toBeCloseTo(Math.PI / 2, 12)
    expect(evaluate("sin(30deg)")).toBeCloseTo(0.5, 12)
  })

  test("functions and constants", () => {
    expect(evaluate("max(1, 7, 3) + min(4, 2)")).toBe(9)
    expect(evaluate("sqrt(16) + abs(-3)")).toBe(7)
    expect(evaluate("hypot(3, 4)")).toBe(5)
    expect(evaluate("atan2(1, 1)")).toBeCloseTo(Math.PI / 4, 12)
    expect(evaluate("deg(pi)")).toBeCloseTo(180, 12)
    expect(evaluate("rad(180) / pi")).toBeCloseTo(1, 12)
    expect(evaluate("round(2.5) + floor(2.9) + ceil(2.1)")).toBe(8)
    expect(evaluate("tau")).toBeCloseTo(2 * Math.PI, 12)
  })

  test("names come from the scope, and a bad expression says where", () => {
    expect(evaluate("width / 2 + 3", (n) => ({ width: 40 })[n])).toBe(23)
    expect(() => evaluate("width", () => undefined)).toThrow(ExpressionError)
    expect(() => evaluate("1 / 0")).toThrow("Division by zero")
    expect(() => evaluate("2 +")).toThrow("Unexpected end")
    expect(() => evaluate("(1 + 2")).toThrow("Expected ')'")
    expect(() => evaluate("1 + $")).toThrow("Unexpected character")
    expect(() => evaluate("foo(1)")).toThrow("Unknown function")
    expect(() => evaluate("sin(1, 2)")).toThrow("takes 1 argument")
    expect(() => evaluate("1 2")).toThrow("after the expression")
    expect(() => evaluate("sqrt(-1)")).toThrow("finite")
    try { evaluate("1 + * 2") } catch (e) { expect((e as ExpressionError).position).toBe(4) }
  })

  test("the names an expression uses, not constants or functions", () => {
    expect([...namesIn("width / 2 + max(a, b) * pi")].sort()).toEqual(["a", "b", "width"])
  })
})

describe("parameter tables", () => {
  test("resolved in dependency order, whatever order they are written in", () => {
    const { values, errors } = resolveParameters({ hole: "half - 3", half: "width / 2", width: 40, area: "width * depth", depth: "2in" })
    expect(errors).toEqual({})
    expect(values["half"]).toBe(20)
    expect(values["hole"]).toBe(17)
    expect(values["depth"]).toBeCloseTo(50.8, 12)
    expect(values["area"]).toBeCloseTo(40 * 50.8, 9)
  })

  test("a cycle and everything that depends on it fail, naming the loop; the rest still resolves", () => {
    const { values, errors } = resolveParameters({ a: "b + 1", b: "c + 1", c: "a + 1", ok: 5, user: "a * 2", fine: "ok * 2" })
    expect(Object.keys(errors).sort()).toEqual(["a", "b", "c", "user"].sort().filter((k) => k in errors))
    expect(errors["a"] ?? errors["b"] ?? errors["c"]).toContain("circular")
    expect(errors["user"]).toBeDefined()
    expect(values["ok"]).toBe(5)
    expect(values["fine"]).toBe(10)
  })

  test("an unknown name, a bad expression and a non-finite number are reported per parameter", () => {
    const { values, errors } = resolveParameters({ a: "nope + 1", b: "1 +", c: Number.NaN, d: 3 })
    expect(errors["a"]).toContain("nope")
    expect(errors["b"]).toBeDefined()
    expect(errors["c"]).toContain("finite")
    expect(values["d"]).toBe(3)
  })

  test("a dimension is a number or an expression over the resolved values", () => {
    expect(dimensionValue(5, {})).toBe(5)
    expect(dimensionValue("w * 2", { w: 4 })).toBe(8)
  })
})
