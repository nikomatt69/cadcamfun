/**
 * The setup store (spec 14, RM-02): the choices that turn the multi-toolpath panel's toolpaths into programs (grouping, post, retract
 * before a tool change) and the last result of the sidecar's `camSetup` group. Not persisted: the document revision/receipt
 * persistence of a setup follows RM-03.
 */
import type { CamSetupGenerated, CamSetupPlan } from "@cadcamfun/api"
import { create } from "../../../shared/state/zustand.ts"
import { DEFAULT_SETUP_CHOICES, type SetupChoices } from "../lib/setup.ts"

interface SetupStore {
  readonly choices: SetupChoices
  readonly plan: CamSetupPlan | undefined
  readonly result: CamSetupGenerated | undefined
  setChoices(patch: Partial<SetupChoices>): void
  setPlan(plan: CamSetupPlan | undefined): void
  setResult(result: CamSetupGenerated | undefined): void
}

export const useSetupStore = create<SetupStore>((set) => ({
  choices: DEFAULT_SETUP_CHOICES,
  plan: undefined,
  result: undefined,
  // A change of choices makes the last plan and result stale: they are dropped, not shown next to the new choices.
  setChoices: (patch) => set((state) => ({ choices: { ...state.choices, ...patch }, plan: undefined, result: undefined })),
  setPlan: (plan) => set({ plan }),
  setResult: (result) => set({ result })
}))
