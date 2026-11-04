/**
 * What a tool result proves, shown under its call and under the answer (RM-07 desktop consumer): the release level of a CAM
 * program, the claims that failed or stayed undecided with the kernel's detail, the verdict of an NC replay or a rebuild, a write's
 * receipt or the conflict that refused it. An answer reads only as released as its weakest program; nothing is upgraded.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { evidenceOf, weakestRelease } from "../src/features/ai/lib/tool-evidence.ts"
import { bootLiveApp } from "./helpers/live-app.ts"

/** The shape of `cam_edit` `run` (packages/ai `cam-job.ts`): release, every claim, the failed and unresolved again. */
const camRun = {
  ok: true, op: "run", release: "preview",
  setups: [{ id: "top", orientation: "+Z", release: "preview", operations: [] }],
  claims: [
    { id: "no-gouge", status: "passed", detail: "no cut below the part" },
    { setup: "top", id: "holder-clearance", status: "failed", detail: "holder touches the clamp at Z 4.2" },
    { id: "material-removed", status: "unresolved", detail: "stock cell 0.5 mm exceeds the tolerance" },
    { id: "machine-travel", status: "unsupported", detail: "no machine envelope" }
  ],
  failed: [{ setup: "top", id: "holder-clearance", status: "failed", detail: "holder touches the clamp at Z 4.2" }],
  unresolved: [{ id: "material-removed", status: "unresolved", detail: "stock cell 0.5 mm exceeds the tolerance" }]
}

describe("the evidence of one result", () => {
  test("a CAM run: release, claim counts, failed then undecided claims with their detail", () => {
    const e = evidenceOf(JSON.stringify(camRun))!
    expect(e.release).toBe("preview")
    expect(e.claims).toEqual({ passed: 1, failed: 1, unresolved: 1, unsupported: 1 })
    expect(e.attention.map((c) => [c.id, c.status, c.setup])).toEqual([["holder-clearance", "failed", "top"], ["material-removed", "unresolved", undefined]])
    expect(e.partialClaims).toBe(false)
    expect(e.outcome).toBe("succeeded")
  })

  test("an artifact nested in the result and an {ok, value} wrapper are read; an unknown release level is not invented", () => {
    expect(evidenceOf(JSON.stringify({ ok: true, artifact: { release: "verified-program", claims: [] } }))!.release).toBe("verified-program")
    expect(evidenceOf(JSON.stringify({ ok: true, value: { release: "blocked" } }))!.release).toBe("blocked")
    expect(evidenceOf(JSON.stringify({ ok: true, release: "shipped" }))).toBeUndefined()
    expect(evidenceOf(JSON.stringify({ ok: true, ids: ["1"] }))).toBeUndefined()
    expect(evidenceOf("not json")).toBeUndefined()
  })

  test("a bounded model view that cut the claims says the counts are partial", () => {
    const bounded = { ...camRun, _preview: { complete: false, fullCharacters: 90000, omitted: [{ path: "claims", total: 40, returned: 4, unit: "items" }] } }
    expect(evidenceOf(JSON.stringify(bounded))!.partialClaims).toBe(true)
    const otherCut = { ...camRun, _preview: { complete: false, fullCharacters: 90000, omitted: [{ path: "setups", total: 40, returned: 4, unit: "items" }] } }
    expect(evidenceOf(JSON.stringify(otherCut))!.partialClaims).toBe(false)
  })

  test("verdicts: NC replay, parametric rebuild, lathe replay", () => {
    expect(evidenceOf(JSON.stringify({ complete: true, verdict: "faults", reasons: ["gouge 0.3 mm at line 120"], findings: [] }))!.verdict)
      .toEqual({ source: "nc", value: "faults", tone: "error", reasons: ["gouge 0.3 mm at line 120"] })
    expect(evidenceOf(JSON.stringify({ ok: true, verification: { verdict: "review", attention: ["literal size 40 mm"] } }))!.verdict)
      .toEqual({ source: "parametric", value: "review", tone: "warn", reasons: ["literal size 40 mm"] })
    expect(evidenceOf(JSON.stringify({ ok: true, verification: { ok: true }, verdict: "matches" }))!.verdict!.tone).toBe("ok")
  })

  test("a write: the receipt's revisions, or the conflict that refused it", () => {
    const committed = evidenceOf(JSON.stringify({ ok: true, _tag: "ActionCommitted", receipt: { receiptId: "r", previousRevision: "7", revision: "8" } }))!
    expect(committed.write).toEqual({ kind: "committed", previousRevision: "7", revision: "8" })
    const conflict = evidenceOf(JSON.stringify({ ok: false, _tag: "ActionConflict", expectedRevision: "7", actualRevision: "9", message: "moved" }))!
    expect(conflict.write).toEqual({ kind: "conflict", previousRevision: "7", revision: "9" })
    expect(conflict.outcome).toBe("conflict")
  })

  test("an answer is as released as its weakest program", () => {
    expect(weakestRelease(["verified-program", undefined, "preview"])).toBe("preview")
    expect(weakestRelease(["verified-program", "blocked"])).toBe("blocked")
    expect(weakestRelease(["verified-program"])).toBe("verified-program")
    expect(weakestRelease([undefined])).toBeUndefined()
  })
})

describe("the evidence in the transcript", () => {
  let app: Awaited<ReturnType<typeof bootLiveApp>>
  beforeAll(async () => { app = await bootLiveApp() }, 60000)
  afterAll(async () => { await app.dispose() })

  const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
  const qa = (selector: string): Element[] => [...document.querySelectorAll(selector)]
  const call = (id: string, tool: string, input: unknown, output: unknown) => [
    { type: "tool_call", sessionId: "s", callId: id, tool, input },
    { type: "tool_result", sessionId: "s", callId: id, tool, ok: true, output: JSON.stringify(output) }
  ]

  test("each result shows its evidence and the answer shows the weakest release", async () => {
    const script = [
      ...call("e1", "cam_edit", { action: "run" }, camRun),
      ...call("e2", "cam_verify", { action: "verify_nc" }, { complete: false, verdict: "incomplete", reasons: ["the part mesh is open"], findings: [] }),
      ...call("e3", "cam_edit", { action: "run" }, { ok: true, op: "run", release: "verified-program", claims: [{ id: "no-gouge", status: "passed", detail: "ok" }], failed: [], unresolved: [] }),
      { type: "done", sessionId: "s", text: "Programmed the plate." }
    ]
    const client = app.state.client as unknown as { ai: { chatStream: unknown } }
    client.ai.chatStream = () => Effect.succeed(Stream.fromIterable(script.map((e) => JSON.stringify(e))))
    const { dispose } = app.visit("/cad")
    try {
      const button = await app.wait(() => q<HTMLButtonElement>('button[title="Show CAD Assistant"]') ?? q("textarea.assistant-prompt"), 30000)
      if (button instanceof window.HTMLButtonElement) button.click()
      const input = await app.wait(() => q<HTMLTextAreaElement>("textarea.assistant-prompt"), 30000)
      input.value = "machine the plate"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 80))
      q<HTMLElement>("button.assistant-send")!.click()
      await app.wait(() => q('[data-testid="ai-turn-evidence"]'), 15000)

      const blocks = qa('[data-testid="tool-evidence"]')
      expect(blocks.map((b) => b.querySelector('[data-testid="evidence-release"]')?.getAttribute("data-release") ?? null)).toEqual(["preview", null, "verified-program"])
      const first = blocks[0]!
      expect(first.querySelector('[data-testid="evidence-claims"]')!.textContent).toContain("1 failed")
      expect(first.querySelector('[data-testid="evidence-attention"]')!.textContent).toContain("Failed top/holder-clearance: holder touches the clamp at Z 4.2")
      expect(first.querySelector('[data-testid="evidence-attention"]')!.textContent).toContain("Undecided material-removed")
      expect(blocks[1]!.querySelector('[data-testid="evidence-verdict"]')!.getAttribute("data-verdict")).toBe("incomplete")
      expect(blocks[1]!.textContent).toContain("the part mesh is open")

      // One verified program does not make the answer verified: the preview one decides.
      const turn = q('[data-testid="ai-turn-evidence"]')!
      expect(turn.getAttribute("data-release")).toBe("preview")
      expect(turn.textContent).toContain("Preview, not verified")
      expect(turn.textContent).toContain("2 programs")
      expect(turn.textContent).toContain("1 claims failed")
    } finally { dispose() }
  })
})
