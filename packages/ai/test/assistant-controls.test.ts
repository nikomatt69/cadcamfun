import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { contextBudget, replySessionQuestion } from "../src/nikcli/session-controls.ts"
import { HostToolRegistry } from "../src/nikcli/tool-registry.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"
import { toolValidationFailure } from "../src/tool-validation.ts"
import { actionById, runAction } from "../src/actions/catalogue.ts"
import { parametricReport } from "../src/parametric.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { projectMemoryPrefix } from "../src/project-memory.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const context = { handlers: {} as ToolHandlersShape, projectId: "p" }

describe("connected assistant controls", () => {
  test("a malformed screenshot payload fails with recovery before any mutation", async () => {
    for (const [id, input] of [
      ["cad.parametric_validate", { history: "{}" }],
      ["cad.parametric_test", { elementId: "part", cases: '[{"name":"wide"}]' }]
    ] as const) {
      const spec = actionById(id)!
      const rejected = spec.parameters.safeParse(input)
      expect(rejected.success, id).toBe(false)
      if (rejected.success) continue
      const failure = toolValidationFailure("cad", rejected.error)
      expect(failure.mutationApplied).toBe(false)
      expect(failure.recovery).toContain("never as")
      expect(failure.recovery).toContain("do not repeat unchanged")
      // The refusal the model reads carries the shared contract's tag.
      expect(await runAction(id, input, context)).toMatchObject({ ok: false, _tag: "ActionInvalidInput" })
    }
  })

  test("the published JSON example builds a real solid and its dimensions drive volume", async () => {
    const skill = CADCAM_SKILLS.find((entry) => entry.name === "parametric-design")!
    const example = JSON.parse(skill.body.match(/```json\n([\s\S]*?)\n```/)![1]!)
    const malformed = structuredClone(example)
    malformed.history.features[0].sketch.entities[0].kind = "rectangle"
    const rejected = await runAction("cad.parametric_validate", malformed, context)
    expect(rejected).toMatchObject({ ok: false, _tag: "ActionInvalidInput" })
    const report = await runAction("cad.parametric_validate", example, context) as { ok: boolean; volumeMm3: number | null }
    expect(report.ok).toBe(true)
    const built = parametricReport(example.history)
    expect(built.ok).toBe(true)
    const taller = parametricReport({ ...example.history, parameters: { ...example.history.parameters, height: 40 } })
    expect(taller.ok).toBe(true)
    if (built.ok && taller.ok && built.volumeMm3 !== null) expect(taller.volumeMm3).toBeCloseTo(built.volumeMm3 * 2, 3)
    expect(report.volumeMm3).toBeCloseTo(built.ok && built.volumeMm3 !== null ? built.volumeMm3 : 0, 6)
  })

  test("registry reuses the same project snapshot and rejects native collisions", () => {
    let builds = 0
    const registry = new HostToolRegistry(() => { builds++; return [{ id: "cad_probe", description: "Inspect", parameters: z.object({ value: z.number() }), execute: async () => "ok" }] })
    expect(registry.tools("p")).toBe(registry.tools("p"))
    expect(builds).toBe(1)
    expect(registry.catalogue("p").some((tool) => tool.id === "question")).toBe(true)
    const failed = z.object({ value: z.number() }).safeParse({ value: "x" })
    if (!failed.success) expect(registry.tools("p")[0]!.formatValidationError!(failed.error)).toContain("value")
    expect(() => new HostToolRegistry(() => [{ ...registry.tools("p")[0]!, id: "question" }]).tools("p")).toThrow("duplicate")
  })

  test("context budget mirrors output caps, input limits and unknown catalog entries", () => {
    expect(contextBudget({ contextWindow: 100_000, maxOutput: 4096 })).toMatchObject({ requestOutput: 4096, compactAt: 95_904 })
    expect(contextBudget({ contextWindow: 200_000, maxOutput: 64_000, inputWindow: 128_000 })).toMatchObject({ requestOutput: 32_000, compactAt: 108_000 })
    expect(contextBudget({ contextWindow: 200_000, maxOutput: 64_000, inputWindow: 128_000 }, { reserved: 10_000 })).toMatchObject({ compactAt: 118_000 })
    expect(contextBudget({ contextWindow: 0, maxOutput: 0 })).toEqual({})
  })

  test("questions enforce ownership, available options and one answer per question", async () => {
    const replies: unknown[] = []
    const host = { client: { question: {
      list: async () => [{ id: "q", sessionID: "owner", questions: [{ header: "Stock", question: "Choose stock", options: [{ label: "Aluminium", description: "Stock" }], custom: false }] }],
      reply: async (input: unknown) => { replies.push(input) }, reject: async () => undefined
    } } } as unknown as ProjectHost
    await expect(replySessionQuestion(host, "other", { sessionId: "other", action: "answer_question", requestId: "q", answers: [["Aluminium"]] })).rejects.toThrow("no longer pending")
    await expect(replySessionQuestion(host, "owner", { sessionId: "owner", action: "answer_question", requestId: "q", answers: [["Steel"]] })).rejects.toThrow("available")
    expect(replies).toHaveLength(0)
    await replySessionQuestion(host, "owner", { sessionId: "owner", action: "answer_question", requestId: "q", answers: [["Aluminium"]] })
    expect(replies).toEqual([{ requestID: "q", answers: [["Aluminium"]] }])
  })

  test("project memory has no prefix overlap and strips only its own namespace", async () => {
    expect(projectMemoryPrefix("p.a").startsWith(projectMemoryPrefix("p"))).toBe(false)
    const saved = new Map<string, string>()
    const handlers = { remember: async (key: string, value: string) => { saved.set(key, value); return { ok: true } }, recall: async (prefix: string) => [...saved].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })) } as unknown as ToolHandlersShape
    await runAction("memory_edit.remember", { key: "stock", value: "Confirmed aluminium" }, { projectId: "p", handlers })
    expect(await runAction("memory.recall", {}, { projectId: "other", handlers })).toEqual([])
    expect(await runAction("memory.recall", {}, { projectId: "p", handlers })).toEqual([{ key: "stock", value: "Confirmed aluminium" }])
  })
})