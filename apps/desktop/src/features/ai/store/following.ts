/**
 * A turn another device started, shown here while it happens.
 *
 * The sidecar journals every turn of a conversation, whoever started it (the phone's prompt, this window's own
 * stream), and the phone follows that journal like nikcli's session stream. This is the same follow for the desktop:
 * while the open conversation is idle, a turn the phone sends appears in the transcript as it is written, its tool
 * results reach the editor, its approvals and questions can be answered here, and the message box queues instead of
 * starting a second turn beside it.
 *
 * A turn this window started is never taken from the journal: its own stream already carries it. The follower only
 * acts while the window is idle, so the two never apply one event twice.
 */
import { batch, type Accessor, type Setter } from "solid-js"
import { followSessionEvents } from "../lib/stream.ts"
import { captureEditorOwner, type EditorOwner } from "../lib/editor-sync.ts"
import type { AppState } from "../../../shared/state/context.ts"
import type { AiActivity, AiEvent, AiMessage } from "../lib/types.ts"

type Status = "idle" | "connecting" | "streaming" | "error"

export interface SessionFollowerContext {
  readonly app: AppState
  readonly sessionId: Accessor<string | undefined>
  readonly status: Accessor<Status>
  readonly setStatus: Setter<Status>
  readonly error: Accessor<string | undefined>
  readonly setError: Setter<string | undefined>
  readonly setActivity: Setter<AiActivity>
  readonly setActiveAssistantId: Setter<string | undefined>
  readonly activeAssistantId: Accessor<string | undefined>
  readonly appendMessage: (message: AiMessage) => void
  readonly patchMessage: (id: string, patch: (prev: AiMessage) => AiMessage) => void
  readonly nextMessageId: () => string
  readonly apply: (event: AiEvent, owner: EditorOwner) => void
  readonly resetTurn: () => void
  /** Reads the host's copy of the conversation, which has the prompt the other device sent. */
  readonly refreshHistory: (id: string) => Promise<void>
  /** Ends the turn the way a stream of this window ends: status, queued messages, the conversation's title. */
  readonly finish: (next: "idle" | "error") => void
  readonly isDisposed: () => boolean
}

export interface SessionFollower {
  /** Follows `sessionId` (and stops following the previous one). Ids this window made up are not the host's yet. */
  readonly follow: (sessionId: string | undefined) => void
  /** Forgets the turn being shown, without stopping the follow: the person stopped it or left the conversation. */
  readonly release: () => void
  readonly stop: () => void
  /** Whether a turn another device started is being shown. */
  readonly active: () => boolean
}

/** Ids this window makes up before the host names the conversation start with this. */
const LOCAL_ID = /^s-/

export const createSessionFollower = (ctx: SessionFollowerContext): SessionFollower => {
  let controller: AbortController | undefined
  let followed: string | undefined
  let remote = false
  /** The turn was joined in the middle, or ended while the connection was down: the live view is not the whole story. */
  let partial = false
  let epoch = 0
  let chain: Promise<void> = Promise.resolve()

  // Frames are handled one at a time and in order: a turn begins with a read of the host's history.
  const enqueue = (work: () => Promise<void> | void): void => {
    const mine = epoch
    chain = chain.then(() => (mine === epoch && !ctx.isDisposed() ? work() : undefined)).catch(() => undefined)
  }

  const next = (): "idle" | "error" => ctx.error() !== undefined ? "error" : "idle"

  /**
   * `prompted`: the turn opened with the words that started it (a `user_message`), which the event applier turns into
   * the question and the answer's bubble, so nothing is read from the host. Without them the prompt is read back.
   */
  const begin = async (sid: string, joined: boolean, prompted: boolean): Promise<void> => {
    if (remote || ctx.status() !== "idle") return
    remote = true
    partial = joined
    if (!prompted) {
      // The prompt the other device sent is in the host's copy of the conversation, not in this window's.
      await ctx.refreshHistory(sid)
      // Someone started a turn here meanwhile, or left the conversation: that turn owns the window.
      if (!remote || ctx.isDisposed() || ctx.sessionId() !== sid || ctx.status() !== "idle") { remote = false; return }
    }
    ctx.resetTurn()
    batch(() => {
      if (!prompted) {
        const id = ctx.nextMessageId()
        ctx.appendMessage({ id, role: "assistant", text: "", createdAt: new Date().toISOString(), events: [], status: "streaming" })
        ctx.setActiveAssistantId(id)
      }
      ctx.setActivity({ step: 0, compacted: false })
      ctx.setError(undefined)
      ctx.setStatus("streaming")
    })
  }

  const end = async (sid: string): Promise<void> => {
    if (!remote) return
    remote = false
    const active = ctx.activeAssistantId()
    if (active !== undefined) ctx.patchMessage(active, (prev) => prev.status === "streaming" ? { ...prev, status: "done", finishedAt: new Date().toISOString() } : prev)
    ctx.finish(next())
    if (partial && ctx.sessionId() === sid) await ctx.refreshHistory(sid)
  }

  const onEvent = (event: AiEvent): void => enqueue(async () => {
    const sid = followed
    if (sid === undefined || ctx.sessionId() !== sid) return
    if (!remote) {
      // Only the start of a turn begins one; the tail of a turn this window ran itself is not one.
      if (event.type === "user_message") await begin(sid, false, true)
      else if (event.type === "turn" && event.phase === "start") await begin(sid, false, false)
      else return
    }
    if (!remote) return
    ctx.apply(event, captureEditorOwner())
    if (event.type === "done" || event.type === "error") await end(sid)
  })

  const onConnected = (busy: boolean): void => enqueue(async () => {
    const sid = followed
    if (sid === undefined || ctx.sessionId() !== sid) return
    if (busy && !remote) await begin(sid, true, false)
    else if (!busy && remote) { partial = true; await end(sid) }
  })

  const stop = (): void => {
    epoch += 1
    controller?.abort()
    controller = undefined
    followed = undefined
    remote = false
  }

  return {
    follow: (sessionId) => {
      if (sessionId === followed) return
      stop()
      if (sessionId === undefined || LOCAL_ID.test(sessionId) || ctx.isDisposed()) return
      const mine = new AbortController()
      controller = mine
      followed = sessionId
      void followSessionEvents(ctx.app.client, {
        sessionId,
        signal: mine.signal,
        onConnected: (frame) => onConnected(frame.busy),
        onEvent
      }).catch(() => undefined)
    },
    release: () => { remote = false },
    stop,
    active: () => remote
  }
}
