import { useEffect, useRef } from "react"
import type { LiveEvent } from "@cadcamfun/api"
import { CompanionError } from "./client"
import { useServer } from "./server"

/**
 * The single SSE subscription for a project: frames arrive, the screen bumps the matching
 * panel's refresh key. On a dropped connection the stream reconnects after a short pause
 * (no exponential storm), and the subscription dies with the screen — a phone sitting on the
 * project list holds no open TLS stream.
 */
export function useLiveEvents(projectId: string, onEvent: (event: LiveEvent) => void) {
  const { client, connectivity } = useServer()
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!client || connectivity !== "online") return
    let active = true
    const controller = new AbortController()

    void (async () => {
      let delay = 2500
      while (active) {
        try {
          for await (const event of client.events(projectId, controller.signal)) {
            if (active) { delay = 2500; handler.current(event) }
          }
        } catch (error) {
          if (error instanceof CompanionError && (error.status === 401 || error.status === 403)) return
          // The gateway restarted or the network hiccuped — pause, then re-subscribe.
        }
        if (!active) break
        await new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve() }
          const timer = setTimeout(finish, delay)
          controller.signal.addEventListener("abort", finish, { once: true })
          if (controller.signal.aborted) finish()
        })
        delay = Math.min(delay * 2, 30000)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [client, projectId, connectivity])
}
