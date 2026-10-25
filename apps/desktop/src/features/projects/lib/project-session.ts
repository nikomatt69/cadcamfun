/**
 * The open project's save state: the drawing the CAD editor holds and the CAM program the CAM workspace holds, and how each
 * reaches the stored project (spec 03 §2).
 *
 * A project resource is saved by exactly one path, whether the user pressed Save, the interval elapsed, or the window went to the
 * background: `session.document.saveNow()` for the drawing and `session.program.saveNow()` for the program, both over the same
 * scheduling engine (`shared/state/autosave.ts`). This module is the binding between that engine and the editors' stores.
 *
 *  - The drawing is saved with the revision of the stored copy the editor last saw. If the assistant, the phone or another
 *    window saved in between, the sidecar refuses (409), the editor merges what was stored into the open drawing, and the save
 *    is retried; nothing is ever overwritten blind.
 *  - A drawing that is not in a project yet cannot be autosaved; it is kept as a recovery draft on this computer instead.
 *  - A CAM program is autosaved only when it was saved before (it has a stored row to update), and never replaces a program
 *    that changed elsewhere or the post-processed text the user saved from the Post tab.
 */
import { createEffect, createSignal, type Accessor } from "solid-js"
import type { AppState } from "../../../shared/state/context.ts"
import { createAutosave, type Autosave, type SaveReason, type SaveState } from "../../../shared/state/autosave.ts"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { drawingPayload, payloadRevision, syncProjectContents } from "../../cad/lib/projectSnapshot.ts"
import { isSaveConflict, noteStoredRevision, storedRevisionOf } from "../../cad/lib/stored-revision.ts"
import { clearDraft, writeDraft } from "../../cad/lib/draft.ts"
import { captureEditorOwner, reconcileFromStored, rememberPushed } from "../../ai/lib/editor-sync.ts"
import { toJsonSafe } from "../../../shared/state/json-safe.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useLayerStore } from "../../cad/store/layerStore.ts"
import { useLocalComponentsLibraryStore } from "../../cad/store/localComponentsLibraryStore.ts"
import { useCamStore } from "../../cam/store/camStore.ts"
import { useGeneratorStore } from "../../cam/store/generatorStore.ts"
import { camEditorRevision, updateSavedProgram } from "../../cam/lib/saved-program.ts"
import { closeGuard } from "./window-guard.ts"

type Run = <A>(effect: unknown) => Promise<A>

/** The drawing keeps being saved by someone else faster than the editor can merge it: the user decides. */
export class DocumentConflict extends Error {
  readonly retryable = false
  constructor() {
    super(t("save.documentConflict"))
    this.name = "DocumentConflict"
  }
}

/** Attempts to merge a concurrent save and write again before giving up. */
const MERGE_ATTEMPTS = 3

export interface SaveSummary {
  readonly state: SaveState
  /** Something to show: a stored drawing or program, or scratch work that has not been saved yet. */
  readonly active: boolean
  readonly savedAt: number | undefined
  readonly error: string | undefined
  /** Dirty work that has no project to go to (kept as a recovery draft). */
  readonly scratch: boolean
}

export interface SaveOutcome {
  readonly document: "none" | "clean" | "saved" | "no-destination"
  readonly program: "none" | "clean" | "saved"
  /** New library components the drawing save added to the project. */
  readonly components: number
}

export interface ProjectSession {
  readonly document: Autosave
  readonly program: Autosave
  readonly summary: Accessor<SaveSummary>
  /** Saveable work (a stored drawing or program) that has changes not yet written. */
  hasUnsavedWork(): boolean
  /** Saves the drawing, then the program, whatever is dirty. Rejects with the first failure after trying both. */
  saveAll(reason?: SaveReason): Promise<SaveOutcome>
  /** The user-facing save: `saveAll("manual")` plus the toast that says what happened. Resolves with the outcome, undefined on failure. */
  saveInteractive(): Promise<SaveOutcome | undefined>
  /** Best-effort save of everything dirty, for a window that is going away. */
  flush(): Promise<void>
  /** Wires the stores, the settings and the window; returns what undoes it. Call inside a component. */
  start(): () => void
}

const sameRefs = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean => a.length === b.length && a.every((value, index) => value === b[index])

/** Memoises a revision on the identity of the inputs it is computed from; the hash is only recomputed when one of them changed. */
const cachedRevision = (inputs: () => ReadonlyArray<unknown>, compute: () => string): (() => string) => {
  let last: ReadonlyArray<unknown> | undefined
  let value = ""
  return () => {
    const now = inputs()
    if (last === undefined || !sameRefs(last, now)) { value = compute(); last = now }
    return value
  }
}

const sessions = new WeakMap<AppState, ProjectSession>()

const createProjectSession = (app: AppState): ProjectSession => {
  const run = app.runtime.run as unknown as Run
  const intervalMs = (): number => app.settings.settings().autosaveMinutes * 60_000
  const enabled = (): boolean => app.settings.settings().autosave
  const savedProgram = () => useCamStore.getState().savedProgram
  const hasDocument = (): boolean => { const { projectId, drawingId } = useDocumentStore.getState(); return projectId !== null && drawingId !== null }
  const [documentActive, setDocumentActive] = createSignal(hasDocument())
  const [programActive, setProgramActive] = createSignal(savedProgram() !== undefined)
  const [scratch, setScratch] = createSignal(false)
  let librarySynced = useLocalComponentsLibraryStore.getState().components.length
  let lastComponents = 0

  /** What the title block is made of: what was written, and the name, author and company it is completed from. */
  const titleBlockInputs = (): ReadonlyArray<unknown> => { const doc = useDocumentStore.getState(); return [doc.titleBlock, doc.name, doc.author, doc.organization] }
  /** The stored content plus the library components a save would add: a new component is an unsaved change too. */
  const revisionOf = (payload: Record<string, unknown>): string => `${payloadRevision(payload)}|${useLocalComponentsLibraryStore.getState().components.length}`
  const documentRevision = cachedRevision(
    () => {
      const settings = app.settings.settings(), cad = useCADStore.getState()
      return [useElementsStore.getState().elements, useLayerStore.getState().layers, settings.units, settings.tolerance, settings.decimals, cad.workpiece, cad.originOffset, cad.selectedMachine, useDocumentStore.getState().drawingId, ...titleBlockInputs(), useLocalComponentsLibraryStore.getState().components]
    },
    () => revisionOf(drawingPayload(app))
  )
  const revisionOfDocument = (): string => useDocumentStore.getState().drawingId === null && useElementsStore.getState().elements.length === 0 ? "" : documentRevision()

  const document = createAutosave({
    revision: revisionOfDocument,
    enabled,
    intervalMs,
    canSave: hasDocument,
    save: async (reason) => {
      const { projectId, drawingId } = useDocumentStore.getState()
      if (projectId === null || drawingId === null) throw Object.assign(new Error(t("save.noDestination")), { retryable: false })
      const owner = captureEditorOwner()
      // The library components are written by a manual save and whenever the library grew; an unattended save leaves them alone.
      const components = reason === "manual" || useLocalComponentsLibraryStore.getState().components.length !== librarySynced
      for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
        let base = storedRevisionOf(drawingId)
        if (base === undefined || attempt > 0) {
          // Learn the stored copy (and merge what others wrote into the open drawing) before writing over it.
          await reconcileFromStored(app, owner)
          base = storedRevisionOf(drawingId)
        }
        if (!owner.current()) throw Object.assign(new Error(t("save.documentChanged")), { retryable: false })
        const payload = drawingPayload(app)
        const revision = revisionOf(payload)
        try {
          const written = await syncProjectContents(app, projectId, drawingId, run, { components, baseUpdatedAt: base, payload })
          noteStoredRevision(drawingId, written.updatedAt)
          rememberPushed(useElementsStore.getState().elements as unknown as ReadonlyArray<Record<string, unknown>>, drawingId)
          if (components) librarySynced = useLocalComponentsLibraryStore.getState().components.length
          lastComponents = written.componentIds.length
          return revision
        } catch (cause) {
          if (!isSaveConflict(cause)) throw cause
        }
      }
      throw new DocumentConflict()
    }
  })

  const programRevision = cachedRevision(
    () => {
      const store = useCamStore.getState(), generator = useGeneratorStore.getState()
      return [store.gcode, store.operationResults, store.kernelArtifact, store.kernelRequest, generator.settings, generator.printer, useCADStore.getState().workpiece]
    },
    camEditorRevision
  )
  const program = createAutosave({
    revision: programRevision,
    enabled,
    intervalMs,
    canSave: () => { const saved = savedProgram(); return saved !== undefined && saved.postProcessed !== true },
    save: (reason) => updateSavedProgram(app, { auto: reason !== "manual" })
  })

  const summary = (): SaveSummary => {
    const parts = [documentActive() ? document : undefined, programActive() ? program : undefined].filter((part): part is Autosave => part !== undefined)
    const order: ReadonlyArray<SaveState> = ["error", "saving", "dirty", "clean"]
    const state = parts.length === 0 ? (scratch() ? "dirty" : "clean") : order.find((candidate) => parts.some((part) => part.state() === candidate)) ?? "clean"
    const times = parts.map((part) => part.savedAt()).filter((time): time is number => time !== undefined)
    return {
      state: state === "clean" && scratch() ? "dirty" : state,
      active: parts.length > 0 || scratch(),
      savedAt: times.length > 0 ? Math.min(...times) : undefined,
      error: parts.map((part) => part.error()).find((message) => message !== undefined),
      scratch: scratch() && parts.length === 0
    }
  }

  const hasUnsavedWork = (): boolean =>
    (documentActive() && document.state() !== "clean") || (programActive() && program.state() !== "clean")

  const saveAll = async (reason: SaveReason = "manual"): Promise<SaveOutcome> => {
    const failures: unknown[] = []
    let documentOutcome: SaveOutcome["document"] = "none"
    let programOutcome: SaveOutcome["program"] = "none"
    lastComponents = 0
    if (hasDocument()) {
      const before = document.savedAt()
      try { await document.saveNow(reason); documentOutcome = document.savedAt() !== before ? "saved" : "clean" } catch (cause) { failures.push(cause) }
    } else if (useElementsStore.getState().elements.length > 0) documentOutcome = "no-destination"
    if (savedProgram() !== undefined && (reason === "manual" ? true : savedProgram()?.postProcessed !== true)) {
      const before = program.savedAt()
      try { await program.saveNow(reason); programOutcome = program.savedAt() !== before ? "saved" : "clean" } catch (cause) { failures.push(cause) }
    }
    if (failures.length > 0) throw failures[0]
    return { document: documentOutcome, program: programOutcome, components: lastComponents }
  }

  const saveInteractive = async (): Promise<SaveOutcome | undefined> => {
    try {
      const outcome = await saveAll("manual")
      const name = useDocumentStore.getState().name ?? savedProgram()?.name ?? ""
      if (outcome.document === "saved" || outcome.program === "saved") {
        toast.success(outcome.components > 0 ? t("save.toast.savedComponents", { name, count: outcome.components })
          : outcome.document === "saved" ? t("save.toast.saved", { name }) : t("save.toast.savedProgram"))
      } else if (outcome.document !== "no-destination") toast.success(t("save.toast.nothingToSave"))
      return outcome
    } catch (cause) {
      toast.error(t("save.toast.failed", { message: cause instanceof Error ? cause.message : String(cause) }))
      return undefined
    }
  }

  const flush = async (): Promise<void> => {
    const pending: Array<Promise<void>> = []
    if (documentActive() && document.state() !== "clean") pending.push(document.saveNow("flush"))
    if (programActive() && program.state() !== "clean" && savedProgram()?.postProcessed !== true) pending.push(program.saveNow("flush"))
    const results = await Promise.allSettled(pending)
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
    if (failed) throw failed.reason
  }

  const start = (): (() => void) => {
    const stops: Array<() => void> = []
    const retarget = (): void => {
      setDocumentActive(hasDocument())
      if (hasDocument()) {
        clearDraft()
        setScratch(false)
        void document.baseline()
      } else void document.baseline("").then(() => setScratch(useElementsStore.getState().elements.length > 0))
    }
    retarget()
    stops.push(useDocumentStore.subscribe((state, previous) => {
      if (state.projectId !== previous.projectId || state.drawingId !== previous.drawingId) retarget()
    }))

    // Anything that changes what would be stored asks the engine to compare again (debounced there).
    const touchDocument = (): void => {
      void document.touch()
      if (!hasDocument()) setScratch(useElementsStore.getState().elements.length > 0)
      scheduleDraft()
    }
    let draftTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleDraft = (): void => {
      if (draftTimer !== undefined) clearTimeout(draftTimer)
      draftTimer = setTimeout(() => {
        draftTimer = undefined
        if (hasDocument()) return
        const { elements } = useElementsStore.getState()
        writeDraft({ elements: toJsonSafe(elements) as never, layers: toJsonSafe(useLayerStore.getState().layers) as never })
        setScratch(elements.length > 0)
      }, 1_200)
    }
    stops.push(() => { if (draftTimer !== undefined) clearTimeout(draftTimer) })
    stops.push(useElementsStore.subscribe((state) => state.elements, touchDocument))
    stops.push(useDocumentStore.subscribe((state) => state.titleBlock, () => { void document.touch() }))
    stops.push(useLayerStore.subscribe((state) => state.layers, touchDocument))
    stops.push(useCADStore.subscribe((state) => [state.workpiece, state.originOffset, state.selectedMachine] as const, () => { void document.touch(); void program.touch() }, { equalityFn: sameRefs }))
    stops.push(useLocalComponentsLibraryStore.subscribe((state) => state.components, () => { void document.touch() }))
    stops.push(useCamStore.subscribe((state) => [state.gcode, state.operationResults, state.kernelArtifact, state.kernelRequest] as const, () => { void program.touch() }, { equalityFn: sameRefs }))
    stops.push(useGeneratorStore.subscribe((state) => [state.settings, state.printer] as const, () => { void program.touch() }, { equalityFn: sameRefs }))

    // A program becomes saveable when it is saved or opened; the stored copy is then the baseline.
    const retargetProgram = (): void => {
      const saved = savedProgram()
      setProgramActive(saved !== undefined)
      if (saved) void program.baseline(saved.editorRevision)
    }
    retargetProgram()
    stops.push(useCamStore.subscribe((state) => state.savedProgram, retargetProgram))

    // The settings are signals: a changed interval or the switch re-arms the timers.
    createEffect(() => {
      enabled(); intervalMs()
      document.reschedule(); program.reschedule()
      void document.touch(); void program.touch()
    })
    // Same for the units and tolerance, which are part of a stored drawing.
    createEffect(() => { const settings = app.settings.settings(); void [settings.units, settings.tolerance, settings.decimals]; void document.touch() })

    // Failures of unattended saves are reported once per episode; the status bar keeps showing them.
    let reported: string | undefined
    createEffect(() => {
      const message = document.error() ?? program.error()
      if (message !== undefined && message !== reported) toast.error(t("save.toast.autoFailed", { message }))
      reported = message
    })

    // Leaving the window (hidden, blurred, closing) is the moment unsaved work is most at risk.
    const background = (): void => { if (enabled() && hasUnsavedWork()) void flush().catch(() => undefined) }
    const visibility = (): void => { if (globalThis.document?.visibilityState === "hidden") background() }
    globalThis.document?.addEventListener("visibilitychange", visibility)
    globalThis.addEventListener?.("pagehide", background)
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!hasUnsavedWork()) return
      void flush().catch(() => undefined)
      event.preventDefault()
      event.returnValue = ""
    }
    globalThis.addEventListener?.("beforeunload", beforeUnload)
    stops.push(() => {
      globalThis.document?.removeEventListener("visibilitychange", visibility)
      globalThis.removeEventListener?.("pagehide", background)
      globalThis.removeEventListener?.("beforeunload", beforeUnload)
    })

    // The desktop shell closes the window only after the unsaved work was written (or the user insisted).
    let disposed = false
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        const off = await win.onCloseRequested(closeGuard(session, win, (message) => toast.error(message)))
        if (disposed) off(); else stops.push(off)
      }).catch(() => undefined)
    }

    return () => {
      disposed = true
      for (const stop of stops.splice(0)) stop()
      document.dispose(); program.dispose()
      // The engines are finished: the next `projectSession(app)` builds a new session instead of handing out this one.
      if (sessions.get(app) === session) sessions.delete(app)
    }
  }

  const session: ProjectSession = { document, program, summary, hasUnsavedWork, saveAll, saveInteractive, flush, start }
  return session
}

/** The one save session of an app instance (created on first use, started by the shell). */
export const projectSession = (app: AppState): ProjectSession => {
  let session = sessions.get(app)
  if (session === undefined) { session = createProjectSession(app); sessions.set(app, session) }
  return session
}
