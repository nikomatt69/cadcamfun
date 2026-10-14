/**
 * The CAM kernel's actions on the `cam` tool: the material table, cutting data bounded by the project's machine, and the
 * kernel run delegated to the host.
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CAM_ACTIONS } from "../src/actions/cam.ts"
import type { ActionContext } from "../src/actions/action.ts"

const action = (id: string) => CAM_ACTIONS.find((a) => a.id === id)!
const context = (handlers: Record<string, unknown> = {}): ActionContext => ({ projectId: "p", handlers } as unknown as ActionContext)
const run = (id: string, input: unknown, handlers: Record<string, unknown> = {}) =>
  Effect.runPromise(action(id).run(action(id).parameters.parse(input) as never, context(handlers))) as Promise<Record<string, any>>

describe("cam kernel actions", () => {
  test("materials lists the grades, or the one a query names", async () => {
    const all = await run("cam.materials", {})
    expect(all["ok"]).toBe(true)
    expect(all["materials"].length).toBeGreaterThan(25)
    expect(all["machines"].some((m: { id: string }) => m.id === "vmc-standard")).toBe(true)
    const one = await run("cam.materials", { query: "1.4301" })
    expect(one["materials"]).toHaveLength(1)
    expect(one["materials"][0]).toMatchObject({ id: "stainless-304", iso: "M" })
    expect((await run("cam.materials", { query: "unobtainium" }))["ok"]).toBe(false)
  })

  test("cutting data follows the material and is bounded by the project's machine", async () => {
    const tool = { kind: "flat", diameter: 10, flutes: 3 }
    const al = await run("cam.cutting_data", { material: "6061", cut: "rough-side", tool, machine: "hsc-mill" })
    const ti = await run("cam.cutting_data", { material: "Ti6Al4V", cut: "rough-side", tool, machine: "hsc-mill" })
    expect(al["cuttingData"].rpm).toBeGreaterThan(ti["cuttingData"].rpm)
    expect(al["cuttingData"].feed).toBeGreaterThan(ti["cuttingData"].feed)
    // No preset: the host machine's spindle limit applies.
    const slow = await run("cam.cutting_data", { material: "6061", cut: "rough-side", tool }, { machine: async () => ({ maxSpindleSpeed: 6000, maxFeedRate: 2000 }) })
    expect(slow["cuttingData"].rpm).toBe(6000)
    expect(slow["cuttingData"].feed).toBeLessThanOrEqual(2000)
    expect(slow["cuttingData"].limitedBy).toContain("machine spindle speed")
    expect((await run("cam.cutting_data", { material: "nope", cut: "slot", tool }))["ok"]).toBe(false)
    expect((await run("cam.cutting_data", { material: "6061", cut: "slot", tool: { ...tool, kind: "bull" } }))["ok"]).toBe(false)
  })

  test("manufacture is delegated to the host, and says so when the host has no kernel", async () => {
    const calls: unknown[] = []
    const done = await run("cam.manufacture", { material: "C45", planOnly: true }, { manufacture: async (_p: string, input: unknown) => { calls.push(input); return { ok: true, mutated: false, drawingId: "d", projectId: "p" } } })
    expect(done["ok"]).toBe(true)
    expect(calls).toEqual([{ material: "C45", planOnly: true }])
    expect((await run("cam.manufacture", { material: "C45" }))["ok"]).toBe(false)
  })
})
