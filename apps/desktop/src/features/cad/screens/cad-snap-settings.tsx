/**
 * Snap settings panel — the toggles for every object-snap type plus the
 * tolerance, grid spacing and grid-snap enable. Mirrors the legacy
 * `SnapSettings` dialog with per-type toggles and a direct label for each one.
 *
 * Apple-design principles applied here:
 *  - Specific labels (no "Submit", every toggle names what it does).
 *  - Status feedback is visible in the hint at the bottom and the active state
 *    on each toggle.
 *  - Reduced-motion safe (CSS uses opacity transitions on the active state).
 *  - Controls grouped by concern (object snaps first, grid second) — proximity
 *    implies relationship.
 */
import { For } from "solid-js"
import { Magnet } from "lucide-solid"
import { SNAP_TYPES, type SnapType } from "@cadcamfun/core"
import { useApp } from "../../../shared/state/context.ts"
import { t, type Key } from "../../../i18n/index.ts"
import { CadButton } from "./cad-controls.tsx"

export interface SnapUserSettings {
  /** Per-type enable; the renderer skips types not in this list. */
  readonly types: ReadonlyArray<SnapType>
  /** Tolerance in mm; higher = stickier. */
  readonly tolerance: number
  /** Grid snap toggle (separate from object snap). */
  readonly grid: boolean
  /** Grid spacing in mm. */
  readonly gridSpacing: number
}

export const DEFAULT_SNAP_USER_SETTINGS: SnapUserSettings = {
  types: [...SNAP_TYPES],
  tolerance: 10,
  grid: true,
  gridSpacing: 10
}

interface ToggleRowProps {
  readonly type: SnapType
  readonly active: boolean
  readonly onToggle: (next: boolean) => void
}

const SNAP_LABEL: Record<SnapType, Key> = {
  endpoint: "cad.snap.endpoint",
  midpoint: "cad.snap.midpoint",
  center: "cad.snap.center",
  intersection: "cad.snap.intersection",
  perpendicular: "cad.snap.perpendicular",
  tangent: "cad.snap.tangent",
  nearest: "cad.snap.nearest",
  quadrant: "cad.snap.quadrant"
}

const SNAP_HINT: Record<SnapType, Key> = {
  endpoint: "cad.snap.endpointHint",
  midpoint: "cad.snap.midpointHint",
  center: "cad.snap.centerHint",
  intersection: "cad.snap.intersectionHint",
  perpendicular: "cad.snap.perpendicularHint",
  tangent: "cad.snap.tangentHint",
  nearest: "cad.snap.nearestHint",
  quadrant: "cad.snap.quadrantHint"
}

function SnapToggleRow(props: ToggleRowProps) {
  return (
    <button
      type="button"
      class="cad-snap-row"
      role="switch"
      aria-checked={props.active}
      aria-label={t(SNAP_LABEL[props.type])}
      onClick={() => props.onToggle(!props.active)}
    >
      <span class="cad-snap-name">{t(SNAP_LABEL[props.type])}</span>
      <span class="cad-snap-hint">{t(SNAP_HINT[props.type])}</span>
      <span class="cad-switch" data-on={props.active}>
        <span />
      </span>
    </button>
  )
}

export function CadSnapSettings(props: {
  readonly settings: SnapUserSettings
  readonly onSettings: (next: SnapUserSettings) => void
}) {
  const _app = useApp()
  const update = (patch: Partial<SnapUserSettings>) =>
    props.onSettings({ ...props.settings, ...patch })
  const toggleType = (type: SnapType, enabled: boolean) => {
    const set = new Set(props.settings.types)
    if (enabled) set.add(type)
    else set.delete(type)
    // Keep the order defined in SNAP_TYPES so the priority is stable.
    update({ types: SNAP_TYPES.filter((t) => set.has(t)) })
  }

  return (
    <div class="cad-card cad-snap-settings">
      <div class="cad-panel-heading">
        <h3>
          <Magnet size={16} aria-hidden="true" />
          <span>{t("cad.snapSettings")}</span>
        </h3>
      </div>
      <h4 class="cad-section-heading">{t("cad.snap.typesHeading")}</h4>
      <div class="cad-snap-list">
        <For each={SNAP_TYPES}>
          {(type) => (
            <SnapToggleRow
              type={type}
              active={props.settings.types.includes(type)}
              onToggle={(value) => toggleType(type, value)}
            />
          )}
        </For>
      </div>

      <h4 class="cad-section-heading">{t("cad.snap.gridHeading")}</h4>
      <button
        type="button"
        class="cad-setting-toggle"
        role="switch"
        aria-checked={props.settings.grid}
        aria-label={t("cad.snap.grid")}
        onClick={() => update({ grid: !props.settings.grid })}
      >
        <span>{t("cad.snap.grid")}</span>
        <span class="cad-switch" data-on={props.settings.grid}>
          <span />
        </span>
      </button>

      <div class="cad-snap-fields">
        <label class="cad-field">
          <span>{t("cad.snap.toleranceLabel")} (mm)</span>
          <input
            type="number"
            min="0.5"
            max="50"
            step="0.5"
            value={props.settings.tolerance}
            onInput={(event) => {
              const value = event.currentTarget.valueAsNumber
              if (Number.isFinite(value)) update({ tolerance: Math.max(0.5, value) })
            }}
          />
        </label>
        <label class="cad-field">
          <span>{t("cad.snap.gridSpacingLabel")} (mm)</span>
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            value={props.settings.gridSpacing}
            onInput={(event) => {
              const value = event.currentTarget.valueAsNumber
              if (Number.isFinite(value)) update({ gridSpacing: Math.max(1, value) })
            }}
          />
        </label>
      </div>

      <p class="cad-hint">
        {t("cad.snap.osnapMarker")}
      </p>
      <div class="cad-actions">
        <CadButton
          label={t("cad.reset")}
          onClick={() => props.onSettings({ ...DEFAULT_SNAP_USER_SETTINGS })}
        >
          <span>{t("cad.reset")}</span>
        </CadButton>
      </div>
    </div>
  )
}

void t("cad.snap.endpoint")