/**
 * Stop hooks (spec 08 "Stop hooks"): operator commands that run when the agent is about to end a turn and may send it back to
 * work with a reason. The contract is Claude Code's `Stop` hook, so its scripts can be reused: exit 0 allows the stop (unless
 * stdout is `{ "decision": "block", "reason": ... }`), exit 2 blocks with stderr as the reason, anything else is a non-blocking
 * error. nikcli's `experimental.hook.session_completed` is fire-and-forget, so the hook belongs to the turn loop (`chat.ts`).
 */
import { readFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { AiConfigError } from "../errors.ts"

export const STOP_HOOK_TIMEOUT_MS = 60_000
const MAX_HOOKS = 8
const REASON_LIMIT = 4_000
/** Output a hook may write before the rest is dropped: enough for a reason or a decision, never a memory hazard. */
const OUTPUT_LIMIT = 64 * 1024
export const DEFAULT_STOP_REASON = "A stop hook reported that the work is not finished."
/** Only these variables of the sidecar reach a hook: a tool path and a home, never a credential. */
const INHERITED_ENV = ["PATH", "HOME", "LANG", "TMPDIR"] as const

const StopHookSchema = Schema.Struct({
  command: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  timeoutMs: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1_000, maximum: 600_000 }))),
  environment: Schema.optionalKey(Schema.Record(Schema.String, Schema.String))
})
const HooksFileSchema = Schema.Struct({
  stop: Schema.optionalKey(Schema.Array(StopHookSchema).check(Schema.isMaxLength(MAX_HOOKS)))
})

export type StopHookSpec = typeof StopHookSchema.Type

/** What a stop hook is told about the turn (Claude Code's field names, plus the turn's own evidence). */
export interface StopHookInput {
  readonly sessionId: string
  /** The project's host directory: the hook's working directory. */
  readonly cwd: string
  /** This run was itself started by a stop-hook block. */
  readonly stopHookActive: boolean
  readonly lastAssistantMessage: string
  /** Plan items still pending or in progress. */
  readonly openTodos: ReadonlyArray<string>
}

export type StopHookVerdict = { readonly decision: "allow" } | { readonly decision: "block"; readonly reason: string }

/** One hook's outcome; `error` never blocks a stop. */
export type StopHookOutcome = StopHookVerdict | { readonly decision: "error"; readonly message: string }

/** The turn loop's view of the configured hooks. */
export type StopHook = (input: StopHookInput) => Effect.Effect<StopHookVerdict>

/**
 * Decodes `<data dir>/ai/hooks.json`. A missing file means no hooks; a present file that does not decode is a configuration
 * error at start-up, never silently ignored (the same rule as `policy.json`).
 */
export const readStopHooksFile = (path: string): Effect.Effect<ReadonlyArray<StopHookSpec>, AiConfigError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({ try: () => readFile(path, "utf8"), catch: (cause) => cause }).pipe(
      Effect.catch((cause) =>
        (cause as { code?: string } | null)?.code === "ENOENT"
          ? Effect.succeed(undefined)
          : Effect.fail(new AiConfigError({ message: `Could not read the AI hooks file ${path}: ${cause instanceof Error ? cause.message : String(cause)}` }))
      )
    )
    if (raw === undefined) return []
    const json = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => new AiConfigError({ message: `The AI hooks file ${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}` })
    })
    const file = yield* Schema.decodeUnknownEffect(HooksFileSchema)(json, { onExcessProperty: "error" }).pipe(
      Effect.mapError((cause) => new AiConfigError({ message: `The AI hooks file ${path} does not match { stop: [{ command: [...], timeoutMs?, environment? }] }: ${cause.message}` }))
    )
    return file.stop ?? []
  })

const reasonOf = (text: string): string => {
  const trimmed = text.trim()
  return trimmed === "" ? DEFAULT_STOP_REASON : trimmed.slice(0, REASON_LIMIT)
}

/** Claude Code's decision for an exit code and the hook's output. */
export const decideStop = (code: number | null, stdout: string, stderr: string): StopHookOutcome => {
  if (code === 2) return { decision: "block", reason: reasonOf(stderr) }
  if (code !== 0) return { decision: "error", message: `exited with code ${code ?? "unknown"}${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ""}` }
  const text = stdout.trim()
  if (!text.startsWith("{")) return { decision: "allow" }
  try {
    const value = JSON.parse(text) as unknown
    if (value !== null && typeof value === "object" && (value as { decision?: unknown }).decision === "block") {
      const reason = (value as { reason?: unknown }).reason
      return { decision: "block", reason: reasonOf(typeof reason === "string" ? reason : "") }
    }
  } catch { /* Plain output that happens to start with a brace: no decision. */ }
  return { decision: "allow" }
}

/** The environment a hook runs with: a few inherited variables, its own, and the event. */
export const stopHookEnvironment = (spec: StopHookSpec, cwd: string, base: NodeJS.ProcessEnv = process.env): Record<string, string> => {
  const inherited = Object.fromEntries(INHERITED_ENV.flatMap((name) => base[name] !== undefined ? [[name, base[name]!]] : []))
  return { ...inherited, ...spec.environment, CADCAMFUN_HOOK_EVENT: "stop", CADCAMFUN_PROJECT_DIR: cwd }
}

/** Reads a stream to text, keeping at most `OUTPUT_LIMIT` characters and draining the rest so the process never blocks. */
const readCapped = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const decoder = new TextDecoder()
  let text = ""
  for await (const chunk of stream) if (text.length < OUTPUT_LIMIT) text += decoder.decode(chunk, { stream: true })
  return text.slice(0, OUTPUT_LIMIT)
}

/** Runs one hook: argv spawned directly (no shell), killed at its timeout and when the fiber is interrupted. */
export const runStopHook = (spec: StopHookSpec, input: StopHookInput): Effect.Effect<StopHookOutcome> =>
  Effect.callback<StopHookOutcome>((resume) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (outcome: StopHookOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resume(Effect.succeed(outcome))
    }
    let proc: Bun.Subprocess<"pipe", "pipe", "pipe">
    try {
      proc = Bun.spawn({ cmd: [...spec.command], cwd: input.cwd, env: stopHookEnvironment(spec, input.cwd), stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    } catch (cause) {
      settle({ decision: "error", message: `could not start: ${cause instanceof Error ? cause.message : String(cause)}` })
      return
    }
    const timeoutMs = spec.timeoutMs ?? STOP_HOOK_TIMEOUT_MS
    timer = setTimeout(() => {
      proc.kill("SIGKILL")
      settle({ decision: "error", message: `timed out after ${timeoutMs} ms` })
    }, timeoutMs)
    // A hook that does not read its input closes the pipe early; that is not a failure of the hook.
    void Promise.resolve().then(async () => {
      proc.stdin.write(JSON.stringify({
        hook_event_name: "Stop",
        session_id: input.sessionId,
        cwd: input.cwd,
        stop_hook_active: input.stopHookActive,
        last_assistant_message: input.lastAssistantMessage,
        open_todos: input.openTodos
      }))
      await proc.stdin.end()
    }).catch(() => undefined)
    void Promise.all([readCapped(proc.stdout), readCapped(proc.stderr), proc.exited])
      .then(([stdout, stderr, code]) => settle(decideStop(code, stdout, stderr)))
      .catch((cause: unknown) => settle({ decision: "error", message: cause instanceof Error ? cause.message : String(cause) }))
    return Effect.sync(() => {
      clearTimeout(timer)
      if (!settled) proc.kill("SIGKILL")
    })
  })

/** Runs the hooks in file order; the first block wins and the rest do not run. A failing hook is logged and never blocks. */
export const runStopHooks = (hooks: ReadonlyArray<StopHookSpec>): StopHook => (input) =>
  Effect.gen(function* () {
    for (const spec of hooks) {
      const outcome = yield* runStopHook(spec, input)
      if (outcome.decision === "block") return outcome
      if (outcome.decision === "error") yield* Effect.logWarning(`Stop hook ${JSON.stringify(spec.command)} ${outcome.message}; the turn ends as done.`)
    }
    return { decision: "allow" } as const
  })
