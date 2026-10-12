/** State of the "Verify" tab: the holder the user describes and the latest report. */
import { create } from "../../../shared/state/zustand.ts"
import type { VerifyResponse } from "../api/generator.ts"
import { DEFAULT_HOLDER, type HolderForm } from "../lib/verifyJob.ts"

interface VerifyState {
  holder: HolderForm
  running: boolean
  error: string | null
  report: VerifyResponse | null
  /** The G-code the report belongs to, so an edit marks it stale. */
  verifiedGcode: string | null

  setHolder: (patch: Partial<HolderForm>) => void
  start: () => void
  finish: (report: VerifyResponse, gcode: string) => void
  fail: (message: string) => void
  reset: () => void
}

export const useVerifyStore = create<VerifyState>((set) => ({
  holder: DEFAULT_HOLDER,
  running: false,
  error: null,
  report: null,
  verifiedGcode: null,

  setHolder: (patch) => set((state) => ({ holder: { ...state.holder, ...patch } })),
  start: () => set({ running: true, error: null }),
  finish: (report, gcode) => set({ running: false, error: null, report, verifiedGcode: gcode }),
  fail: (message) => set({ running: false, error: message }),
  reset: () => set({ holder: DEFAULT_HOLDER, running: false, error: null, report: null, verifiedGcode: null })
}))
