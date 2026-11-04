import { describe, expect, test } from "bun:test"
import { binary, call, evalExpr, exprDepth, lowerExprDepth, named, num, varKey, type Expr, type VarRef } from "./macro.ts"
import type { Move } from "./ir.ts"

const run = (moves: ReadonlyArray<Move>, vars: Map<string, number>): void => {
  const look = (v: VarRef) => vars.get(varKey(v)) ?? 0
  for (const m of moves) if (m._tag === "Assign") vars.set(varKey(m.variable), evalExpr(m.value, look))
}

describe("lowerExprDepth", () => {
  test("keeps every value and respects the depth on random expressions", () => {
    let seed = 99
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const gen = (d: number): Expr => {
      if (d === 0 || rnd() < 0.15) return rnd() < 0.5 ? num(Math.round(rnd() * 100) / 10 + 1) : named(`v${Math.floor(rnd() * 3)}`)
      const r = rnd()
      if (r < 0.7) return binary((["+", "-", "*"] as const)[Math.floor(rnd() * 3)]!, gen(d - 1), gen(d - 1))
      if (r < 0.85) return call("abs", gen(d - 1))
      return call("hypot", gen(d - 1), gen(d - 1))
    }
    for (let i = 0; i < 300; i++) {
      const value = gen(8)
      const moves: Move[] = [{ _tag: "Assign", variable: { name: "out" }, value }]
      for (const max of [1, 3, 4]) {
        const lowered = lowerExprDepth(moves, max, (k) => ({ name: `t${k}` }))
        for (const m of lowered) if (m._tag === "Assign") expect(exprDepth(m.value)).toBeLessThanOrEqual(max)
        const a = new Map([["n:v0", 1.5], ["n:v1", -2.25], ["n:v2", 3]])
        const b = new Map(a)
        run(moves, a)
        run(lowered, b)
        expect(b.get("n:out")!).toBeCloseTo(a.get("n:out")!, 9)
      }
    }
  })

  test("computed words and offsets are lowered too, a deep While is refused", () => {
    const deep = binary("+", binary("*", binary("-", named("a"), num(1)), binary("+", named("b"), num(2))), call("abs", binary("-", named("c"), num(3))))
    const moves: Move[] = [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 0 }, expr: { x: deep } },
      { _tag: "OffsetUpdate", target: { kind: "work", ref: { kind: "g5x", code: "G54" } }, axis: "X", mode: "add", value: deep }
    ]
    const out = lowerExprDepth(moves, 2, (k) => ({ name: `t${k}` }))
    const rapid = out.find((m) => m._tag === "Rapid")!
    expect(rapid._tag === "Rapid" && exprDepth(rapid.expr!.x!)).toBeLessThanOrEqual(2)
    const upd = out.find((m) => m._tag === "OffsetUpdate")!
    expect(upd._tag === "OffsetUpdate" && exprDepth(upd.value)).toBeLessThanOrEqual(2)
    expect(() => lowerExprDepth([{ _tag: "While", condition: { cmp: "lt", a: deep, b: num(0) } }] as Move[], 2, (k) => ({ name: `t${k}` }))).toThrow(/While/)
  })
})
