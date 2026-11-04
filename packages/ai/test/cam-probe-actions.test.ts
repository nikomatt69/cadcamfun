/** The `cam_edit` probing actions (spec 73 §3.3): declared once, inputs decoded (degrees to radians), handlers reached, refusals kept. */
import { describe, expect, test } from "bun:test"
import { ACTION_CONTRACTS, CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { Effect, Schema } from "effect"
import { ACTION_CATALOGUE, actionById } from "../src/actions/catalogue.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { toolPrompt } from "../src/tools/prompts/index.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const decode = <K extends keyof typeof CAM_ACTION_INPUTS>(key: K, input: unknown) => Schema.decodeUnknownExit(CAM_ACTION_INPUTS[key] as unknown as Schema.Decoder<unknown>)(input)
const ok = (exit: { _tag: string }) => exit._tag === "Success"

const call = (id: string, input: Record<string, unknown>, handlers: Partial<ToolHandlersShape>) =>
  Effect.runPromise(actionById(id)!.run(input as never, { handlers: handlers as ToolHandlersShape, projectId: "p", sessionId: "s" } as never))

describe("cam_edit probing actions", () => {
  test("all three are write actions with a declared result", () => {
    for (const id of ["cam_edit.probe", "cam_edit.probe_run", "cam_edit.probe_apply"]) {
      expect(actionById(id)?.kind, id).toBe("write")
      expect(ACTION_CONTRACTS[id]?.result, id).toBeDefined()
    }
    expect(ACTION_CATALOGUE.filter((a) => a.id.startsWith("cam_edit.probe"))).toHaveLength(3)
    expect(toolPrompt("cam_edit")).toContain("probe_apply")
  })

  test("inputs: degrees decode to radians, limits and required fields hold", () => {
    const web = decode("cam_edit.probe", { operation: { kind: "web", centre: { x: 0, y: 0 }, width: 10, angle: 90, depth: 3 } })
    expect(web._tag === "Success" && (web.value as { operation: { angle: number } }).operation.angle).toBeCloseTo(Math.PI / 2, 12)
    expect(ok(decode("cam_edit.probe", { frame: { a: 121 } }))).toBe(false)
    expect(ok(decode("cam_edit.probe", { frame: { a: -120, c: 45 } }))).toBe(true)
    const check = { name: "d", kind: "size", result: "diameter", nominal: 20, lower: -0.1, upper: 0.1 }
    expect(ok(decode("cam_edit.probe", { checks: Array.from({ length: 21 }, () => check) }))).toBe(false)
    expect(ok(decode("cam_edit.probe_run", {}))).toBe(false)
    expect(ok(decode("cam_edit.probe_apply", { machineConfig: "m" }))).toBe(false)
    expect(ok(decode("cam_edit.probe_apply", { machineConfig: "m", mode: "merge" }))).toBe(false)
    const row = { offset: "G54", x: 0, y: 0, z: 0 }
    expect(ok(decode("cam_edit.probe_apply", { machineConfig: "m", mode: "set", entries: Array.from({ length: 13 }, () => row) }))).toBe(false)
    expect(ok(decode("cam_edit.probe_apply", { machineConfig: "m", mode: "set", entries: [row] }))).toBe(true)
  })

  test("the handlers receive the decoded input; a host without them says so; results are checked against the contract", async () => {
    let seen: unknown
    const answer = { ok: true, operationId: "op", cycle: "bore", programHash: "h", lines: 3, dialect: "fanuc", revision: "r", warnings: [] }
    const handlers: Partial<ToolHandlersShape> = { probeOperation: async (_p, input) => { seen = input; return answer } }
    await call("cam_edit.probe", { feature: { elementId: "part", hint: "bore" }, workOffset: "G54" }, handlers)
    expect(seen).toMatchObject({ feature: { elementId: "part", hint: "bore" }, workOffset: "G54" })
    expect(await call("cam_edit.probe_run", { operationId: "op" }, {})).toMatchObject({ ok: false })
    expect(JSON.stringify(await call("cam_edit.probe_apply", { machineConfig: "m", mode: "add", reportId: "r" }, {}))).toContain("unavailable")
    const verdict = Schema.decodeUnknownExit(ACTION_CONTRACTS["cam_edit.probe_run"]!.result! as Schema.Decoder<unknown>)({ ok: false, reportId: "r", operationId: "o", kind: "part", verdict: "fail", checks: 2, failed: 1, offsetsUpdated: false })
    expect(verdict._tag).toBe("Success")
  })

  test("the skill exists, inside its budgets, and teaches the loop", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "probing-and-inspection")!
    expect(skill.description.length).toBeLessThan(100)
    expect(skill.body.length).toBeLessThanOrEqual(17_000)
    for (const word of ["probe_run", "probe_apply", "M19", "missed", "stale", "G54.1 P3", "rotary", "toolSetter", "cam review"]) expect(skill.body).toContain(word)
  })
})
