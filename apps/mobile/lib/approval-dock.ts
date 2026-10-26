import type { TranscriptItem } from "./transcript-rows"

/**
 * The docked approval bar above the composer (nikcli `ComposerApprovalBar`, CADCAMFUN content).
 *
 * The transcript keeps the full permission and question cards as the record; the dock only lifts the
 * unanswered ones next to the composer, so a turn that waits on the person is never buried under a long
 * run of tool calls. Everything the dock decides — which requests are pending, what they are called,
 * where their card is in the list — is pure and lives here.
 */

export type PermissionDecision = "once" | "always" | "reject"

export interface PendingPermission {
  readonly kind: "permission"
  readonly requestId: string
  /** The transcript item that holds the full card. */
  readonly itemId: string
  /** The capability asked for, in words ("Edit", "Cam generate toolpath"). */
  readonly title: string
  /** The first path or command pattern the request covers. */
  readonly target?: string
  /** How many further patterns the request covers, shown as "+2 more". */
  readonly moreTargets: number
}

export interface PendingQuestion {
  readonly kind: "question"
  readonly requestId: string
  readonly itemId: string
  /** The question's own header, or its text when it has none. */
  readonly title: string
  /** The text of the first question, when the header already took the title. */
  readonly prompt?: string
  /** How many questions the request asks; the card answers them together. */
  readonly questions: number
}

export type PendingApproval = PendingPermission | PendingQuestion

/** "cam_generate_toolpath" becomes "Cam generate toolpath"; an empty name still reads as an action. */
export function permissionTitle(permission: string): string {
  const words = permission.replace(/[_.:-]+/g, " ").replace(/\s+/g, " ").trim()
  if (!words) return "Action"
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Unanswered permission requests and questions, oldest first (the order the desktop is waiting on them).
 * Collapsed tool runs never hold a request, so only plain rows are read.
 */
export function pendingApprovals(items: readonly TranscriptItem[]): PendingApproval[] {
  const pending: PendingApproval[] = []
  for (const item of items) {
    if (item.kind !== "row") continue
    const row = item.row
    if (row.kind === "request" && !row.answered) {
      const patterns = row.patterns.map((pattern) => pattern.trim()).filter(Boolean)
      pending.push({
        kind: "permission",
        requestId: row.requestId,
        itemId: item.id,
        title: permissionTitle(row.permission),
        ...(patterns[0] ? { target: patterns[0] } : {}),
        moreTargets: Math.max(0, patterns.length - 1),
      })
    } else if (row.kind === "question" && !row.answered) {
      const first = row.questions[0]
      const header = first?.header?.trim()
      const text = first?.question?.trim()
      pending.push({
        kind: "question",
        requestId: row.requestId,
        itemId: item.id,
        title: header || text || "The assistant has a question",
        ...(header && text ? { prompt: text } : {}),
        questions: row.questions.length,
      })
    }
  }
  return pending
}

/**
 * The dock shows only while the desktop is still holding the turn and reachable: after an error or a
 * disconnect a request can no longer be answered, and an enabled button that fails is worse than none.
 */
export function dockVisible(input: { busy: boolean; online: boolean; pending: number }): boolean {
  return input.busy && input.online && input.pending > 0
}

/** The request on screen: the chosen one while it is still pending, otherwise the oldest. */
export function currentApproval(pending: readonly PendingApproval[], selectedId: string | undefined): { approval: PendingApproval; index: number } | undefined {
  if (pending.length === 0) return undefined
  const at = selectedId ? pending.findIndex((item) => item.requestId === selectedId) : -1
  const index = at >= 0 ? at : 0
  return { approval: pending[index]!, index }
}

/** Previous or next request, wrapping, for the pager chevrons. */
export function stepApproval(pending: readonly PendingApproval[], index: number, direction: 1 | -1): string | undefined {
  if (pending.length === 0) return undefined
  return pending[(index + direction + pending.length) % pending.length]?.requestId
}

export function approvalEyebrow(approval: PendingApproval): string {
  return approval.kind === "permission" ? "Permission required" : "Your input is needed"
}

/** "1 of 3"; empty for a single request so the header stays quiet. */
export function approvalPosition(index: number, count: number): string {
  return count > 1 ? `${index + 1} of ${count}` : ""
}

export function approvalMore(approval: PendingApproval): string {
  if (approval.kind === "permission") return approval.moreTargets > 0 ? `+${approval.moreTargets} more ${approval.moreTargets === 1 ? "path" : "paths"}` : ""
  return approval.questions > 1 ? `${approval.questions} questions` : ""
}

/** What VoiceOver hears once when a request appears (iOS ignores live regions, so the screen announces it). */
export function approvalAnnouncement(approval: PendingApproval, count: number): string {
  const more = count > 1 ? ` ${count} requests are waiting.` : ""
  return approval.kind === "permission"
    ? `Permission required: ${approval.title}. Allow once, allow for this session, or deny.${more}`
    : `The assistant needs your input: ${approval.title}.${more}`
}

export const decisionLabels: Readonly<Record<PermissionDecision, { readonly label: string; readonly short: string }>> = {
  once: { label: "Allow once", short: "Allow once" },
  always: { label: "Allow for this session", short: "Allow for session" },
  reject: { label: "Deny", short: "Deny" },
}

/** Accessible name of a decision button, tied to the request so a screen-reader user knows what it grants. */
export function decisionAccessibilityLabel(decision: PermissionDecision, approval: PendingPermission): string {
  return decision === "reject" ? `Deny ${approval.title}` : `${decisionLabels[decision].label}: ${approval.title}`
}

/** Index of a transcript item in the inverted list's data, or -1 when it is not there (for `scrollToIndex`). */
export function itemIndex(items: readonly TranscriptItem[], itemId: string): number {
  return items.findIndex((item) => item.id === itemId)
}
