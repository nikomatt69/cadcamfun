import { Effect } from "effect"
import type { CadDocument } from "./document"
import { apply, type Command } from "./command"

/** Undo/redo history over immutable documents. Structural sharing keeps snapshots cheap. */
export interface History {
  readonly past: ReadonlyArray<CadDocument>
  readonly present: CadDocument
  readonly future: ReadonlyArray<CadDocument>
  readonly limit: number
}

export const make = (present: CadDocument, limit = 200): History => ({ past: [], present, future: [], limit })

export const execute = (history: History, cmd: Command) =>
  apply(history.present, cmd).pipe(
    Effect.map(
      (next): History => ({
        ...history,
        past: [...history.past, history.present].slice(-history.limit),
        present: next,
        future: [],
      }),
    ),
  )

export const canUndo = (h: History): boolean => h.past.length > 0
export const canRedo = (h: History): boolean => h.future.length > 0

export const undo = (h: History): History => {
  if (h.past.length === 0) return h
  const previous = h.past[h.past.length - 1]!
  return { ...h, past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] }
}

export const redo = (h: History): History => {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { ...h, past: [...h.past, h.present], present: next!, future: rest }
}

/** Record an externally produced document (e.g. from the AI agent) as one undoable step. */
export const commit = (h: History, next: CadDocument): History =>
  next === h.present ? h : { ...h, past: [...h.past, h.present].slice(-h.limit), present: next, future: [] }
