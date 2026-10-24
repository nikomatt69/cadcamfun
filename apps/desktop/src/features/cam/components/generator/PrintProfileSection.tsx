/**
 * The print profile of a 3D printer job: quality, walls and skin, infill, supports and adhesion, speeds and cooling, temperatures,
 * retraction and the firmware dialect. Every control writes the generator settings or the printer extras the slicer reads
 * (`packages/core/src/cam/print`); nothing here is decoration.
 */
import { For, Show, type JSX } from "solid-js"
import { Layers } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { useGeneratorStore, type PrinterExtras, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CheckRow, Field, Grid, Group, INPUT, NumberField, Section, Segmented } from "./ui.tsx"

type Pattern = PrinterExtras["infillPattern"]

const PATTERNS: ReadonlyArray<readonly [Pattern, string]> = [
  ["grid", "Grid"], ["lines", "Lines"], ["triangles", "Triangles"], ["honeycomb", "Honeycomb"], ["gyroid", "Gyroid"], ["concentric", "Concentric"]
]

interface Preset {
  readonly id: string
  readonly label: string
  readonly settings: Partial<ToolpathSettings>
  readonly extras: Partial<PrinterExtras>
}

/** Four starting points; each sets the figures a slicer's profile of that name sets, and nothing else. */
const PRESETS: ReadonlyArray<Preset> = [
  { id: "draft", label: "Draft", settings: { layerHeight: 0.3, printSpeed: 80 }, extras: { shellCount: 2, topLayers: 3, bottomLayers: 3, infillDensity: 10, infillPattern: "lines" } },
  { id: "standard", label: "Standard", settings: { layerHeight: 0.2, printSpeed: 60 }, extras: { shellCount: 2, topLayers: 4, bottomLayers: 4, infillDensity: 20, infillPattern: "grid" } },
  { id: "fine", label: "Fine", settings: { layerHeight: 0.1, printSpeed: 40 }, extras: { shellCount: 3, topLayers: 8, bottomLayers: 8, infillDensity: 20, infillPattern: "grid" } },
  { id: "strong", label: "Strong", settings: { layerHeight: 0.2, printSpeed: 50 }, extras: { shellCount: 4, topLayers: 5, bottomLayers: 5, infillDensity: 40, infillPattern: "gyroid" } }
]

function SettingNumber(props: { readonly label: string; readonly unit?: string; readonly key: "layerHeight" | "extrusionWidth" | "printSpeed" | "printTemperature" | "bedTemperature"; readonly zero?: boolean; readonly step?: string }): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Field label={props.label} {...(props.unit !== undefined ? { unit: props.unit } : {})}>
      <NumberField label={props.label} step={props.step ?? "1"} value={gen.settings[props.key]} accept={props.zero ? (v) => v >= 0 : undefined} onValue={(value) => gen.updateSettings(props.key, value)} />
    </Field>
  )
}

type NumericExtra = { [K in keyof PrinterExtras]-?: PrinterExtras[K] extends number ? K : never }[keyof PrinterExtras]

function ExtraNumber(props: { readonly label: string; readonly unit?: string; readonly key: NumericExtra; readonly int?: boolean; readonly zero?: boolean; readonly step?: string; readonly testId?: string }): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Field label={props.label} {...(props.unit !== undefined ? { unit: props.unit } : {})}>
      <NumberField
        label={props.label} step={props.step ?? "1"} int={props.int ?? false} value={gen.printer[props.key]}
        accept={props.zero ? (v) => v >= 0 : undefined}
        onValue={(value) => gen.setPrinter({ [props.key]: value } as Partial<PrinterExtras>)}
      />
    </Field>
  )
}

export function PrintProfileSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  const p = () => gen.printer
  const summary = (): string => `${s().layerHeight} mm · ${p().infillDensity} % ${p().infillPattern} · ${p().shellCount} walls`
  const activePreset = (): string | undefined =>
    PRESETS.find((preset) =>
      Object.entries(preset.settings).every(([key, value]) => s()[key as keyof ToolpathSettings] === value) &&
      Object.entries(preset.extras).every(([key, value]) => p()[key as keyof PrinterExtras] === value))?.id
  const supportsOn = (): boolean => p().supportType !== "none"

  return (
    <Show when={s().machineType === "3dprinter"}>
      <Section id="printer" icon={Layers} title="Print profile" summary={summary()} testId="print-profile-section">
        <Segmented
          label="Profile" testId="print-presets" value={activePreset() ?? ""}
          options={PRESETS.map((preset) => [preset.id, preset.label] as const)}
          onChange={(id) => {
            const preset = PRESETS.find((candidate) => candidate.id === id)
            if (preset === undefined) return
            gen.patchSettings(preset.settings)
            gen.setPrinter(preset.extras)
          }}
        />

        <Group title="Quality">
          <Grid>
            <SettingNumber label="Layer height" unit="mm" key="layerHeight" step="0.05" />
            <ExtraNumber label="First layer" unit="0 = same" key="firstLayerHeight" zero step="0.05" />
          </Grid>
          <Grid>
            <Field label="Nozzle" unit="mm">
              <select class={INPUT} value={String(s().nozzleDiameter)} onChange={(event) => {
                const diameter = parseFloat(event.currentTarget.value)
                gen.patchSettings({ nozzleDiameter: diameter, extrusionWidth: diameter })
              }}>
                <For each={[0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1]}>{(d) => <option value={String(d)}>{d}</option>}</For>
              </select>
            </Field>
            <SettingNumber label="Line width" unit="mm" key="extrusionWidth" step="0.05" />
          </Grid>
          <Grid>
            <Field label="Filament" unit="mm">
              <select class={INPUT} value={String(s().filamentDiameter)} onChange={(event) => gen.updateSettings("filamentDiameter", parseFloat(event.currentTarget.value))}>
                <option value="1.75">1.75</option><option value="2.85">2.85</option><option value="3">3.00</option>
              </select>
            </Field>
            <Field label="Orientation">
              <select class={INPUT} value={p().printOrientation} onChange={(event) => gen.setPrinter({ printOrientation: event.currentTarget.value as PrinterExtras["printOrientation"] })}>
                <option value="original">As designed</option><option value="auto-optimal">Best face down</option>
              </select>
            </Field>
          </Grid>
        </Group>

        <Group title="Walls and skin">
          <Grid cols={3}>
            <ExtraNumber label="Walls" key="shellCount" int />
            <ExtraNumber label="Top" unit="layers" key="topLayers" int zero />
            <ExtraNumber label="Bottom" unit="layers" key="bottomLayers" int zero />
          </Grid>
          <Grid>
            <Field label="Seam">
              <select class={INPUT} value={p().seam} onChange={(event) => gen.setPrinter({ seam: event.currentTarget.value as PrinterExtras["seam"] })}>
                <option value="nearest">Nearest</option><option value="aligned">Aligned (rear)</option><option value="random">Random</option>
              </select>
            </Field>
            <Field label="Wall order">
              <select class={INPUT} value={p().outerWallFirst ? "outer" : "inner"} onChange={(event) => gen.setPrinter({ outerWallFirst: event.currentTarget.value === "outer" })}>
                <option value="inner">Outer wall last</option><option value="outer">Outer wall first</option>
              </select>
            </Field>
          </Grid>
        </Group>

        <Group title="Infill">
          <Field label="Density" unit={`${p().infillDensity} %`}>
            <input type="range" class="panel-range" min="0" max="100" step="5" value={p().infillDensity} aria-label="Infill density" onInput={(event) => gen.setPrinter({ infillDensity: parseInt(event.currentTarget.value) })} />
          </Field>
          <Field label="Pattern">
            <select class={INPUT} value={p().infillPattern} onChange={(event) => gen.setPrinter({ infillPattern: event.currentTarget.value as Pattern })}>
              <For each={PATTERNS}>{([value, text]) => <option value={value}>{text}</option>}</For>
            </select>
          </Field>
        </Group>

        <Group title="Supports and adhesion">
          <Field label="Supports">
            <Segmented
              label="Supports" value={p().supportType}
              options={[["none", "None"], ["minimal", "Plate only"], ["full", "Everywhere"]]}
              onChange={(value) => gen.setPrinter({ supportType: value })}
            />
          </Field>
          <Show when={supportsOn()}>
            <Grid>
              <ExtraNumber label="Overhang angle" unit="deg" key="supportAngle" step="5" />
              <ExtraNumber label="Density" unit="%" key="supportDensity" step="5" />
              <ExtraNumber label="Gap to part" unit="mm" key="supportXYGap" zero step="0.1" />
              <ExtraNumber label="Gap above" unit="layers" key="supportZGap" int zero />
            </Grid>
          </Show>
          <Field label="Adhesion">
            <Segmented
              label="Adhesion" value={p().adhesion}
              options={[["none", "None"], ["skirt", "Skirt"], ["brim", "Brim"], ["raft", "Raft"]]}
              onChange={(value) => gen.setPrinter({ adhesion: value })}
            />
          </Field>
          <Show when={p().adhesion === "brim"}><ExtraNumber label="Brim width" unit="mm" key="brimWidth" step="1" /></Show>
          <Show when={p().adhesion === "raft"}><ExtraNumber label="Raft layers" key="raftLayers" int /></Show>
          <Show when={p().adhesion === "skirt"}>
            <Grid>
              <ExtraNumber label="Loops" key="skirtLoops" int />
              <ExtraNumber label="Distance" unit="mm" key="skirtDistance" zero />
            </Grid>
          </Show>
        </Group>

        <Group title="Speed and cooling">
          <Grid>
            <SettingNumber label="Print speed" unit="mm/s" key="printSpeed" />
            <ExtraNumber label="Travel" unit="mm/s" key="travelSpeed" />
            <ExtraNumber label="First layer" unit="%" key="firstLayerSpeed" />
            <ExtraNumber label="Outer wall" unit="%" key="outerWallSpeed" />
            <ExtraNumber label="Infill" unit="%" key="infillSpeed" />
            <ExtraNumber label="Bridges" unit="%" key="bridgeSpeed" />
          </Grid>
          <Grid>
            <ExtraNumber label="Fan" unit="%" key="fanSpeed" zero step="5" />
            <ExtraNumber label="Fan from layer" key="fanFromLayer" int />
            <ExtraNumber label="Min layer time" unit="s" key="minLayerTime" zero />
            <ExtraNumber label="Flow" unit="%" key="flow" />
          </Grid>
        </Group>

        <Group title="Temperatures">
          <Grid>
            <SettingNumber label="Nozzle" unit="deg C" key="printTemperature" zero />
            <SettingNumber label="Bed" unit="deg C" key="bedTemperature" zero />
          </Grid>
        </Group>

        <Group title="Retraction">
          <Grid>
            <ExtraNumber label="Distance" unit="mm" key="retractionDistance" zero step="0.5" />
            <ExtraNumber label="Speed" unit="mm/s" key="retractionSpeed" />
            <ExtraNumber label="Shortest travel" unit="mm" key="retractMinTravel" zero step="0.5" />
            <ExtraNumber label="Z hop" unit="mm" key="zHop" zero step="0.1" />
          </Grid>
        </Group>

        <Group title="Firmware">
          <Grid>
            <Field label="Dialect">
              <select class={INPUT} value={p().flavor} onChange={(event) => gen.setPrinter({ flavor: event.currentTarget.value as PrinterExtras["flavor"] })}>
                <option value="marlin">Marlin</option><option value="klipper">Klipper</option><option value="reprap">RepRapFirmware</option>
              </select>
            </Field>
            <ExtraNumber label="Pressure advance" key="pressureAdvance" zero step="0.01" />
            <ExtraNumber label="Acceleration" unit="mm/s2" key="acceleration" zero step="100" />
          </Grid>
          <CheckRow id="print-relative-e" checked={p().relativeExtrusion} onChange={(checked) => gen.setPrinter({ relativeExtrusion: checked })}>Relative extruder moves (M83)</CheckRow>
          <details>
            <summary class="panel-hint" style={{ cursor: "pointer" }}>Start and end G-code</summary>
            <div class="panel-group" style={{ "margin-top": "6px" }}>
              <Field label="Start" hint="Replaces the built-in block. {nozzle} {bed} {layer} are filled in.">
                <textarea class={INPUT} rows="4" spellcheck={false} value={p().startGcode ?? ""} onChange={(event) => gen.setPrinter({ startGcode: event.currentTarget.value.trim() === "" ? undefined : event.currentTarget.value } as Partial<PrinterExtras>)} />
              </Field>
              <Field label="End">
                <textarea class={INPUT} rows="4" spellcheck={false} value={p().endGcode ?? ""} onChange={(event) => gen.setPrinter({ endGcode: event.currentTarget.value.trim() === "" ? undefined : event.currentTarget.value } as Partial<PrinterExtras>)} />
              </Field>
            </div>
          </details>
        </Group>
      </Section>
    </Show>
  )
}

/** What the material names mean to the slicer: the filament grades and their usual temperatures. */
export const FILAMENT_GRADES = cam.print.FILAMENTS
