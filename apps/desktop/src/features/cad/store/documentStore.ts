/**
 * Which stored project and drawing the editor on screen belongs to (none until it is opened from a project,
 * saved, or the assistant needed one). The CAD page, the CAM page and the assistant all read this one place, so
 * they always talk about the same document.
 */
import type { drawing } from "@cadcamfun/core"
import { create } from "../../../shared/state/zustand.ts"

interface DocumentState {
  projectId: string | null
  drawingId: string | null
  name: string | null
  /** The title block the drawing is stored with: only what was written, the rest is completed when it is shown or saved. */
  titleBlock: drawing.TitleBlock
  /** The person at the keyboard and their company, to sign the title block with until someone writes other names. */
  author: string
  organization: string
  setTitleBlock: (block: drawing.TitleBlock) => void
  setIdentity: (author: string, organization: string) => void
  setDocument: (document: { projectId: string; drawingId: string; name?: string | null }) => void
  clear: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  projectId: null,
  drawingId: null,
  name: null,
  titleBlock: {},
  author: "",
  organization: "",
  setTitleBlock: (titleBlock) => set({ titleBlock }),
  setIdentity: (author, organization) => set({ author, organization }),
  setDocument: ({ projectId, drawingId, name }) => set({ projectId, drawingId, name: name ?? null }),
  clear: () => set({ projectId: null, drawingId: null, name: null, titleBlock: {} })
}))
