/**
 * The tool calls a `code_mode` program makes, made visible while it runs.
 *
 * nikcli's `code_mode` (`tool/code_mode.ts`) runs a confined program that calls the permitted tools as
 * `tools.cad_edit({...})`. Those inner calls execute through the same tool definitions this package registers, but the
 * host reports only the program's own part: its input, and its output when it ends. So a program that builds a bolt
 * circle in a loop changed the stored drawing while the editor stayed empty until the whole program returned, which is
 * the opposite of building live.
 *
 * Every registered tool records what it did here, keyed by the call id of the part it ran under. For a direct call that
 * is its own part and nothing ever reads the entry; for a program it is the program's part, and the event mapper drains
 * the entries each time the host updates that part (the host publishes one at the start and end of every inner call) and
 * turns them into ordinary `tool_call` / `tool_result` events. The editor, the CAM page and the transcript then treat an
 * inner call exactly like a top-level one.
 */

export interface ProgramCall {
  readonly tool: string
  readonly input: unknown
  readonly output: string
  /** The tool threw (the host would have reported an error): `output` is the message. */
  readonly failed: boolean
}

/** More than this many unread parts means entries are being recorded for calls nobody drains: drop the oldest. */
const MAX_PARTS = 256

const pending = new Map<string, Array<ProgramCall>>()

export const recordProgramCall = (callId: string | undefined, call: ProgramCall): void => {
  if (callId === undefined || callId === "") return
  const calls = pending.get(callId)
  if (calls) calls.push(call)
  else {
    pending.set(callId, [call])
    if (pending.size > MAX_PARTS) pending.delete(pending.keys().next().value!)
  }
}

/** Takes the calls recorded under a part since the last drain, in the order they finished. */
export const drainProgramCalls = (callId: string): ReadonlyArray<ProgramCall> => {
  const calls = pending.get(callId)
  if (calls === undefined) return []
  pending.delete(callId)
  return calls
}

/** Forgets a part's entries (a direct call finished: nothing will drain them). */
export const forgetProgramCalls = (callId: string): void => {
  pending.delete(callId)
}

export const pendingProgramParts = (): number => pending.size
