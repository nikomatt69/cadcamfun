/**
 * The account the assistant's tools act as. The desktop can run signed in (a session token selects the account of each request,
 * `http/authorization.ts`), while handlers are cached. Admission binds an authenticated session owner; each tool invocation
 * captures that owner in async-local storage, including existing child-session ownership. The compatibility cell is never
 * consulted by admitted host calls. Durable session/control ownership remains a separate lifecycle contract.
 */
import type { SessionUser } from "@cadcamfun/api"
import { Context, Layer } from "effect"
import { AsyncLocalStorage } from "node:async_hooks"
import { childAgent } from "@cadcamfun/ai"

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
  readonly bind: (projectId: string, sessionId: string, user: SessionUser, prompt?: string) => boolean
  readonly invoke: <A>(projectId: string, sessionId: string, execute: () => Promise<A>, signal?: AbortSignal) => Promise<A>
  readonly assertActive: () => void
}>()("cadcamfun/ActingUser") {
  static readonly layer = Layer.sync(ActingUser, () => {
    let current: SessionUser | undefined
    let prompt: string | undefined
    const invocations = new AsyncLocalStorage<InvocationActor>()
    const sessions = new Map<string, { readonly projectId: string; readonly actor: InvocationActor }>()
    return ActingUser.of({
      set: (user, message) => { current = user; prompt = message },
      get: (fallback) => invocations.getStore()?.user ?? current ?? fallback,
      lastPrompt: () => {
        const invocation = invocations.getStore()
        return invocation ? invocation.prompt : prompt
      },
      bind: (projectId, sessionId, user, message) => {
        const previous = sessions.get(sessionId)
        if (previous && (previous.projectId !== projectId || previous.actor.user.id !== user.id)) return false
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
