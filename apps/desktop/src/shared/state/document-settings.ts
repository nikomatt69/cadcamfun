/**
 * The drawing's measuring settings: the unit it is shown in and the tolerance it is drawn and machined to.
 *
 * The editor works in millimetres; the unit only changes what is read and typed. The tolerance (mm) is shared: it sets how
 * closely curves are drawn, and is the default of the toolpath generator and of the verification. These functions are the one
 * way to change either, so the settings, the editor, the CAM generator and the Verify tab never disagree. They also travel
 * with the stored drawing.
 */
import { DEFAULT_TOLERANCE, decimalsForTolerance, isTolerance } from "@cadcamfun/core"
import { useCADStore } from "../../features/cad/store/cadStore.ts"
import { useGeneratorStore } from "../../features/cam/store/generatorStore.ts"
import { useVerifyStore } from "../../features/cam/store/verifyStore.ts"
import { UNIT_TABLE, isDisplayUnits, type DisplayUnits } from "../../viewport/units.ts"
import type { AppState } from "./context.ts"

type Settings = Pick<AppState, "settings">

/** Decimals that show the tolerance in `units` (at least the unit's own default), at most 6. */
export const decimalsFor = (units: DisplayUnits, toleranceMm: number): number =>
  Math.min(6, Math.max(UNIT_TABLE[units].decimals, decimalsForTolerance(toleranceMm / UNIT_TABLE[units].mmPerUnit)))

export const setDisplayUnits = (app: Settings, units: DisplayUnits): void => {
  app.settings.update({ units, decimals: decimalsFor(units, app.settings.settings().tolerance) })
}

/** Applies a tolerance (mm) everywhere it matters; returns false for a value that is not a usable tolerance. */
export const setDocumentTolerance = (app: Settings, toleranceMm: number): boolean => {
  if (!isTolerance(toleranceMm)) return false
  app.settings.update({ tolerance: toleranceMm, decimals: decimalsFor(app.settings.settings().units, toleranceMm) })
  applyTolerance(toleranceMm)
  return true
}

const applyTolerance = (toleranceMm: number): void => {
  useCADStore.getState().setTolerance(toleranceMm)
  useGeneratorStore.getState().patchSettings({ tolerance: toleranceMm })
  useVerifyStore.getState().setHolder({ tolerance: toleranceMm })
}

/** Pushes the saved settings into the stores that use them (page start). */
export const syncDocumentSettings = (app: Settings): void => applyTolerance(app.settings.settings().tolerance)

/** What is stored with a drawing. */
export const documentSettings = (app: Settings): { readonly units: DisplayUnits; readonly tolerance: number; readonly decimals: number } => {
  const { units, tolerance, decimals } = app.settings.settings()
  return { units, tolerance, decimals }
}

/** Applies the settings a stored drawing carries; anything missing or invalid keeps the current value. */
export const restoreDocumentSettings = (app: Settings, stored: unknown): void => {
  if (typeof stored !== "object" || stored === null) return
  const { units, tolerance } = stored as { units?: unknown; tolerance?: unknown }
  if (isDisplayUnits(units)) setDisplayUnits(app, units)
  if (isTolerance(tolerance)) setDocumentTolerance(app, tolerance)
}

export { DEFAULT_TOLERANCE }
