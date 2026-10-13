import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { readContextBreakdown, summariseBreakdown } from "../src/nikcli/context.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

const source = (category: string, tokens: number, enabled = true) => ({ category, label: category, tokens, enabled })
const hostWith = (contextBreakdown: () => Promise<unknown>): ProjectHost => ({ projectId: "p", directory: "/", client: { session: { contextBreakdown } } as never })

describe("context breakdown (nikcli SessionContext)", () => {
  test("sums the enabled sources per category, largest first", () => {
    const summary = summariseBreakdown({
      estimatedTotal: 15_000,
      sources: [source("system", 3_000), source("tools", 6_000), source("tools", 2_100.4), source("messages", 3_900), source("skills", 5_000, false), source("agents", 0)]
    })
    expect(summary.categories).toEqual([{ category: "tools", tokens: 8_100 }, { category: "messages", tokens: 3_900 }, { category: "system", tokens: 3_000 }])
    expect(summary.estimatedTotal).toBe(15_000)
  })

  test("a total the host did not give is the sum of what is on", () => {
    const summary = summariseBreakdown({ estimatedTotal: Number.NaN, sources: [source("system", 10), source("messages", 5)] })
    expect(summary.estimatedTotal).toBe(15)
  })

  test("a host that is busy, missing the call or failing yields no breakdown instead of an error", async () => {
    const ok = await Effect.runPromise(readContextBreakdown(hostWith(async () => ({ estimatedTotal: 7, sources: [source("system", 7)] })), "s"))
    expect(ok).toEqual({ estimatedTotal: 7, categories: [{ category: "system", tokens: 7 }] })
    expect(await Effect.runPromise(readContextBreakdown(hostWith(async () => { throw new Error("409 busy") }), "s"))).toBeUndefined()
    expect(await Effect.runPromise(readContextBreakdown(hostWith(async () => ({ nonsense: true })), "s"))).toBeUndefined()
  })
})
