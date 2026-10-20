import { useCallback, useState } from "react"
import { useLiveEvents } from "./live-events"

/** Bumps on saved workspace changes and reconnection, including changes without a commit. */
export function useCommitRevision(projectId: string): number {
  const [revision, setRevision] = useState(0)
  useLiveEvents(
    projectId,
    useCallback((event) => {
      if (["commit", "workspace.changed", "pr.merged", "server.connected", "resources.changed"].includes(event.type)) setRevision((current) => current + 1)
    }, []),
  )
  return revision
}
