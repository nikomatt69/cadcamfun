/**
 * The account the assistant's tools act as. The desktop can run signed in (a session token selects the account of each request,
 * `http/authorization.ts`), while handlers are cached. Admission binds an authenticated session owner; each tool invocation
 * captures that owner in async-local storage, including existing child-session ownership. The compatibility cell is never
 * consulted by admitted host calls. Private owner files survive native session reattachment; unknown controls fail closed.
 *
 * Async-local storage is the nikcli edge only: the host calls tools as Promises, so the invocation is found there once
 * (`turn`) and from then on travels as the Effect context value `CurrentTurn`. Effect code reads the turn from its context,
 * and a cancelled turn is the typed failure `TurnCancelled`, never a throw.
 */
import type { SessionUser } from "@cadcamfun/api"
import { Context, Data, Effect, Layer } from "effect"
import { AsyncLocalStorage } from "node:async_hooks"
import { childAgent } from "@cadcamfun/ai"
import { createHash } from "node:crypto"
import { mkdir, open, readdir, unlink } from "node:fs/promises"
import { join } from "node:path"

interface SessionOwner {
  readonly projectId: string
  readonly userId: string
}

/** The chat turn a tool call belongs to. */
export interface Turn {
  /** The account the call acts as: the admitted session owner, else the last chat turn's, else the fallback (local profile). */
  readonly user: SessionUser
  /** The message that opened the turn, for the citation an AI commit carries. */
  readonly prompt?: string
  /** The drawing the admitted turn works on; undefined outside an admitted invocation or when the turn named none. */
  readonly drawingId?: string
  /** Aborts when the turn is cancelled. */
  readonly signal?: AbortSignal
  /** True inside an admitted invocation (a host tool call or a bridge call), false for the compatibility path. */
  readonly admitted: boolean
}

/** The turn of the running tool call, provided at the edge where a Promise call enters Effect. */
export class CurrentTurn extends Context.Service<CurrentTurn, Turn>()("cadcamfun/CurrentTurn") {}

/** The turn was cancelled; nothing after this point may change anything. */
export class TurnCancelled extends Data.TaggedError("TurnCancelled")<{ readonly message: string }> {
  constructor(message = "Tool execution cancelled before mutation.") {
    super({ message })
  }
}

/** A host call that no admitted session owns: refused, never run as someone else. */
export class TurnUnowned extends Data.TaggedError("TurnUnowned")<{ readonly message: string }> {
  constructor() {
    super({ message: "AI invocation has no authenticated session owner" })
  }
}

/** Fails with `TurnCancelled` once the current turn is cancelled: checked before every mutation. */
export const ensureTurnActive: Effect.Effect<void, TurnCancelled, CurrentTurn> = Effect.gen(function*() {
  const turn = yield* CurrentTurn
  if (turn.signal?.aborted === true) return yield* new TurnCancelled()
})

interface InvocationActor {
  readonly user: SessionUser
  readonly prompt?: string
  readonly signal?: AbortSignal
  /** The drawing the admitted turn works on (checked against the project before admission). */
  readonly drawingId?: string
}

export class ActingUser extends Context.Service<ActingUser, {
  /** Records the account of the chat turn that is starting, and the message that opened it. */
  readonly set: (user: SessionUser, prompt?: string) => void
  /** The account of the last chat turn, or `fallback` (the local profile) before any. */
  readonly get: (fallback: SessionUser) => SessionUser
  /** The message that opened the last chat turn, for the citation an AI commit carries. */
  readonly lastPrompt: () => string | undefined
  readonly configureDirectory: (directory: string) => void
  readonly owner: (sessionId: string) => Promise<SessionOwner | undefined>
  /** The top-level sessions `userId` owns in `projectId`, with when their owner record was written (epoch ms). */
  readonly sessions: (userId: string, projectId: string) => Promise<ReadonlyArray<{ readonly sessionId: string; readonly createdAt: number }>>
  readonly canControl: (sessionId: string, user: SessionUser, projectId?: string) => Promise<boolean>
  readonly forget: (sessionId: string) => Promise<void>
  /**
   * Admits a turn: the session's owner and project are fixed on first use; the drawing is the one this turn was admitted for
   * (each admitted turn names it again), and it is what every tool call of the turn, its Code Mode programs and its children
   * act on. Nothing outside the admission (another window's editor state) can change it.
   */
  readonly bind: (projectId: string, sessionId: string, user: SessionUser, prompt?: string, drawingId?: string) => Promise<boolean>
  /**
   * The turn of the running call, read from the invocation it runs in. Call it where a Promise call enters Effect and provide it
   * as `CurrentTurn`; Effect code never reads the async-local storage itself.
   */
  readonly turn: (fallback: SessionUser) => Turn
  /** Runs `execute` as the session's admitted owner. Rejects with `TurnUnowned` or `TurnCancelled` without running it. */
  readonly invoke: <A>(projectId: string, sessionId: string, execute: () => Promise<A>, signal?: AbortSignal) => Promise<A>
}>()("cadcamfun/ActingUser") {
  static readonly layer = Layer.sync(ActingUser, () => {
    let current: SessionUser | undefined
    let prompt: string | undefined
    const invocations = new AsyncLocalStorage<InvocationActor>()
    const sessions = new Map<string, { readonly projectId: string; readonly actor: InvocationActor }>()
    let directory: string | undefined
    const fileFor = (sessionId: string) => directory === undefined ? undefined : join(directory, `${createHash("sha256").update(sessionId).digest("hex")}.json`)
    const owner = async (sessionId: string): Promise<SessionOwner | undefined> => {
      const binding = sessions.get(sessionId) ?? [...sessions.entries()].find(([parent]) => childAgent(parent, sessionId) !== undefined)?.[1]
      if (binding) return { projectId: binding.projectId, userId: binding.actor.user.id }
      const file = fileFor(sessionId)
      if (file === undefined) return undefined
      const handle = await open(file, "r").catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
        throw error
      })
      if (!handle) return undefined
      try {
        if ((await handle.stat()).size > 4096) throw new Error("Invalid AI session owner file")
        const value: unknown = JSON.parse(await handle.readFile("utf8"))
        if (typeof value !== "object" || value === null || !("sessionId" in value) || value.sessionId !== sessionId || !("projectId" in value) || typeof value.projectId !== "string" || !("userId" in value) || typeof value.userId !== "string") throw new Error("Invalid AI session owner file")
        return { projectId: value.projectId, userId: value.userId }
      } finally { await handle.close() }
    }
    /** Owner files read per listing; a desktop with more conversations than this lists the most recent ones. */
    const MAX_LISTED_OWNERS = 2_000
    const sessionsOf = async (userId: string, projectId: string) => {
      if (directory === undefined) return []
      const names = await readdir(directory).catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [] as string[]
        throw error
      })
      const out: Array<{ sessionId: string; createdAt: number }> = []
      const files = names.filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
      const read = async (name: string) => {
        const handle = await open(join(directory!, name), "r").catch(() => undefined)
        if (!handle) return undefined
        try {
          const stat = await handle.stat()
          if (stat.size > 4096) return undefined
          const value: unknown = JSON.parse(await handle.readFile("utf8"))
          if (typeof value !== "object" || value === null || !("sessionId" in value) || typeof value.sessionId !== "string" || !("projectId" in value) || !("userId" in value)) return undefined
          // The file name is the hash of the session id: a record copied under another name is not trusted.
          if (`${createHash("sha256").update(value.sessionId).digest("hex")}.json` !== name) return undefined
          return value.userId === userId && value.projectId === projectId ? { sessionId: value.sessionId, createdAt: stat.mtimeMs } : undefined
        } catch {
          return undefined
        } finally { await handle.close() }
      }
      // A bounded number of open files at a time, however many conversations the desktop has.
      for (let index = 0; index < files.length; index += 64) {
        for (const entry of await Promise.all(files.slice(index, index + 64).map(read))) if (entry) out.push(entry)
      }
      out.sort((a, b) => b.createdAt - a.createdAt)
      return out.slice(0, MAX_LISTED_OWNERS)
    }
    return ActingUser.of({
      sessions: sessionsOf,
      configureDirectory: (path) => {
        if (directory !== undefined && directory !== path) throw new Error("AI owner directory cannot change")
        directory = path
      },
      owner,
      canControl: async (sessionId, user, projectId) => {
        const binding = await owner(sessionId)
        return binding !== undefined && binding.userId === user.id && (projectId === undefined || binding.projectId === projectId)
      },
      forget: async (sessionId) => {
        const file = fileFor(sessionId)
        if (file) await unlink(file).catch((error: unknown) => {
          if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error
        })
        sessions.delete(sessionId)
        for (const parent of sessions.keys()) if (childAgent(sessionId, parent) !== undefined) sessions.delete(parent)
      },
      set: (user, message) => { current = user; prompt = message },
      get: (fallback) => invocations.getStore()?.user ?? current ?? fallback,
      lastPrompt: () => {
        const invocation = invocations.getStore()
        return invocation ? invocation.prompt : prompt
      },
      bind: async (projectId, sessionId, user, message, drawingId) => {
        const previous = await owner(sessionId)
        if (previous && (previous.projectId !== projectId || previous.userId !== user.id)) return false
        const file = fileFor(sessionId)
        if (file && directory && !previous) {
          await mkdir(directory, { recursive: true, mode: 0o700 })
          const handle = await open(file, "wx", 0o600).catch((error: unknown) => {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") return undefined
            throw error
          })
          if (handle) {
            try { await handle.writeFile(JSON.stringify({ sessionId, projectId, userId: user.id })); await handle.sync() }
            finally { await handle.close() }
          } else {
            const stored = await owner(sessionId)
            if (!stored || stored.projectId !== projectId || stored.userId !== user.id) return false
          }
        }
        const active = sessions.get(sessionId)
        if (active && (active.projectId !== projectId || active.actor.user.id !== user.id)) return false
        sessions.set(sessionId, { projectId, actor: Object.freeze({ user: Object.freeze({ ...user }), ...(message !== undefined ? { prompt: message } : {}), ...(drawingId !== undefined ? { drawingId } : {}) }) })
        return true
      },
      turn: (fallback) => {
        const invocation = invocations.getStore()
        const turnPrompt = invocation ? invocation.prompt : prompt
        return Object.freeze({
          user: invocation?.user ?? current ?? fallback,
          ...(turnPrompt !== undefined ? { prompt: turnPrompt } : {}),
          ...(invocation?.drawingId !== undefined ? { drawingId: invocation.drawingId } : {}),
          ...(invocation?.signal !== undefined ? { signal: invocation.signal } : {}),
          admitted: invocation !== undefined
        })
      },
      invoke: (projectId, sessionId, execute, signal) => {
        const owner = sessions.get(sessionId) ?? [...sessions.entries()].find(([parent, binding]) => binding.projectId === projectId && childAgent(parent, sessionId) !== undefined)?.[1]
        if (!owner || owner.projectId !== projectId) return Promise.reject(new TurnUnowned())
        if (signal?.aborted) return Promise.reject(new TurnCancelled("Tool execution cancelled."))
        return invocations.run(Object.freeze({ ...owner.actor, ...(signal ? { signal } : {}) }), execute)
      }
    })
  })
}
