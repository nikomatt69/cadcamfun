import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { matchesTrigger, parseWorkflow, runWorkflow, StepError, type RunEvent, type StepRegistry } from "../src/index.ts"

const SRC = `
name: Verify and post
on:
  push:
    branches: [main, "ai/**"]
    paths: ["toolpaths/**"]
  manual: {}
jobs:
  verify:
    steps:
      - id: v
        uses: cam/verify
        with: { toolpath: all }
  post:
    needs: [verify]
    steps:
      - uses: cam/gcode
        with:
          post: grbl
          issues: "\${{ steps.v.outputs.issues }}"
      - uses: vcs/commit
        if: always
        with: { message: "gcode \${{ steps.v.outputs.issues }} issues" }
`

const run = (registry: StepRegistry<null>, src = SRC) =>
  Effect.gen(function* () {
    const w = yield* parseWorkflow(src)
    const events: RunEvent[] = []
    const result = yield* runWorkflow(w, { registry, ctx: null, onEvent: (e) => events.push(e) })
    return { result, events }
  })

describe("workflow", () => {
  test("parses and matches triggers", async () => {
    const w = await Effect.runPromise(parseWorkflow(SRC))
    expect(matchesTrigger(w, { type: "push", branch: "ai/fix-pocket", changedPaths: ["toolpaths/t1.json"] })).toBe(true)
    expect(matchesTrigger(w, { type: "push", branch: "ai/fix", changedPaths: ["drawings/d1.json"] })).toBe(false)
    expect(matchesTrigger(w, { type: "push", branch: "dev", changedPaths: ["toolpaths/t1.json"] })).toBe(false)
    expect(matchesTrigger(w, { type: "manual" })).toBe(true)
    expect(matchesTrigger(w, { type: "pull-request", base: "main" })).toBe(false)
  })

  test("rejects bad documents", async () => {
    const fail = (src: string) => Effect.runPromise(parseWorkflow(src).pipe(Effect.flip))
    expect((await fail("name: x\non: {}\njobs:\n  a:\n    needs: [b]\n    steps: [{ uses: cam/verify }]")).code).toBe("needs")
    expect((await fail("name: x\non: {}\njobs:\n  a:\n    needs: [b]\n    steps: [{ uses: cam/verify }]\n  b:\n    needs: [a]\n    steps: [{ uses: cam/verify }]")).code).toBe("cycle")
    expect((await fail("name: x\non: {}\njobs:\n  a:\n    steps: [{ uses: 'bash' }]")).code).toBe("schema")
    expect((await fail("name: [")).code).toBe("yaml")
  })

  test("runs jobs in order, interpolates outputs and streams events", async () => {
    const seen: unknown[] = []
    const registry: StepRegistry<null> = {
      "cam/verify": () => Effect.succeed({ issues: 2 }),
      "cam/gcode": ({ with: w }) => Effect.sync(() => void seen.push(w)),
      "vcs/commit": ({ with: w }) => Effect.sync(() => void seen.push(w)),
    }
    const { result, events } = await Effect.runPromise(run(registry))
    expect(result).toEqual({ status: "success", jobs: { verify: "success", post: "success" } })
    expect(seen).toEqual([{ post: "grbl", issues: 2 }, { message: "gcode 2 issues" }])
    expect(events.map((e) => e.type)).toEqual(["job-start", "step", "job-end", "job-start", "step", "step", "job-end"])
  })

  test("failure skips dependents and later steps except if: always", async () => {
    const registry: StepRegistry<null> = {
      "cam/verify": () => Effect.fail(new StepError({ message: "collision" })),
      "cam/gcode": () => Effect.void,
      "vcs/commit": () => Effect.void,
    }
    const { result } = await Effect.runPromise(run(registry))
    expect(result).toEqual({ status: "failure", jobs: { verify: "failure", post: "skipped" } })
  })

  test("unknown steps abort before anything runs", async () => {
    const err = await Effect.runPromise(run({}).pipe(Effect.flip))
    expect(err.message).toContain("cam/verify")
  })
})
