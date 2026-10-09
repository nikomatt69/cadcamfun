/**
 * The account the assistant's tools act as. The desktop can run signed in (a session token selects the account of each request,
 * `http/authorization.ts`), while the tool handlers are built once; a chat turn records its caller here, so the assistant reads and
 * writes the projects, drawings and operations the UI shows that same account, not the ones of the local profile. One cell per
 * sidecar instance (it lives in the layer), so two instances in one process never see each other's account.
 */
import type { SessionUser } from "@cadcamfun/api"
import { Context, Layer } from "effect"

export class ActingUser extends Context.Service<ActingUser, {
  /** Records the account of the chat turn that is starting. */
  readonly set: (user: SessionUser) => void
  /** The account of the last chat turn, or `fallback` (the local profile) before any. */
  readonly get: (fallback: SessionUser) => SessionUser
}>()("cadcamfun/ActingUser") {
  static readonly layer = Layer.sync(ActingUser, () => {
    let current: SessionUser | undefined
    return ActingUser.of({ set: (user) => { current = user }, get: (fallback) => current ?? fallback })
  })
}
