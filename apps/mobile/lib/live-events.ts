import { useEffect, useRef } from "react"
import type { LiveEvent } from "@cadcamfun/api"
import { useServer } from "./server"

/** Project subscribers share the provider's host connection and reload after each reconnect greeting. */
export function useLiveEvents(projectId: string, onEvent: (event: LiveEvent) => void) {
  const { hostEvents } = useServer()
  const handler = useRef(onEvent)
  handler.current = onEvent
  useEffect(() => hostEvents?.subscribe((event) => {
    if (!("projectId" in event) || event.projectId === projectId) handler.current(event)
  }), [hostEvents, projectId])
}
