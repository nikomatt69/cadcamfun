/**
 * A live tail of one project's activity, exposed as a Solid store.
 *
 * Why a composable instead of a plain `fetch` in each screen: the SSE connection is expensive
 * (a TLS stream through the companion gateway) and there must be exactly one per project, shared
 * by the tab bar badge, the Pulls list and the Actions list. `useLiveEvents` owns the lifetime —
 * it opens the stream when the owning screen mounts, closes it on unmount, and reconnects with a
 * capped backoff when the desktop drops the connection.
 *
 * The desktop's iOS webview suspends sockets in the background, so a reconnect is the normal case
 * rather than an error path: the buffer keeps the last few events so the UI never goes blank.
 */
import { createSignal, onCleanup, type Accessor } from "solid-js"
import type { LiveEvent } from "@cadcamfun/api"
import type { CompanionClient } from "../companion/client.ts"

/** How many events are kept for the screens to render from. */
export const LIVE_EVENT_BUFFER = 50

/** Reconnect delays, doubling up to `max`. A phone on wifi will usually succeed on the first try. */
const BACKOFF_MS = [500, 1000, 2000, 5000, 10000] as const

export type ConnectionState = "connecting" | "live" | "offline"

export interface LiveEventsHandle {
  /** Newest first, capped at `LIVE_EVENT_BUFFER`. */
  readonly events: Accessor<ReadonlyArray<LiveEvent>>
  readonly state: Accessor<ConnectionState>
  /** The events the desktop has not been asked about yet, so a screen can refetch exactly once. */
  readonly takePending: () => ReadonlyArray<LiveEvent>
}

export const useLiveEvents = (client: CompanionClient, projectId: Accessor<string>): LiveEventsHandle => {
  const [events, setEvents] = createSignal<ReadonlyArray<LiveEvent>>([])
  const [state, setState] = createSignal<ConnectionState>("connecting")
  let pending: ReadonlyArray<LiveEvent> = []
  let controller: AbortController | undefined
  let attempt = 0
  let stopped = false

  const push = (event: LiveEvent) => {
    setEvents((current) => [event, ...current].slice(0, LIVE_EVENT_BUFFER))
    pending = [...pending, event]
  }

  const run = async () => {
    while (!stopped) {
      controller = new AbortController()
      setState("connecting")
      try {
        for await (const event of client.events(projectId(), controller.signal)) {
          if (stopped) break
          attempt = 0
          setState("live")
          push(event)
        }
        // A clean end of stream (the desktop restarted, or it closed an idle connection) is not
        // an error: reconnect immediately rather than making the user wait out a backoff.
        attempt = 0
      } catch (err) {
        if (stopped || (err as { name?: string })?.name === "AbortError") break
        setState("offline")
      }
      if (stopped) break
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]))
    }
    if (!stopped) setState("offline")
  }
  void run()

  onCleanup(() => {
    stopped = true
    controller?.abort()
  })

  return { events, state, takePending: () => { const taken = pending; pending = []; return taken } }
}
