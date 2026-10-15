import { useCallback, useState } from "react"
import { useLiveEvents } from "./live-events"

/** Bumps when the desktop commits, so an open preview refetches the new mesh or toolpath. */
export function useCommitRevision(projectId: string): number {
  const [revision, setRevision] = useState(0)
  useLiveEvents(
    projectId,
    useCallback((event) => {
      if (event.type === "commit") setRevision((current) => current + 1)
    }, []),
  )
  return revision
}
