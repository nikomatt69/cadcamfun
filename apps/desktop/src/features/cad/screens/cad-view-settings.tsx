import { For } from "solid-js"
import { Eye, Grid2X2, RotateCcw } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { setDisplayUnits } from "../../../shared/state/document-settings.ts"
import { useApp } from "../../../shared/state/context.ts"
import { DISPLAY_UNITS, UNIT_TABLE, isDisplayUnits } from "../../../viewport/units.ts"

type Vector = { readonly x: number; readonly y: number; readonly z: number }
interface Props {
  readonly view: "2d" | "3d"
  readonly onView: (view: "2d" | "3d") => void
  readonly grid: boolean
  readonly axes: boolean
  readonly onGrid: () => void
  readonly onAxes: () => void
  readonly origin: Vector
  readonly onOrigin: (origin: Vector) => void
  readonly stock: Vector
  readonly onStock: (stock: Vector) => void
  readonly stockVisible: boolean
  readonly onStockVisible: () => void
}

export function CadViewSettings(props: Props) {
  const app = useApp()
  return <div class="cad-card cad-view-settings">
    <h3>{t("cad.viewSettings")}</h3>
    <div class="cad-setting-section"><h4>{t("cad.viewMode")}</h4><div class="cad-setting-modes">
      <For each={["2d", "3d"] as const}>{mode => <button class="cad-setting-mode" aria-pressed={props.view === mode} onClick={() => props.onView(mode)}>{t(mode === "2d" ? "cad.view2d" : "cad.view3d")}</button>}</For>
    </div></div>
    <div class="cad-setting-section"><h4>{t("cad.displayOptions")}</h4>
      <button class="cad-setting-toggle" role="switch" aria-checked={props.grid} onClick={props.onGrid}><span><Grid2X2 size={16} />{t("cad.showGrid")}</span><span class="cad-switch" data-on={props.grid}><span /></span></button>
      <button class="cad-setting-toggle" role="switch" aria-checked={props.axes} onClick={props.onAxes}><span><Eye size={16} />{t("cad.showAxis")}</span><span class="cad-switch" data-on={props.axes}><span /></span></button>
    </div>
    <section class="cad-setting-section"><div class="cad-panel-heading"><h4>{t("cad.originOffset")}</h4><button class="cad-button" aria-label={t("cad.resetOrigin")} onClick={() => props.onOrigin({ x: 0, y: 0, z: 0 })}><RotateCcw size={14} /></button></div>
      <div class="cad-vector-fields"><For each={["x", "y", "z"] as const}>{axis => <label class="cad-field"><span>{axis.toUpperCase()} ({app.settings.settings().units})</span><input type="number" step="0.1" value={props.origin[axis] / UNIT_TABLE[app.settings.settings().units].mmPerUnit} onInput={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) props.onOrigin({ ...props.origin, [axis]: value * UNIT_TABLE[app.settings.settings().units].mmPerUnit }) }} /></label>}</For></div>
    </section>
    <section class="cad-setting-section"><h4>{t("cad.workpieceSetup")}</h4>
      <button class="cad-setting-toggle" role="switch" aria-checked={props.stockVisible} onClick={props.onStockVisible}><span>{t("cad.showWorkpiece")}</span><span class="cad-switch" data-on={props.stockVisible}><span /></span></button>
      <div class="cad-vector-fields"><For each={["x", "y", "z"] as const}>{axis => <label class="cad-field"><span>{t(axis === "x" ? "cad.width" : axis === "y" ? "cad.height" : "cad.depth")}</span><input type="number" min="0.001" step="1" value={props.stock[axis] / UNIT_TABLE[app.settings.settings().units].mmPerUnit} onInput={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value) && value > 0) props.onStock({ ...props.stock, [axis]: value * UNIT_TABLE[app.settings.settings().units].mmPerUnit }) }} /></label>}</For></div>
    </section>
    <section class="cad-setting-section"><h4>{t("cad.snapSettings")}</h4><button class="cad-setting-toggle" role="switch" aria-checked={app.settings.settings().snapEnabled} onClick={() => app.settings.update({ snapEnabled: !app.settings.settings().snapEnabled })}><span>{t("cad.enableSnapping")}</span><span class="cad-switch" data-on={app.settings.settings().snapEnabled}><span /></span></button></section>
    <label class="cad-field"><span>{t("cad.units")}</span><select value={app.settings.settings().units} onChange={event => { const units = event.currentTarget.value; if (isDisplayUnits(units)) setDisplayUnits(app, units) }}><For each={DISPLAY_UNITS}>{unit => <option value={unit}>{UNIT_TABLE[unit].label}</option>}</For></select></label>
  </div>
}
