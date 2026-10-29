import { For, Match, Show, Switch, type JSX } from "solid-js"
import { Target } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { cam } from "@cadcamfun/core"
import { CheckRow, NumberField, Section } from "./ui.tsx"

import { useJob } from "../../hooks/useJob.ts"
import { originExample } from "../../lib/generator-preview.ts"
import { ExamplePreview } from "./ExamplePreview.tsx"
import { t } from "../../../../i18n/index.ts"

const FIELD = "panel-input"


/** "Origin Coordinates": where the machine zero sits relative to the stock, with an isometric reference. */
export function OriginSection(): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const origin = () => gen.settings.originType
  const axis = (name: "originX" | "originY" | "originZ", label: string): JSX.Element => (
    <div>
      <label class="panel-label">{label}</label>
      <NumberField step="0.1" class={FIELD} value={gen.settings[name]} accept={() => true} onValue={(value) => gen.updateSettings(name, value)} />
    </div>
  )
  return (
    <Section id="origin" icon={Target} title={t("cam.ribbon.group.origin")} summary={gen.settings.machineType === "mill" ? gen.settings.workOffset : undefined} testId="origin-section">
      <Switch>
        <Match when={gen.settings.machineType === "lathe"}>
          <MachineZero setting="latheZero" machine="lathe" label={t("cam.gen.or.zZero")} />
        </Match>
        <Match when={gen.settings.machineType === "3dprinter"}>
          <MachineZero setting="bedOrigin" machine="3dprinter" label={t("cam.gen.or.plateOrigin")} />
          <div class="panel-grid panel-grid--2">
            <div class="panel-field"><label class="panel-label">{t("cam.gen.or.plateWidth")}</label><NumberField min="10" class={FIELD} value={gen.settings.bedWidth} onValue={(value) => gen.updateSettings("bedWidth", value)} /></div>
            <div class="panel-field"><label class="panel-label">{t("cam.gen.or.plateDepth")}</label><NumberField min="10" class={FIELD} value={gen.settings.bedDepth} onValue={(value) => gen.updateSettings("bedDepth", value)} /></div>
          </div>
          <CheckRow id="center-on-bed" checked={gen.settings.centerOnBed} onChange={(checked) => gen.updateSettings("centerOnBed", checked)}>{t("cam.gen.or.centrePart")}</CheckRow>
          <p class="text-xs text-gray-500">{t("cam.gen.or.plateNote")}</p>
        </Match>
        <Match when={gen.settings.machineType === "mill"}>
      <div>
        <label class="panel-label">{t("cam.status.wcsTitle")}</label>
        <select class={FIELD} aria-label={t("cam.status.wcsTitle")} data-testid="origin-work-offset" value={gen.settings.workOffset} onChange={(event) => gen.updateSettings("workOffset", event.currentTarget.value as typeof gen.settings.workOffset)}>
          <For each={cam.ORIGINS.mill.offsets ?? []}>{(offset) => <option value={offset}>{offset}{offset === "G54" ? " (default)" : ""}</option>}</For>
        </select>
        <p class="text-xs text-gray-500 mt-1">{t("cam.gen.or.originNote")}</p>
      </div>
      <div>
        <label class="panel-label">{t("cam.gen.or.originType")}</label>
        <select class={FIELD} value={origin()} onChange={(event) => gen.updateSettings("originType", event.currentTarget.value as typeof gen.settings.originType)}>
          <option value="workpiece-center">{t("cam.gen.or.center")}</option>
          <option value="workpiece-corner">{t("cam.gen.or.cornerBL")}</option>
          <option value="workpiece-corner2">{t("cam.gen.or.cornerTL")}</option>
          <option value="machine-zero">{t("cam.gen.or.machineZero")}</option>
          <option value="custom">{t("cam.gen.or.customCoords")}</option>
        </select>
      </div>

      <Show when={origin() === "custom"}>
        <div class="grid grid-cols-3 gap-4">
          {axis("originX", "X (mm)")}
          {axis("originY", "Y (mm)")}
          {axis("originZ", "Z (mm)")}
        </div>
      </Show>

      <ExamplePreview title={t("cam.generator.preview.origin")} example testId="origin-preview" model={originExample(gen.settings, job.stock())} />

        </Match>
      </Switch>
    </Section>
  )
}

/** A machine's own zero choice (lathe: finished face or chuck; printer: plate corner or centre), with what each means. */
function MachineZero(props: { readonly setting: "latheZero" | "bedOrigin"; readonly machine: "lathe" | "3dprinter"; readonly label: string }): JSX.Element {
  const gen = useGeneratorStore()
  const options = () => cam.ORIGINS[props.machine]
  const current = () => String(gen.settings[props.setting])
  return (
    <div data-testid={`origin-${props.setting}`}>
      <label class="panel-label">{props.label}</label>
      <select class={FIELD} aria-label={props.label} value={current()} onChange={(event) => gen.updateSettings(props.setting, event.currentTarget.value as never)}>
        <For each={options().choices}>{(choice) => <option value={choice.value}>{choice.label}</option>}</For>
      </select>
      <p class="text-xs text-gray-500 mt-1">{options().choices.find((choice) => choice.value === current())?.meaning}</p>
    </div>
  )
}
