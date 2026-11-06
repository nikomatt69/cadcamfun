/**
 * The probing panel's state (spec 73 §4): which cycle is selected, the program last written for it, the last run of each cycle,
 * the run in progress (`probe.progress`) and the 3D options. The cycles themselves are toolpaths in the multi-toolpath store (one
 * source of truth); this store holds only what is not an operation. Results are kept per cycle with the fingerprint of the
 * operation they measured, so an edit marks them stale instead of showing figures of an older cycle.
 */
import type { cam } from "@cadcamfun/core"
import { create } from "../../../shared/state/zustand.ts"
import { fingerprintOf, type ProbeRunResult } from "../lib/probing/result.ts"

export type ProbingSection = "cycles" | "offsets" | "inspection" | "program"
export type ProbingBusy = "plan" | "emit" | "simulate" | "calibrate" | "save"

export interface ProbeProgram {
  readonly operationId: string
  readonly dialect: string
  readonly nc: string
  readonly lines: number
  readonly notes: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  readonly hash?: string
  /** The word of a native cycle: the control runs its own cycle, the replay reads its inline equivalent. */
  readonly native?: string
  readonly fingerprint: string
  /** The program parsed for the 3D view: what "Show in 3D" plays, with the motion track (its moves carry the NC lines of the touches). */
  readonly parsed?: { readonly program: cam.Program; readonly motion?: cam.viewer.MotionTrack | undefined }
  /** A simulated run's program as it went: touches end at their contacts. `parsed` is this text, `lines[i]` the line of `nc` of its line i + 1. */
  readonly played?: { readonly text: string; readonly lines: ReadonlyArray<number> }
}

/** The run the sidecar announced with `probe.progress`. */
export interface ProbeRunProgress {
  readonly runId: string
  readonly phase: "running" | "done" | "cancelled"
  readonly stage?: "queued" | "plan" | "touch" | "check" | "offsets" | "record"
  readonly operationId?: string
  readonly index?: number
  readonly count?: number
}

/** A finished run announced by the sidecar (`probe.result`): the assistant's, or this window's own. */
export interface ProbeRunSummary {
  readonly runId: string
  readonly reportId?: string
  readonly operationId?: string
  readonly verdict: string
  readonly checks: number
  readonly failed: number
  readonly maxDeviationMm?: number
  readonly offsetsUpdated: boolean
  readonly kind: string
}

export interface Misplacement { readonly x: number; readonly y: number; readonly z: number; readonly c: number }

export interface PickedPoint { readonly point: { readonly x: number; readonly y: number; readonly z: number }; readonly normal: { readonly x: number; readonly y: number; readonly z: number } }

interface ProbingStore {
  readonly selectedId: string | undefined
  readonly open: Readonly<Record<ProbingSection, boolean>>
  /** The post the program is written for; undefined: the machine's own. */
  readonly dialect: string | undefined
  readonly programs: Readonly<Record<string, ProbeProgram>>
  readonly results: Readonly<Record<string, ProbeRunResult>>
  readonly progress: ProbeRunProgress | undefined
  /** The last finished run somebody else started (the assistant): offered as "Open report" until dismissed. */
  readonly remote: ProbeRunSummary | undefined
  readonly busy: ProbingBusy | undefined
  readonly error: string | undefined
  /** The user is picking a feature on the model; the next surface hit fills the selected cycle. */
  readonly picking: boolean
  readonly lastPick: PickedPoint | undefined
  /** Where the simulated part really sits against the drawn one (mm, C degrees): what the run should find; on a rotary run, the true pivot. */
  readonly misplacement: Misplacement
  /** The probe run is drawn in the 3D view. */
  readonly showIn3d: boolean
  /** The measured result a list row highlights in the 3D view (a contact index). */
  readonly highlight: number | undefined
  select(id: string | undefined): void
  toggleSection(section: ProbingSection): void
  setDialect(dialect: string | undefined): void
  setProgram(program: ProbeProgram): void
  setResult(result: ProbeRunResult): void
  forget(operationId: string): void
  setProgress(progress: ProbeRunProgress | undefined): void
  setRemote(remote: ProbeRunSummary | undefined): void
  setBusy(busy: ProbingBusy | undefined): void
  setError(error: string | undefined): void
  setPicking(picking: boolean): void
  setLastPick(pick: PickedPoint | undefined): void
  setShowIn3d(show: boolean): void
  setHighlight(index: number | undefined): void
  setMisplacement(patch: Partial<Misplacement>): void
  reset(): void
}

const INITIAL = {
  selectedId: undefined, open: { cycles: true, offsets: false, inspection: true, program: true } as const, dialect: undefined,
  programs: {}, results: {}, progress: undefined, remote: undefined, busy: undefined, error: undefined, picking: false, lastPick: undefined, showIn3d: true, highlight: undefined, misplacement: { x: 0, y: 0, z: 0, c: 0 }
}

export const useProbingStore = create<ProbingStore>((set) => ({
  ...INITIAL,
  select: (selectedId) => set({ selectedId, highlight: undefined, error: undefined }),
  toggleSection: (section) => set((state) => ({ open: { ...state.open, [section]: !state.open[section] } })),
  setDialect: (dialect) => set({ dialect }),
  setProgram: (program) => set((state) => ({ programs: { ...state.programs, [program.operationId]: program } })),
  setResult: (result) => set((state) => ({ results: { ...state.results, [result.operationId]: result } })),
  forget: (operationId) => set((state) => {
    const { [operationId]: _program, ...programs } = state.programs
    const { [operationId]: _result, ...results } = state.results
    return { programs, results, selectedId: state.selectedId === operationId ? undefined : state.selectedId }
  }),
  setProgress: (progress) => set({ progress }),
  setRemote: (remote) => set({ remote }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setPicking: (picking) => set({ picking }),
  setLastPick: (lastPick) => set({ lastPick }),
  setShowIn3d: (showIn3d) => set({ showIn3d }),
  setHighlight: (highlight) => set({ highlight }),
  setMisplacement: (patch) => set((state) => ({ misplacement: { ...state.misplacement, ...patch } })),
  reset: () => set({ ...INITIAL, open: { ...INITIAL.open } })
}))

/** The run of `operation` that still describes it (the fingerprint matches), else undefined. */
export const freshResult = (results: ProbingStore["results"], id: string, operation: unknown): ProbeRunResult | undefined => {
  const found = results[id]
  return found !== undefined && found.fingerprint === fingerprintOf(operation) ? found : undefined
}

export const freshProgram = (programs: ProbingStore["programs"], id: string, operation: unknown): ProbeProgram | undefined => {
  const found = programs[id]
  return found !== undefined && found.fingerprint === fingerprintOf(operation) ? found : undefined
}
