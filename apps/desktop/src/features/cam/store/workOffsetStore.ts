/**
 * The work-offset table being edited (spec 73 §4): the rows as loaded from the machine configuration, the rows with the user's edits,
 * the revision the load read (what Save sends back as `baseUpdatedAt`) and the conflict flag a 409 sets. Nothing here talks to the
 * sidecar; `api/probing.ts` does, and the panel moves the result in and out of this store.
 */
import { create } from "../../../shared/state/zustand.ts"
import { diffRows, entriesOfRows, offsetRowsOf, withRowValue, applyMeasured, type OffsetChange, type OffsetRow, type OffsetRowAxis } from "../lib/probing/work-offsets.ts"
import type { MachineProfile, ProbeSimUpdate } from "../lib/probing/contract.ts"

export type OffsetScope = "machine" | "setup"

/** What a GET answered: the rows of the table, the revision and whether the caller may write. */
export interface LoadedOffsets {
  readonly machineConfigId: string
  readonly setupId: string | null
  readonly entries: Readonly<Record<string, OffsetRow["entry"]>>
  readonly updatedAt: string
  readonly isOwner: boolean
}

interface WorkOffsetStore {
  readonly machineConfigId: string | undefined
  readonly setupId: string | undefined
  readonly scope: OffsetScope
  readonly saved: ReadonlyArray<OffsetRow>
  readonly rows: ReadonlyArray<OffsetRow>
  readonly updatedAt: string | undefined
  readonly isOwner: boolean
  readonly loading: boolean
  readonly saving: boolean
  readonly error: string | undefined
  /** The table changed on the machine since this editor read it (HTTP 409): reload to see theirs, or keep editing. */
  readonly conflict: boolean
  setScope(scope: OffsetScope): void
  /** Replaces both the saved and the edited rows with the machine's answer (rows of the profile first, then every stored one). */
  load(profile: MachineProfile, loaded: LoadedOffsets): void
  edit(key: string, axis: OffsetRowAxis, value: number | undefined): void
  addRow(key: string): void
  /** The offsets a probe run measured laid into the rows (not saved until Save). */
  applyUpdates(updates: ReadonlyArray<ProbeSimUpdate>): void
  discard(): void
  setLoading(loading: boolean): void
  setSaving(saving: boolean): void
  setError(error: string | undefined): void
  setConflict(conflict: boolean): void
  reset(): void
  readonly changes: () => ReadonlyArray<OffsetChange>
  readonly entries: () => Record<string, OffsetRow["entry"]>
}

const INITIAL = { machineConfigId: undefined, setupId: undefined, scope: "machine" as OffsetScope, saved: [] as ReadonlyArray<OffsetRow>, rows: [] as ReadonlyArray<OffsetRow>, updatedAt: undefined, isOwner: false, loading: false, saving: false, error: undefined, conflict: false }

export const useWorkOffsetStore = create<WorkOffsetStore>((set, get) => ({
  ...INITIAL,
  setScope: (scope) => set({ scope }),
  load: (profile, loaded) => {
    // The profile gives the rows the control has; the GET gives the stored values: the table the user edits is both.
    const stored = { ...profile, workOffsetTable: loaded.setupId === null ? { entries: loaded.entries } : { entries: {}, bySetup: { [loaded.setupId]: loaded.entries } } }
    const rows = offsetRowsOf(stored, loaded.setupId ?? undefined)
    set({ machineConfigId: loaded.machineConfigId, setupId: loaded.setupId ?? undefined, scope: loaded.setupId === null ? "machine" : "setup", saved: rows, rows, updatedAt: loaded.updatedAt, isOwner: loaded.isOwner, loading: false, error: undefined, conflict: false })
  },
  edit: (key, axis, value) => set((state) => ({ rows: withRowValue(state.rows, key, axis, value, state.scope) })),
  addRow: (key) => set((state) => state.rows.some((row) => row.key === key) ? {} : { rows: [...state.rows, { key, entry: { x: 0, y: 0, z: 0 }, source: state.scope }] }),
  applyUpdates: (updates) => set((state) => ({ rows: applyMeasured(state.rows, updates, state.scope) })),
  discard: () => set((state) => ({ rows: state.saved, error: undefined })),
  setLoading: (loading) => set({ loading }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  setConflict: (conflict) => set({ conflict }),
  reset: () => set({ ...INITIAL }),
  changes: () => diffRows(get().saved, get().rows),
  entries: () => entriesOfRows(get().rows, get().scope)
}))
