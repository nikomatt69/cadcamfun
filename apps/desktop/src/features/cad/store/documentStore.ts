/**
 * Which stored project and drawing the editor on screen belongs to (none until it is opened from a project,
 * saved, or the assistant needed one). The CAD page, the CAM page and the assistant all read this one place, so
 * they always talk about the same document.
 */
import { create } from "../../../shared/state/zustand.ts"

interface DocumentState {
  projectId: string | null
  drawingId: string | null
  name: string | null
  setDocument: (document: { projectId: string; drawingId: string; name?: string | null }) => void
  clear: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  projectId: null,
  drawingId: null,
  name: null,
  setDocument: ({ projectId, drawingId, name }) => set({ projectId, drawingId, name: name ?? null }),
  clear: () => set({ projectId: null, drawingId: null, name: null })
}))
