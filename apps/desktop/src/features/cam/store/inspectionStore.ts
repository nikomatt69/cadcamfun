/**
 * The inspection list's state (spec 73 §4): the report being read (a fresh run or a stored one), the warning share, the stored
 * report history of the project and the characteristic selected for the 3D view. The verdicts themselves come with the run
 * (`ProbeRunResult`); this store holds how they are read.
 */
import { create } from "../../../shared/state/zustand.ts"
import { WARN_SHARE } from "../lib/probing/inspection.ts"
import type { ProbeRunResult } from "../lib/probing/result.ts"

/** A stored report as the history lists it (the summary the sidecar returns). */
export interface ReportEntry {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly verdict: string
  readonly toolpathId: string | null
  readonly workOffset: string | null
  readonly measuredAt: string
}

interface InspectionStore {
  /** A stored report opened for reading; undefined: the run of the selected cycle. */
  readonly opened: ProbeRunResult | undefined
  readonly history: ReadonlyArray<ReportEntry>
  readonly warnShare: number
  readonly selected: string | undefined
  open(result: ProbeRunResult | undefined): void
  setHistory(history: ReadonlyArray<ReportEntry>): void
  setWarnShare(share: number): void
  select(name: string | undefined): void
  reset(): void
}

export const useInspectionStore = create<InspectionStore>((set) => ({
  opened: undefined, history: [], warnShare: WARN_SHARE, selected: undefined,
  open: (opened) => set({ opened, selected: undefined }),
  setHistory: (history) => set({ history }),
  setWarnShare: (warnShare) => set({ warnShare }),
  select: (selected) => set({ selected }),
  reset: () => set({ opened: undefined, history: [], warnShare: WARN_SHARE, selected: undefined })
}))
