import type { AppState } from "../shared/state/context.ts"
import { projectSession } from "../features/projects/lib/project-session.ts"
import { useCamStore } from "../features/cam/store/camStore.ts"
import { useVerifyStore } from "../features/cam/store/verifyStore.ts"

/** Preserve the old saved resource before opening an external program as a new, unsaved editor buffer. */
export const openProgramInEditor = async (app: AppState, text: string, current: () => boolean = () => true): Promise<void> => {
  const session = projectSession(app)
  const before = useCamStore.getState().gcode
  // Compare current content even before the autosave debounce marks the session dirty.
  await session.saveAll("flush")
  if (!current() || session.hasUnsavedWork() || useCamStore.getState().gcode !== before) throw new Error("The current work could not be saved before opening the program")
  const store = useCamStore.getState()
  // Detach first: changing the text must never autosave into the previously opened resource.
  store.setSavedProgram(undefined)
  store.clearOperationResults()
  store.setKernelArtifact(undefined)
  store.setKernelRequest(undefined)
  store.setKernelProgress(undefined)
  store.setPlaying(false)
  useVerifyStore.getState().reset()
  store.setGcode(text)
  store.setActiveTab("editor")
}
