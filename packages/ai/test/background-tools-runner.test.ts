import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { BackgroundToolsRunner, failureReport } from "../src/nikcli/background-tools-runner.ts"
import { SUBAGENTS } from "../src/nikcli/agents.ts"
import type { NikCliRuntime } from "../src/nikcli/runtime.ts"

const drain = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Stub a nikcli host so tests do not actually open the embedded client. */
const stubHost = (overrides?: {
  promptAsync?: (input: unknown) => Promise<unknown>
}): NikCliRuntime => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const promptAsync = overrides?.promptAsync ?? (async () => undefined)
  const host = {
    host: () =>
      Effect.tryPromise({
        try: async () => ({
          projectId: "p",
          directory: "/tmp",
          client: {
            session: {
              create: async (input: unknown) => {
                calls.push({ method: "session.create", args: [input] })
                return { id: "child" }
              },
              remove: async () => true,
              messages: async () => []
            },
            "session-prompt": {
              prompt: async (input: unknown) => {
                calls.push({ method: "prompt", args: [input] })
                return { parts: [{ type: "text", text: "ok" }] }
              },
              promptAsync: (async (input: unknown) => {
                calls.push({ method: "promptAsync", args: [input] })
                return await promptAsync(input)
              }) as never
            }
          }
        }),
        catch: () => new Error("host")
      })
  }
  return host as unknown as NikCliRuntime
}

/** A controllable runner: returns a promise per task that the test can settle. */
const controllableRunner = () => {
  const resolvers: Array<(text: string) => void> = []
  return {
    runner: () => new Promise<string>((resolve) => resolvers.push(resolve)),
    resolveAll: (text: string) => resolvers.forEach((resolve) => resolve(text)),
    /** Resolves once the runner has been invoked at least once (or timeout). */
    awaitInvoked: (timeoutMs = 1000) =>
      new Promise<void>((resolve) => {
        const start = Date.now()
        const tick = () => {
          if (resolvers.length > 0 || Date.now() - start > timeoutMs) return resolve()
          setTimeout(tick, 5)
        }
        tick()
      })
  }
}

describe("BackgroundToolsRunner", () => {
  test("shared runner cancels and joins only the actual project/parent owner", async () => {
    const runs: Array<{ signal: AbortSignal; finish: (text: string) => void }> = []
    const runner = new BackgroundToolsRunner(stubHost(), { runner: (input) => new Promise((finish) => runs.push({ signal: input.signal, finish })) })
    const owner = { projectId: "real-project", parentSessionId: "real-parent" }
    const other = { projectId: "other-project", parentSessionId: "real-parent" }
    const task = runner.manager.enqueue({ ...owner, prompt: "p", description: "a" })
    runner.manager.enqueue({ ...other, prompt: "p", description: "b" })
    await drain(10)
    let joined = false
    const cancellation = runner.cancelForParent(owner).then((count) => { joined = true; return count })
    await drain(10)
    expect(joined).toBe(false)
    expect(runs[0]?.signal.aborted).toBe(true)
    expect(runs[1]?.signal.aborted).toBe(false)
    runs[0]?.finish("late")
    expect(await cancellation).toBe(1)
    expect(runner.manager.read(owner, task.id).status).toBe("cancelled")
    const disposal = runner.dispose()
    runs[1]?.finish("stopped")
    await disposal
  })

  test("removing a parent while its completion acquires a host suppresses wake", async () => {
    let acquired!: () => void
    let release!: () => void
    let wakes = 0
    const entering = new Promise<void>((r) => { acquired = r })
    const blocked = new Promise<void>((r) => { release = r })
    const stub = stubHost({ promptAsync: async () => { wakes++ } })
    const original = stub.host
    const runtime = { ...stub, host: (id: string) => Effect.promise(async () => { acquired(); await blocked; return await Effect.runPromise(original(id)) }) } as NikCliRuntime
    const runner = new BackgroundToolsRunner(runtime, { runner: async () => "findings" })
    const owner = { projectId: "p", parentSessionId: "s" }
    runner.manager.enqueue({ ...owner, prompt: "p", description: "d" })
    await entering
    await runner.cancelForParent(owner)
    release()
    await runner.dispose()
    expect(wakes).toBe(0)
  })

  test("scoped list / read: cross-project and cross-parent isolation", async () => {
    const stub = controllableRunner()
    const runner = new BackgroundToolsRunner(stubHost(), { runner: stub.runner })
    const a = runner.manager.enqueue({
      description: "scan",
      prompt: "look",
      projectId: "project-a",
      parentSessionId: "session-a"
    })
    const b = runner.manager.enqueue({
      description: "scan2",
      prompt: "look again",
      projectId: "project-a",
      parentSessionId: "session-a"
    })
    expect(["queued", "running", "completed"]).toContain(a.status)
    expect(["queued", "running", "completed"]).toContain(b.status)
    expect(runner.manager.list({ projectId: "project-a", parentSessionId: "session-a" }).length).toBe(2)
    expect(runner.manager.list({ projectId: "other", parentSessionId: "session-a" }).length).toBe(0)
    expect(() => runner.manager.read({ projectId: "project-a", parentSessionId: "session-b" }, a.id)).toThrow()
    runner.manager.cancel({ projectId: "project-a", parentSessionId: "session-a" }, b.id)
    expect(runner.manager.read({ projectId: "project-a", parentSessionId: "session-a" }, b.id).status).toBe("cancelled")
    await stub.awaitInvoked()
    stub.resolveAll("done")
    await runner.dispose()
  })

  test("cancelled worker does not produce a wake to the parent", async () => {
    let resolveRunner: (text: string) => void = () => {}
    const stub = stubHost()
    const runner = new BackgroundToolsRunner(stub, {
      runner: () => new Promise<string>((resolve) => (resolveRunner = resolve))
    })
    const parentId = "parent-cancel"

    const task = runner.manager.enqueue({
      description: "noop",
      prompt: "anything",
      projectId: "project-cancel",
      parentSessionId: parentId
    })
    await drain(50)
    runner.manager.cancel({ projectId: "project-cancel", parentSessionId: parentId }, task.id)
    const cancellation = runner.cancelForParent({ projectId: "project-cancel", parentSessionId: parentId })
    await drain(100)
    expect(runner.manager.read({ projectId: "project-cancel", parentSessionId: parentId }, task.id).status).toBe("cancelled")
    resolveRunner("late text")
    await cancellation
    await runner.dispose()
  })

  test("completed worker delivers findings to the parent via promptAsync", async () => {
    const seen: Array<{ sessionID: string; agent: string; text: string }> = []
    const stub = stubHost({
      promptAsync: async (input: unknown) => {
        const next = input as { sessionID: string; agent?: string; parts: Array<{ type: string; text: string }> }
        seen.push({
          sessionID: next.sessionID,
          agent: next.agent ?? "",
          text: next.parts.find((p) => p.type === "text")?.text ?? ""
        })
        return undefined
      }
    })
    const runner = new BackgroundToolsRunner(stub, {
      runner: async () => "verify toolpath notes"
    })
    const parentId = "parent-wake"
    const task = runner.manager.enqueue({
      description: "probe",
      prompt: "tell me",
      projectId: "project-wake",
      parentSessionId: parentId
    })
    await drain(80)
    expect(runner.manager.read({ projectId: "project-wake", parentSessionId: parentId }, task.id).status).toBe("completed")
    await runner.dispose()
    // nikcli's wake format: what finished, its status and id, the result, and how to read the rest.
    const wake = seen.find((entry) => entry.sessionID === parentId && entry.agent === "cadcam-build")
    expect(wake?.text).toBe([
      `Background task "probe" finished.`,
      "Status: completed",
      `Task ID: ${task.id}`,
      "",
      "Result:",
      "verify toolpath notes",
      "",
      "",
      `Use agent action read (taskId="${task.id}") for the full result.`
    ].join("\n"))
  })

  test("a report of a few very long lines is cut by size too", async () => {
    const seen: string[] = []
    const stub = stubHost({ promptAsync: async (input: unknown) => { seen.push((input as { parts: Array<{ text: string }> }).parts[0]!.text); return undefined } })
    const runner = new BackgroundToolsRunner(stub, { runner: async () => "x".repeat(50_000) })
    runner.manager.enqueue({ description: "wide", prompt: "p", projectId: "project-wide", parentSessionId: "parent-wide" })
    await drain(80)
    await runner.dispose()
    expect(seen[0]!.length).toBeLessThan(12_500)
    expect(seen[0]).toContain("...(truncated)")
  })

  test("a long report is truncated at 100 lines with a pointer to the full result", async () => {
    const seen: string[] = []
    const stub = stubHost({
      promptAsync: async (input: unknown) => {
        const next = input as { parts: Array<{ type: string; text: string }> }
        seen.push(next.parts.find((p) => p.type === "text")?.text ?? "")
        return undefined
      }
    })
    const report = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join("\n")
    const runner = new BackgroundToolsRunner(stub, { runner: async () => report })
    const task = runner.manager.enqueue({ description: "long scan", prompt: "p", projectId: "project-long", parentSessionId: "parent-long" })
    await drain(80)
    await runner.dispose()
    const body = seen[0] ?? ""
    expect(body).toContain(`Task ID: ${task.id}`)
    expect(body).toContain("line 100")
    expect(body).not.toContain("line 101")
    expect(body).toContain("\n...(truncated)")
    expect(body).toContain(`Use agent action read (taskId="${task.id}") for the full result.`)
  })
})

/** A host whose specialist session the test scripts: what the prompt does, what the child had written, and which sessions were removed. */
const scriptedHost = (script: { prompt: (input: { signal?: AbortSignal }) => Promise<unknown>; written?: string }) => {
  const removed: string[] = []
  const aborted: string[] = []
  const runtime = {
    host: () => Effect.promise(async () => ({
      projectId: "p", directory: "/tmp",
      client: {
        session: {
          create: async () => ({ id: "child-1" }),
          abort: async (input: { sessionID: string }) => { aborted.push(input.sessionID); return true },
          remove: async (input: { sessionID: string }) => { removed.push(input.sessionID); return true },
          messages: async () => script.written === undefined ? [] : [{ info: { role: "assistant" }, parts: [{ type: "text", text: script.written }] }]
        },
        "session-prompt": { prompt: (input: unknown, options?: { signal?: AbortSignal }) => script.prompt({ ...(input as object), ...(options?.signal ? { signal: options.signal } : {}) }), promptAsync: async () => undefined }
      }
    }))
  }
  return { runtime: runtime as unknown as NikCliRuntime, removed, aborted }
}
const finished = async (runner: BackgroundToolsRunner, owner: { projectId: string; parentSessionId: string }, id: string) => runner.manager.wait(owner, id)

describe("a specialist that does not finish", () => {
  test("the parent reads why, what it had written, and that an editor may have changed the drawing", async () => {
    const host = scriptedHost({ prompt: async () => { throw new Error("The provider rejected the tool schema") }, written: "Moved bracket-2 by 20 mm; was about to regroup." })
    const runner = new BackgroundToolsRunner(host.runtime)
    const owner = { projectId: "p", parentSessionId: "parent-fail" }
    const task = runner.manager.enqueue({ ...owner, prompt: "p", description: "move", agent: "editor", edits: true })
    const settled = await finished(runner, owner, task.id)
    await runner.dispose()
    expect(settled.status).toBe("error")
    expect(settled.error).toContain("The CAD editor stopped before it finished: The provider rejected the tool schema")
    expect(settled.error).toContain("part of its work may already be in the drawing")
    expect(settled.error).toContain("Moved bracket-2 by 20 mm; was about to regroup.")
    // Nothing is left behind: the failed child's session is removed, its last words travel in the error.
    expect(host.removed).toEqual(["child-1"])
  })

  test("a read-only specialist's failure carries no warning about the drawing", async () => {
    const host = scriptedHost({ prompt: async () => { throw new Error("invalid request") } })
    const runner = new BackgroundToolsRunner(host.runtime)
    const owner = { projectId: "p", parentSessionId: "parent-read" }
    const task = runner.manager.enqueue({ ...owner, prompt: "p", description: "scan", agent: "researcher" })
    const settled = await finished(runner, owner, task.id)
    await runner.dispose()
    expect(settled.error).toContain("stopped before it finished: invalid request")
    expect(settled.error).not.toContain("drawing")
    expect(settled.error).not.toContain("What it had written")
  })

  test("a specialist past its time limit is stopped and the parent is told it ran out of time", async () => {
    const spec = SUBAGENTS.researcher as { timeoutMs: number }
    const original = spec.timeoutMs
    spec.timeoutMs = 40
    try {
      const host = scriptedHost({
        prompt: ({ signal }) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("This operation was aborted")), { once: true })),
        written: "Found 3 of 5 holes so far."
      })
      const runner = new BackgroundToolsRunner(host.runtime)
      const owner = { projectId: "p", parentSessionId: "parent-slow" }
      const task = runner.manager.enqueue({ ...owner, prompt: "p", description: "slow scan", agent: "researcher" })
      const settled = await finished(runner, owner, task.id)
      await runner.dispose()
      expect(settled.status).toBe("error")
      expect(settled.error).toContain("ran out of time")
      expect(settled.error).toContain("Found 3 of 5 holes so far.")
      expect(settled.error).not.toContain("This operation was aborted")
      expect(host.aborted).toEqual(["child-1"])
      expect(host.removed).toEqual(["child-1"])
    } finally {
      spec.timeoutMs = original
    }
  })

  test("a cancelled specialist is stopped in the host and its session is removed, with no failure text", async () => {
    const host = scriptedHost({ prompt: ({ signal }) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })), written: "partial" })
    const runner = new BackgroundToolsRunner(host.runtime)
    const owner = { projectId: "p", parentSessionId: "parent-cancel-2" }
    const task = runner.manager.enqueue({ ...owner, prompt: "p", description: "scan", agent: "researcher" })
    await drain(30)
    runner.manager.cancel(owner, task.id)
    const settled = await finished(runner, owner, task.id)
    await runner.dispose()
    expect(settled.status).toBe("cancelled")
    expect(settled.error).toBeUndefined()
    expect(host.aborted).toEqual(["child-1"])
    expect(host.removed).toEqual(["child-1"])
  })

  test("a specialist that ends without text reports what it wrote earlier; with nothing at all it is an error, not an empty success", async () => {
    const earlier = scriptedHost({ prompt: async () => ({ parts: [{ type: "tool" }] }), written: "Done: hole-1 8 mm." })
    const runner = new BackgroundToolsRunner(earlier.runtime)
    const owner = { projectId: "p", parentSessionId: "parent-quiet" }
    const first = runner.manager.enqueue({ ...owner, prompt: "p", description: "quiet", agent: "researcher" })
    expect(await finished(runner, owner, first.id)).toMatchObject({ status: "completed", text: "Done: hole-1 8 mm." })
    await runner.dispose()

    const silent = scriptedHost({ prompt: async () => ({ parts: [] }) })
    const second = new BackgroundToolsRunner(silent.runtime)
    const task = second.manager.enqueue({ ...owner, prompt: "p", description: "silent", agent: "modeler", edits: true })
    const settled = await finished(second, owner, task.id)
    await second.dispose()
    expect(settled.status).toBe("error")
    expect(settled.error).toContain("ended without writing a report")
    expect(settled.error).toContain("part of its work may already be in the drawing")
  })

  test("the failure text caps a very long last message", () => {
    const error = failureReport({ title: "CAM programmer", cause: new Error("x"), edits: false, partial: "a".repeat(9_000) })
    expect(error.message.length).toBeLessThan(4_400)
    expect(error.message).toContain("...(truncated)")
  })
})
