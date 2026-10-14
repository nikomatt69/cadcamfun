/**
 * What the desktop checks about a `tool_call` before it reaches the reducer.
 *
 * The authoritative parameter schemas belong to the action catalogue (`packages/ai/src/actions/*`, zod) and are enforced
 * by the sidecar before a handler runs; the desktop must not keep a second copy of them, because a copy is a copy that
 * drifts. What the UI owes the transcript is narrow and does not need the catalogue: the event is a JSON object, it is
 * not absurdly large, and a tool that carries several capabilities named which one it is going to run.
 *
 * So the mirrored shape is `action` plus the action's own fields. A call without an `action` is malformed for every
 * consolidated tool and is rejected here, before it could be dispatched against the stores.
 */
import { Schema } from "effect"
import type { ToolId } from "./tools.ts"

const record = Schema.Record(Schema.String, Schema.Unknown)

/** One tool's call: the capability's name and whatever that capability takes. */
const actionCall = Schema.Struct({ action: Schema.String.check(Schema.isMinLength(1)) }) as unknown as Schema.Top

export const MAX_TOOL_INPUT_BYTES = 256 * 1024

/**
 * Typed as `Record<ToolId, Schema.Top>` so `ToolInputSchemas[tool]` resolves to a single schema type the decoder can
 * consume (rather than the `as const satisfies` union TS cannot narrow).
 */
export const ToolInputSchemas: Record<ToolId, Schema.Top> = {
  cad: actionCall,
  cad_edit: actionCall,
  cam: actionCall,
  cam_edit: actionCall,
  cam_verify: actionCall,
  library: actionCall,
  parts: actionCall,
  library_edit: actionCall,
  memory: actionCall,
  memory_edit: actionCall,
  research: actionCall,
  vcs: actionCall,
  vcs_edit: actionCall,
  agent: actionCall
}

export type ToolInputSchemas = typeof ToolInputSchemas

/**
 * The `action` a call names, or `undefined` when it names none. The UI branches on this (`cad_edit delete` mirrors a
 * deletion, `cad_edit add` an addition) instead of on a per-verb tool id the host no longer registers.
 */
export const actionOf = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  const action = (input as { action?: unknown }).action
  return typeof action === "string" && action !== "" ? action : undefined
}