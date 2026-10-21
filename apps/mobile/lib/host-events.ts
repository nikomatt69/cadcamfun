import type { LiveEvent } from "@cadcamfun/api"
import { CompanionError, type CompanionClient } from "./client"

/** Silence past this abandons the connection: the host beats every 15s, so two beats plus margin means a dead radio or a vanished desktop. */
export const HOST_STREAM_STALE_MS = 40_000

/** nikcli's host stream: one connection shared by all mounted screens, independent of prompt delivery. */
export function createHostEvents(client: CompanionClient) {
  const listeners = new Set<(event: LiveEvent) => void>()
  return {
    subscribe(listener: (event: LiveEvent) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() {
      const controller = new AbortController()
      void (async () => {
        let delay = 1000
        while (!controller.signal.aborted) {
          // One connection per attempt, so the watchdog can cut a silent socket without ending the loop.
          const connection = new AbortController()
          const abort = () => connection.abort()
          controller.signal.addEventListener("abort", abort, { once: true })
          let watchdog: ReturnType<typeof setTimeout> | undefined
          const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(abort, HOST_STREAM_STALE_MS) }
          try {
            arm()
            for await (const event of client.hostEvents(connection.signal)) {
              if (connection.signal.aborted) break
              arm()
              delay = 1000
              if (event.type === "server.heartbeat") continue
              for (const listener of [...listeners]) listener(event)
            }
          } catch (error) {
            if (error instanceof CompanionError && (error.status === 401 || error.status === 403)) return
          } finally {
            clearTimeout(watchdog)
            controller.signal.removeEventListener("abort", abort)
            connection.abort()
          }
          if (controller.signal.aborted) break
          await new Promise<void>((resolve) => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve() }
            const timer = setTimeout(finish, delay)
            controller.signal.addEventListener("abort", finish, { once: true })
            if (controller.signal.aborted) finish()
          })
          delay = Math.min(delay * 2, 30_000)
        }
      })()
      return () => controller.abort()
    },
  }
}

export type HostEvents = ReturnType<typeof createHostEvents>
