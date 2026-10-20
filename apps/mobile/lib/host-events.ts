import type { LiveEvent } from "@cadcamfun/api"
import { CompanionError, type CompanionClient } from "./client"

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
          try {
            for await (const event of client.hostEvents(controller.signal)) {
              if (controller.signal.aborted) break
              delay = 1000
              for (const listener of [...listeners]) listener(event)
            }
          } catch (error) {
            if (error instanceof CompanionError && (error.status === 401 || error.status === 403)) return
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
