/**
 * The evidence of a tool result under its row (`lib/tool-evidence.ts`), and the evidence of a whole answer under the turn: the
 * release level of the program, the claims that keep it from `verified-program` with the kernel's detail, the verdict of a replay or
 * rebuild, and what a write committed or why it was refused. An answer reads as released only as far as its weakest program.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { evidenceOf, weakestRelease, type EvidenceClaim, type ReleaseLevel, type ToolEvidence } from "../lib/tool-evidence.ts"
import type { AiToolCall } from "../lib/types.ts"

const RELEASE_TONE: Readonly<Record<ReleaseLevel, "ok" | "warn" | "error">> = { "verified-program": "ok", preview: "warn", blocked: "error" }

export const ReleaseBadge = (props: { readonly release: ReleaseLevel }): JSX.Element => (
  <span class="assistant-tool-chip" data-testid="evidence-release" data-release={props.release} data-tone={RELEASE_TONE[props.release]}>
    {t(`ai.evidence.release.${props.release}` as never)}
  </span>
)

const claimLine = (claim: EvidenceClaim): string =>
  t(claim.status === "failed" ? "ai.evidence.claimFailed" : "ai.evidence.claimUnresolved", {
    id: claim.setup !== undefined ? `${claim.setup}/${claim.id}` : claim.id, detail: claim.detail
  })

export function EvidenceBlock(props: { readonly evidence: ToolEvidence }): JSX.Element {
  const e = () => props.evidence
  const total = () => e().claims.passed + e().claims.failed + e().claims.unresolved + e().claims.unsupported
  return (
    <div class="assistant-tool-evidence" data-testid="tool-evidence" role="group" aria-label={t("ai.evidence.label")}>
      <p class="assistant-tool-chips">
        <Show when={e().release}>{(release) => <ReleaseBadge release={release()} />}</Show>
        <Show when={total() > 0}>
          <span class="assistant-tool-chip" data-testid="evidence-claims" data-failed={e().claims.failed} data-unresolved={e().claims.unresolved}>
            {t("ai.evidence.claims", { passed: e().claims.passed, failed: e().claims.failed, unresolved: e().claims.unresolved, unsupported: e().claims.unsupported })}
            {e().partialClaims ? ` ${t("ai.evidence.claimsPartial")}` : ""}
          </span>
        </Show>
        <Show when={e().verdict}>{(verdict) => (
          <span class="assistant-tool-chip" data-testid="evidence-verdict" data-verdict={verdict().value} data-tone={verdict().tone}>
            {t(`ai.evidence.verdict.${verdict().source}.${verdict().value}` as never)}
          </span>
        )}</Show>
        <Show when={e().write}>{(write) => (
          <span class="assistant-tool-chip" data-testid="evidence-write" data-kind={write().kind} data-tone={write().kind === "committed" ? "ok" : "error"}>
            {write().kind === "committed"
              ? t("ai.evidence.committed", { previous: write().previousRevision ?? "-", revision: write().revision ?? "-" })
              : t("ai.evidence.conflict", { expected: write().previousRevision ?? "-", actual: write().revision ?? "-" })}
          </span>
        )}</Show>
      </p>
      <Show when={e().attention.length > 0 || (e().verdict?.reasons.length ?? 0) > 0}>
        <ul class="assistant-tool-lines" data-testid="evidence-attention">
          <For each={e().attention.slice(0, 8)}>{(claim) => <li class="break-words" data-claim={claim.id} data-status={claim.status}>{claimLine(claim)}</li>}</For>
          <For each={(e().verdict?.reasons ?? []).slice(0, 6)}>{(reason) => <li class="break-words">{reason}</li>}</For>
          <Show when={e().attention.length > 8}><li class="assistant-meta-text">{t("ai.toolView.more", { count: e().attention.length - 8 })}</li></Show>
        </ul>
      </Show>
    </div>
  )
}

/** The evidence of one answer: its weakest release and the claims that failed or stayed undecided in any of its results. */
export function TurnEvidence(props: { readonly calls: ReadonlyArray<AiToolCall | undefined> }): JSX.Element {
  const all = createMemo(() => props.calls.flatMap((call) => {
    if (call?.status !== "ok") return []
    const evidence = evidenceOf(call.output)
    return evidence === undefined ? [] : [evidence]
  }))
  const release = createMemo(() => weakestRelease(all().map((e) => e.release)))
  const failed = () => all().reduce((sum, e) => sum + e.claims.failed, 0)
  const unresolved = () => all().reduce((sum, e) => sum + e.claims.unresolved, 0)
  return (
    <Show when={release()}>
      {(level) => (
        <p class="assistant-turn-footer" data-testid="ai-turn-evidence" data-release={level()} role="note">
          <ReleaseBadge release={level()} />{" "}
          {t("ai.evidence.turn", { failed: failed(), unresolved: unresolved(), results: all().filter((e) => e.release !== undefined).length })}
        </p>
      )}
    </Show>
  )
}
