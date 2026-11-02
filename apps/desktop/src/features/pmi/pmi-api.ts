/**
 * PMI API adapter: the only place the desktop talks to the `pmi` HttpApi group
 * (`GET/PUT /api/drawings/:id/pmi`). Responses carry `pmi: unknown`; they are normalised with
 * `pmi.pmiSetOf` / validated with `pmi.validatePmiSet` from `@cadcamfun/core`, never hand-parsed.
 * A concurrent save is a 409: it is surfaced as `{ outcome: "conflict" }`, never swallowed or retried.
 */
import { pmi } from "@cadcamfun/core"
import type { AppState } from "../../shared/state/context.ts"
import { isSaveConflict } from "../cad/lib/stored-revision.ts"

export interface PmiLoadResult { readonly set: pmi.PmiSet; readonly fingerprint: string; readonly issues: readonly pmi.PmiIssue[] }
export type PmiSaveResult =
  | { readonly outcome: "saved"; readonly result: PmiLoadResult }
  | { readonly outcome: "conflict"; readonly message: string }
  | { readonly outcome: "invalid"; readonly message: string }

const normalise = (raw: unknown): PmiLoadResult => {
  const set = pmi.pmiSetOf({ pmi: raw })
  return { set, fingerprint: pmi.pmiFingerprint(set), issues: pmi.validatePmiSet(set) }
}

/** Loads the PMI set of a drawing; an absent `pmi` field reads as the empty set. */
export const loadPmi = async (app: AppState, drawingId: string): Promise<PmiLoadResult> => {
  const reply = await app.runtime.run(app.client.pmi.get({ params: { id: drawingId } }))
  // Prefer the server-computed fingerprint/issues when present; fall back to the same core functions.
  const base = normalise((reply as { pmi: unknown }).pmi)
  const server = reply as { fingerprint?: unknown; issues?: unknown }
  return {
    set: base.set,
    fingerprint: typeof server.fingerprint === "string" ? server.fingerprint : base.fingerprint,
    issues: Array.isArray(server.issues) ? (server.issues as pmi.PmiIssue[]) : base.issues
  }
}

/**
 * Saves the PMI set with CAS (`baseUpdatedAt` is the `updatedAt` last seen for the drawing).
 * Invalid sets are refused locally with the core validation messages before any request is sent.
 */
export const savePmi = async (app: AppState, drawingId: string, set: pmi.PmiSet, baseUpdatedAt?: string): Promise<PmiSaveResult> => {
  const issues = pmi.validatePmiSet(set)
  if (issues.length > 0) return { outcome: "invalid", message: issues.map((i) => i.message).join("; ") }
  try {
    const reply = await app.runtime.run(app.client.pmi.update({ params: { id: drawingId }, payload: { pmi: set, ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}) } }))
    const base = normalise((reply as { pmi: unknown }).pmi)
    const server = reply as { fingerprint?: unknown; issues?: unknown }
    return { outcome: "saved", result: { set: base.set, fingerprint: typeof server.fingerprint === "string" ? server.fingerprint : base.fingerprint, issues: Array.isArray(server.issues) ? (server.issues as pmi.PmiIssue[]) : base.issues } }
  } catch (cause) {
    if (isSaveConflict(cause)) return { outcome: "conflict", message: cause instanceof Error ? cause.message : String(cause) }
    throw cause
  }
}
