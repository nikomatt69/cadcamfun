/**
 * What one execution came to. Every answer an implementation gives is classified here, once, before it reaches an
 * adapter (the host tool, `runAction`, the bridge): a success is checked against the action's declared result, a refusal
 * is given the shared failure shape, and anything the contract does not describe is never passed on as success.
 *
 * - `succeeded`: the value matches the declared result (a verdict whose `ok` is false, such as a failed check, included).
 * - `partial`: it matches, and names what it left out (the contract's `partialWhen` field is non-empty).
 * - `refused`: the action declined (`ok: false` that matches no result), or a read failed in its own code.
 * - `conflict`: the document changed under it (`ActionConflict`, or a stale-revision answer).
 * - `cancelled`: it was stopped before it ran.
 * - `uncertain`: a write that may or may not have committed (thrown or aborted mid-way), or an answer outside the contract.
 *
 * An action whose family is not migrated yet has no declared result: its success passes as `succeeded` with
 * `validated: false`, and the harness inventory counts it.
 */
import { Exit, Schema } from "effect"
import { ActionCommitted, actionOutcome, type ActionContract, type ActionOutcomeKind } from "@cadcamfun/api"
import { ToolMediaResult } from "../tools/define.ts"
import type { FilePart } from "../attachments.ts"
import type { ActionKind } from "./action.ts"

export interface ActionOutcome {
  readonly kind: ActionOutcomeKind
  /** The answer as the model and the desktop read it: the implementation's own value, or the shared failure shape. */
  readonly value: unknown
  /** Media the answer carries (a viewport capture), kept apart from the value. */
  readonly files?: ReadonlyArray<FilePart>
  /** The value was checked against a declared result schema. */
  readonly validated: boolean
}

interface Classified { readonly id: string; readonly kind: ActionKind; readonly contract: ActionContract }

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** The shared failure shape, keeping what the implementation said beyond it (problems, warnings, the drawing). */
export const failure = (actionId: string, tag: string, error: string, rest: Record<string, unknown> = {}) =>
  ({ ...rest, ok: false as const, _tag: tag, actionId, error })

const issueText = (exit: Exit.Exit<unknown, Schema.SchemaError>): string =>
  Exit.isFailure(exit) ? String(exit.cause).replace(/^Cause\(\[Fail\(SchemaError\(/, "").replace(/\)\)\]\)$/, "").replace(/\s+/g, " ").slice(0, 300) : ""

const classifyRefusal = (spec: Classified, value: Record<string, unknown>): ActionOutcome => {
  const { ok: _ok, _tag, actionId, error, ...rest } = value
  // Already a typed failure (`ActionConflict`, `ActionDenied`, ...): its shape is a shared contract, passed on unchanged.
  if (typeof _tag === "string" && _tag !== "" && typeof actionId === "string") return { kind: actionOutcome(value), value, validated: true }
  // A stale-revision answer is the document changing under the call, whatever the implementation called it.
  const tag = typeof _tag === "string" && _tag !== "" ? _tag : value["status"] === "stale" ? "ActionStale" : "ActionRefused"
  const message = typeof error === "string" && error !== "" ? error : typeof value["message"] === "string" ? value["message"] : "The action was refused."
  const normalized = failure(spec.id, tag, message, rest)
  return { kind: actionOutcome(normalized), value: normalized, validated: true }
}

/** Classifies one answer of `spec`'s implementation. */
export const classifyOutcome = (spec: Classified, raw: unknown): ActionOutcome => {
  const files = raw instanceof ToolMediaResult ? raw.files : undefined
  const value = raw instanceof ToolMediaResult ? raw.value : raw
  const object = asRecord(value)
  // Receipts have their own shared contract; a tag alone cannot certify a commit or a different action's result.
  if (object?.["_tag"] === "ActionCommitted") {
    const committed = Schema.decodeUnknownExit(ActionCommitted)(value)
    if (Exit.isSuccess(committed) && committed.value.receipt.actionId === spec.id) return { kind: "succeeded", value, ...(files ? { files } : {}), validated: true }
    return { kind: "uncertain", value: failure(spec.id, "ActionResultInvalid", "The implementation returned an invalid or mismatched commit receipt. Inspect the document before retrying."), validated: true }
  }
  const schema = spec.contract.result
  if (schema === undefined) {
    if (object?.["ok"] === false) return classifyRefusal(spec, object)
    return { kind: "succeeded", value, ...(files ? { files } : {}), validated: false }
  }
  const checked = Schema.decodeUnknownExit(schema as Schema.Codec<unknown, unknown>)(value)
  // A verdict (`ok: false` because the part or program failed) matches the result and is an answer; anything else that says
  // `ok: false` is the action declining.
  if (Exit.isFailure(checked) && object?.["ok"] === false) return classifyRefusal(spec, object)
  if (Exit.isFailure(checked)) {
    const changed = spec.kind !== "read"
    return {
      kind: "uncertain",
      value: failure(spec.id, "ActionResultInvalid", changed
        ? `The implementation answered outside its contract (${issueText(checked)}). It may have changed the document: inspect before retrying.`
        : `The implementation answered outside its contract (${issueText(checked)}). Nothing was changed; do not rely on this answer.`),
      validated: true
    }
  }
  const partialField = spec.contract.partialWhen
  const left = partialField !== undefined ? object?.[partialField] : undefined
  const partial = Array.isArray(left) ? left.length > 0 : left !== undefined && left !== null && left !== false && left !== 0
  const kind = actionOutcome(value)
  return { kind: kind === "succeeded" && partial ? "partial" : kind, value, ...(files ? { files } : {}), validated: true }
}

/** The wire form an adapter hands on: the value, with its media when it has any. */
export const outcomeWire = (outcome: ActionOutcome): unknown =>
  outcome.files !== undefined ? new ToolMediaResult(outcome.value, outcome.files) : outcome.value
