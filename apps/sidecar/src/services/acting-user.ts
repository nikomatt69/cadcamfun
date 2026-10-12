/**
 * The account the assistant's tools act as. The desktop can run signed in (a session token selects the account of each request,
 * `http/authorization.ts`), while handlers are cached. Admission binds an authenticated session owner; each tool invocation
 * captures that owner in async-local storage, including existing child-session ownership. The compatibility cell is never
 * consulted by admitted host calls. Private owner files survive native session reattachment; unknown controls fail closed.
 */
import type { SessionUser } from "@cadcamfun/api"
import { Context, Layer } from "effect"
import { AsyncLocalStorage } from "node:async_hooks"
import { childAgent } from "@cadcamfun/ai"
import { createHash } from "node:crypto"
import { mkdir, open, unlink } from "node:fs/promises"
import { join } from "node:path"

interface SessionOwner {
  readonly projectId: string
  readonly userId: string
}

interface InvocationActor {
  readonly user: SessionUser
  readonly prompt?: string
  readonly signal?: AbortSignal
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
  readonly canControl: (sessionId: string, user: SessionUser, projectId?: string) => Promise<boolean>
  readonly forget: (sessionId: string) => Promise<void>
  readonly bind: (projectId: string, sessionId: string, user: SessionUser, prompt?: string) => Promise<boolean>
  readonly invoke: <A>(projectId: string, sessionId: string, execute: () => Promise<A>, signal?: AbortSignal) => Promise<A>
  readonly assertActive: () => void
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
    return ActingUser.of({
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
      bind: async (projectId, sessionId, user, message) => {
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
        sessions.set(sessionId, { projectId, actor: Object.freeze({ user: Object.freeze({ ...user }), ...(message !== undefined ? { prompt: message } : {}) }) })
        return true
      },
      assertActive: () => {
        if (invocations.getStore()?.signal?.aborted) throw new Error("Tool execution cancelled before mutation.")
      },
      invoke: (projectId, sessionId, execute, signal) => {
        const owner = sessions.get(sessionId) ?? [...sessions.entries()].find(([parent, binding]) => binding.projectId === projectId && childAgent(parent, sessionId) !== undefined)?.[1]
        if (!owner || owner.projectId !== projectId) return Promise.reject(new Error("AI invocation has no authenticated session owner"))
        if (signal?.aborted) return Promise.reject(new Error("Tool execution cancelled."))
        return invocations.run(Object.freeze({ ...owner.actor, ...(signal ? { signal } : {}) }), execute)
      }
    })
  })
}
