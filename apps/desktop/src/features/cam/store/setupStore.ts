/**
 * The setup store (spec 14, RM-02): the choices that turn the multi-toolpath panel's toolpaths into programs (grouping, post, retract
 * before a tool change), the last result of the sidecar's `camSetup` group, and the saved setup the panel was loaded from or last
 * saved as (its revision is what the next save expects, `api/setup.ts`).
 *
 * The plan and the generated programs belong to the toolpaths and choices they were made from: a change of either drops them, so
 * a tool table is never shown next to operations it was not planned for.
 */
import type { CamSetupDocument, CamSetupGenerated, CamSetupPlan } from "@cadcamfun/api"
import { create } from "../../../shared/state/zustand.ts"
import type { SavedSetupRef } from "../api/setup.ts"
import { DEFAULT_SETUP_CHOICES, type SetupChoices } from "../lib/setup.ts"
import { useMultiToolpathStore } from "./multiToolpathStore.ts"

interface SetupStore {
  readonly choices: SetupChoices
  readonly plan: CamSetupPlan | undefined
  readonly result: CamSetupGenerated | undefined
  /** The saved setup this panel edits; undefined until the first save or load. */
  readonly saved: SavedSetupRef | undefined
  /** The project's saved setups, as last listed. */
  readonly documents: ReadonlyArray<CamSetupDocument>
  /** Set when a save was refused because the saved setup changed elsewhere: the user picks theirs or keeps this one. */
  readonly conflict: boolean
  setChoices(patch: Partial<SetupChoices>): void
  setPlan(plan: CamSetupPlan | undefined): void
  setResult(result: CamSetupGenerated | undefined): void
  setSaved(saved: SavedSetupRef | undefined): void
  setDocuments(documents: ReadonlyArray<CamSetupDocument>): void
  setConflict(conflict: boolean): void
  reset(): void
}

export const useSetupStore = create<SetupStore>((set) => ({
  choices: DEFAULT_SETUP_CHOICES,
  plan: undefined,
  result: undefined,
  saved: undefined,
  documents: [],
  conflict: false,
  // A change of choices makes the last plan and result stale: they are dropped, not shown next to the new choices.
  setChoices: (patch) => set((state) => ({ choices: { ...state.choices, ...patch }, plan: undefined, result: undefined })),
  setPlan: (plan) => set({ plan }),
  setResult: (result) => set({ result }),
  setSaved: (saved) => set({ saved, conflict: false }),
  setDocuments: (documents) => set({ documents }),
  setConflict: (conflict) => set({ conflict }),
  reset: () => set({ choices: DEFAULT_SETUP_CHOICES, plan: undefined, result: undefined, saved: undefined, documents: [], conflict: false })
}))

// The toolpaths are the operations: an edit, reorder or new G-code on them makes the plan and the programs stale.
useMultiToolpathStore.subscribe((state, previous) => {
  if (state.toolpaths === previous.toolpaths) return
  const setup = useSetupStore.getState()
  if (setup.plan !== undefined || setup.result !== undefined) useSetupStore.setState({ plan: undefined, result: undefined })
})
