/**
 * Undo/redo history (spec 06-desktop-ui.md §1): a bounded command stack over a
 * `Drawing`.
 *
 * The stack stores **snapshots**, not inverses: `undo` walks the document
 * backwards through recorded states, so an inverse never has to be derived from
 * an entity that has since changed. The stack is capped at 200 steps (spec §1);
 * dropping the oldest steps never corrupts the chain, because the base document
 * is always `snapshots[0]`.
 */
import type { Drawing } from "@cadcamfun/core"
import type { Command } from "./commands.ts"

/** Maximum recorded steps; older ones are discarded, the base state is kept. */
export const MAX_HISTORY = 200

export interface HistoryState {
  /** The document as it is right now. */
  readonly present: Drawing
  /** Labels of the applied commands, oldest first. */
  readonly done: ReadonlyArray<string>
  /** Labels of the undone commands, newest first. */
  readonly undone: ReadonlyArray<string>
  /** Steps dropped because the cap was reached. */
  readonly dropped: number
}

export interface History {
  readonly state: HistoryState
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** Applies a command and clears the redo stack. */
  apply(command: Command): History
  /** Steps back one command; a no-op when nothing was applied. */
  undo(): History
  /** Re-applies the last undone command. */
  redo(): History
  /** Jumps to a recorded index; 0 is the document the editor opened. */
  goto(index: number): History
  /** Forgets everything, keeping the current document as the new base. */
  reset(drawing?: Drawing): History
}

interface Store {
  readonly labels: ReadonlyArray<string>
  /** `snapshots[0]` is the base document; `snapshots[i]` follows `labels[i - 1]`. */
  readonly snapshots: ReadonlyArray<Drawing>
  readonly dropped: number
}

/** Starts a history from the document the editor opened. */
export const createHistory = (drawing: Drawing, limit = MAX_HISTORY): History => {
  const cap = Math.max(1, Math.floor(limit))

  const build = (index: number, store: Store): History => {
    const present = store.snapshots[index] ?? drawing
    const undone = store.labels.slice(index).reverse()
    const view = (i: number): History =>
      build(
        Math.min(Math.max(0, i), store.labels.length),
        store
      )
    return {
      state: {
        present,
        done: store.labels.slice(0, index),
        undone,
        dropped: store.dropped
      },
      canUndo: index > 0,
      canRedo: undone.length > 0,
      apply: (command) => {
        // A new edit invalidates the redo branch.
        const labels = [...store.labels.slice(0, index), command.label]
        let snapshots = [...store.snapshots.slice(0, index + 1), command.apply(present)]
        let dropped = store.dropped
        while (labels.length > cap) {
          labels.shift()
          snapshots.shift()
          dropped += 1
        }
        return build(labels.length, { labels, snapshots, dropped })
      },
      undo: () => view(index - 1),
      redo: () => view(index + 1),
      goto: (target) => view(target),
      reset: (next) =>
        next === undefined
          ? build(0, { labels: [], snapshots: [present], dropped: 0 })
          : build(0, { labels: [], snapshots: [next], dropped: 0 })
    }
  }

  return build(0, { labels: [], snapshots: [drawing], dropped: 0 })
}
