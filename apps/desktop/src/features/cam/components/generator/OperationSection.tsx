import { For, Match, Show, Switch, createEffect, createSignal, on, type JSX } from "solid-js"
import { Cpu, LoaderCircle, Play } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { boundsRows, depthForSelection, dimensionRows, elementSummary, stockForSelection, stockRows, type CadElement } from "../../lib/job.ts"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useGeneratorStore, type GeometryType } from "../../store/generatorStore.ts"
import { CirclePreview, PolygonPreview, RectanglePreview } from "./GeometryPreview.tsx"
import { OperationExample } from "./ExamplePreview.tsx"
import { OperationExamples } from "./OperationExamples.tsx"
import { Field, INPUT, LABEL, Note, NumberField, Section, Segmented } from "./ui.tsx"
import { t, type Key } from "../../../../i18n/index.ts"
import { CadElementPicker } from "./CadElementPicker.tsx"
import StrategyPalette, {
  paletteToCoreOperation,
  type MachineFamily
} from "./StrategyPalette.tsx"
import { KernelOperationControls } from "./KernelSection.tsx"

const BTN_BLUE = "panel-btn"
const BTN_GREEN = "panel-btn"

/** "Machining Depth (mm)" box of the selected-element panels. */
function DepthBox(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <div class="mt-3">
      <Field label={t("cam.gen.op.machiningDepth")} unit="mm">
        <NumberField label={t("cam.gen.op.machiningDepth")} step="0.1" value={gen.settings.depth} onValue={(value) => gen.updateSettings("depth", value)} />
      </Field>
    </div>
  )
}

/** "Use XY Dimensions" / "Use 3D Depth" buttons. */
function UseButtons(props: { readonly element: CadElement }): JSX.Element {
  const gen = useGeneratorStore()
  const e = () => props.element
  const threeD = () => ["cube", "sphere", "cylinder", "cone"].includes(String(e()["type"]))
  return (
    <div class="mt-3 panel-grid panel-grid--2">
      <button
        type="button"
        class={BTN_BLUE}
        onClick={() => {
          const el = e()
          if (el["type"] === "rectangle") gen.setRectangle(el["width"], el["height"])
          else if (el["type"] === "circle") gen.setCircleRadius(el["radius"])
          else if (el["type"] === "polygon" && el["sides"] && el["radius"]) gen.setPolygon(el["sides"], el["radius"])
          gen.flash("Dimensions applied from CAD")
        }}
      >
        {t("cam.gen.op.useXY")}
      </button>
      <Show when={threeD()}>
        <button
          type="button"
          class={BTN_GREEN}
          onClick={() => {
            const el = e()
            if (el["type"] === "cube") gen.updateSettings("depth", el["depth"])
            else if (el["type"] === "sphere") gen.updateSettings("depth", el["radius"] * 2)
            else gen.updateSettings("depth", el["height"])
            gen.flash("Depth updated from 3D geometry")
          }}
        >
          Use 3D Depth
        </button>
      </Show>
    </div>
  )
}

/** The printer's part: what is printed is the solid the CAD has selected (or every solid of the drawing when nothing is selected). */
function PrinterElementSelection(): JSX.Element {
  const job = useJob()
  return (
    <div class="panel-group">
      <h4 class="panel-group__title">{t("cad.drawing.part")}</h4>
      <CadElementPicker />
      <Show when={job.element()} fallback={<Note kind="warn">{t("cam.generator.selectCadElementHint")}</Note>}>
        {(element) => (
          <Note kind="ok">
            <strong>{String(element()["type"])}</strong> {String(element()["name"] ?? "") || String(element()["id"]).substring(0, 6)}
            <Show when={job.selection().length > 1}> and {job.selection().length - 1} more</Show>
            <div class="panel-hint">{elementSummary(element())}</div>
          </Note>
        )}
      </Show>
    </div>
  )
}

/** The mill and lathe's selected-element panel with its dimension rows. */
function SelectedElementPanel(): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const cad = useCADStore()
  const camStore = useCamStore()
  // The raw piece follows the selection: every selected part fits inside it, plus the allowance.
  createEffect(() => {
    if (!camStore.stockFollowsSelection) return
    const parts = job.selection()
    const allowance = camStore.stockAllowance
    const next = stockForSelection(parts, job.stock(), allowance)
    if (next === undefined) return
    const now = cad.workpiece
    const same = now.configured && now.width === next.width && now.height === next.height && now.depth === next.depth
      && now.x === next.x && now.y === next.y && now.topZ === next.topZ && now.allowance === next.allowance
    if (same) return
    cad.setWorkpiece({
      ...now, configured: true, width: next.width, height: next.height, depth: next.depth, x: next.x, y: next.y,
      topZ: next.topZ, allowance, radius: next.radius ?? 0, ...(parts.length === 1 && parts[0]?.["id"] ? { elementId: String(parts[0]["id"]) } : { elementId: undefined })
    })
  })
  return (
    <div class="panel-group">
      <CadElementPicker />
      <Show when={job.element()} fallback={<Note kind="warn">{t("cam.generator.selectCadElementHint")}</Note>}>
        {(element) => {
          const rows = () => dimensionRows(element(), gen.settings.depth)
          const part = () => boundsRows(element())
          const stock = () => stockRows(job.stock(), gen.settings.depth)
          // Selecting an element sets the machining depth from its own height.
          createEffect(on(() => element()["id"], () => {
            const depth = depthForSelection(element(), gen.settings.depth)
            if (depth !== gen.settings.depth) gen.updateSettings("depth", depth)
          }))
          return (
            <div class="panel-group">
              <p class="panel-group__title">
                Selected Element: {String(element()["type"])} (ID: {String(element()["id"]).substring(0, 6)}...)
                <Show when={job.selection().length > 1}> and {job.selection().length - 1} more</Show>
              </p>
              <div class="panel-group">
                <p class="panel-group__title">{t("cam.gen.op.elementDims")}</p>
                <Show when={rows().length > 0} fallback={<p class="panel-hint">{t("cam.gen.op.elementDetails")}</p>}>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                    <For each={rows().slice(0, -1)}>
                      {([label, value]) => (
                        <div class="flex justify-between gap-3"><span class="text-[color:var(--panel-text-muted)]">{label}</span><span class="tabular-nums">{value}</span></div>
                      )}
                    </For>
                    <div class="col-span-2 mt-1 flex justify-between gap-3 border-t border-[color:var(--panel-border)] pt-2">
                      <span class="text-[color:var(--panel-text-muted)]">{t("cam.gen.op.machiningDepthColon")}</span>
                      <span class="font-semibold tabular-nums text-[color:var(--panel-text)]">{gen.settings.depth} {t("cad.millimeters")}</span>
                    </div>
                  </div>
                </Show>
              </div>
              <Show when={part().length > 0}>
                <div class="panel-group" data-testid="part-size">
                  <p class="panel-group__title">{t("cam.gen.op.partSize")}</p>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                    <For each={part()}>{([label, value]) => <div class="flex justify-between gap-3"><span class="text-[color:var(--panel-text-muted)]">{label}</span><span class="tabular-nums">{value}</span></div>}</For>
                  </div>
                </div>
              </Show>
              <div class="panel-group" data-testid="stock-size">
                <p class="panel-group__title">{t("cam.gen.op.stockColon")}</p>
                <label class="panel-check">
                  <input type="checkbox" checked={camStore.stockFollowsSelection} onChange={(event) => camStore.setStockFollowsSelection(event.currentTarget.checked)} />
                  {t("cam.gen.op.stockFollows")}
                </label>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
                  <For each={stock()}>{([label, value]) => <div class="flex justify-between gap-3"><span class="text-[color:var(--panel-text-muted)]">{label}</span><span class="tabular-nums">{value}</span></div>}</For>
                </div>
              </div>
              <DepthBox />
              <UseButtons element={element()} />
            </div>
          )
        }}
      </Show>
    </div>
  )
}

function ThicknessField(props: { readonly class?: string }): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <div class={props.class}>
      <label class={LABEL}>{t("cam.gen.op.thicknessZ")}</label>
      <NumberField min="0.1" step="0.1" value={gen.settings.depth} onValue={(value) => gen.updateSettings("depth", value)} />
    </div>
  )
}

const SAMPLE = [
  "; Sample G-code", "G0 Z5 ; Safe position", "G0 X0 Y0 ; Move to origin", "G1 Z-1 F100 ; Lower to a depth of 1 mm",
  "G1 X10 Y0 F200 ; Move to X=10mm", "G1 X10 Y10 F200 ; Move to Y=10mm", "G1 X0 Y10 F200 ; Move to X=0mm", "G1 X0 Y0 F200 ; Return to origin",
  "G0 Z5 ; Return to safe position", ""
].join("\n")

const PROBE_CYCLES: ReadonlyArray<{ readonly value: typeof cam.generator.DEFAULT_SETTINGS.probeCycle; readonly label: Key }> = [
  { value: "zSurface", label: "cam.gen.op.zeroZTop" }, { value: "edgeX", label: "cam.gen.op.zeroXEdge" }, { value: "edgeY", label: "cam.gen.op.zeroYEdge" },
  { value: "corner", label: "cam.gen.op.zeroXYCorner" }, { value: "bore", label: "cam.gen.op.zeroBore" }, { value: "boss", label: "cam.gen.op.zeroBoss" },
  { value: "toolLength", label: "cam.gen.op.toolLengthSetter" }
]

/** The touch probe / tool setter: which cycle, how it approaches, the stylus, and the dialect of the control. */
/** The 3D surface strategies (the surface engine over the selected solids); roughing is followed by the finishing pass of the Advanced section. */
function SurfaceSettings(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  const raster = () => s().surfaceStrategy === "parallel" || s().surfaceStrategy === "steep-shallow" || (s().surfaceStrategy === "roughing" && s().finishingPass && s().finishingStrategy !== "contour")
  return (
    <div class="panel-group" data-testid="surface-settings">
      <div class="panel-field">
        <label class={LABEL}>{t("cam.gen.op.surfaceStrategy")}</label>
        <select class={INPUT} aria-label={t("cam.gen.op.surfaceStrategy")} value={s().surfaceStrategy} onChange={(event) => gen.updateSettings("surfaceStrategy", event.currentTarget.value as typeof gen.settings.surfaceStrategy)}>
          <option value="roughing">{t("cam.gen.op.stratRough")}</option>
          <option value="parallel">{t("cam.gen.op.stratParallel")}</option>
          <option value="waterline">{t("cam.gen.op.stratWaterline")}</option>
          <option value="steep-shallow">{t("cam.gen.op.stratSteepShallow")}</option>
          <option value="scallop">{t("cam.gen.op.stratScallop")}</option>
          <option value="spiral">{t("cam.gen.op.stratSpiral")}</option>
          <option value="radial">{t("cam.gen.op.stratRadial")}</option>
          <option value="flat">{t("cam.gen.op.stratFlats")}</option>
        </select>
      </div>
      <Show when={s().surfaceStrategy === "steep-shallow"}>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.steepAbove")}</label><NumberField min="5" max="85" step="1" value={s().steepAngle} onValue={(value) => gen.updateSettings("steepAngle", value)} /></div>
      </Show>
      <Show when={s().surfaceStrategy === "roughing"}>
        <div class="panel-field">
          <label class={LABEL}>{t("cam.gen.op.clearing")}</label>
          <select class={INPUT} aria-label={t("cam.gen.op.clearing")} value={s().surfaceClearing} onChange={(event) => gen.updateSettings("surfaceClearing", event.currentTarget.value as typeof gen.settings.surfaceClearing)}>
            <option value="contour">{t("cam.gen.op.clearContour")}</option>
            <option value="adaptive">{t("cam.gen.op.clearAdaptive")}</option>
          </select>
        </div>
        <Show when={s().surfaceClearing === "adaptive"}>
          <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.radialEngagement")}</label><NumberField min="1" max="50" step="1" value={s().adaptiveEngagement} onValue={(value) => gen.updateSettings("adaptiveEngagement", value)} /></div>
        </Show>
      </Show>
      <Show when={s().surfaceStrategy === "scallop" || s().surfaceStrategy === "spiral" || s().surfaceStrategy === "radial"}>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.cuspHeight")}</label><NumberField min="0" step="0.005" value={s().scallop} onValue={(value) => gen.updateSettings("scallop", value)} /></div>
      </Show>
      <Show when={raster()}>
        <div class="grid grid-cols-2 gap-3">
          <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.rasterAngle")}</label><NumberField step="1" value={s().rasterAngle} onValue={(value) => gen.updateSettings("rasterAngle", value)} /></div>
          <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.cuspHeight")}</label><NumberField min="0" step="0.005" value={s().scallop} onValue={(value) => gen.updateSettings("scallop", value)} /></div>
        </div>
        <label class="panel-check">
          <input type="checkbox" checked={s().rasterOneWay} onChange={(event) => gen.updateSettings("rasterOneWay", event.currentTarget.checked)} />
          {t("cam.gen.op.sameDirection")}
        </label>
      </Show>
      <p class="panel-hint">The selected solids are cut as one part: undercuts, holes and boolean results included. A ball nose cutter follows the surface exactly; a cusp height of 0 uses the stepover instead. Turn on the finishing pass to leave material in the roughing and finish it afterwards.</p>
    </div>
  )
}

function ThreadSettings(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  return (
    <div class="panel-group" data-testid="thread-settings">
      <p class="panel-hint">The selected circle or cylinder is the hole (or boss) to thread; its diameter is the nominal diameter, the depth is the thread length.</p>
      <div class="grid grid-cols-2 gap-3">
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.pitch")}</label><NumberField min="0.05" step="0.05" value={s().threadPitch} onValue={(value) => gen.updateSettings("threadPitch", value)} /></div>
        <div class="panel-field">
          <label class={LABEL}>{t("cad.toolpanel.tool.thread")}</label>
          <select class={INPUT} aria-label={t("cam.gen.op.threadType")} value={s().threadType} onChange={(event) => gen.updateSettings("threadType", event.currentTarget.value as typeof gen.settings.threadType)}>
            <option value="internal">{t("cam.gen.op.internal")}</option>
            <option value="external">{t("cam.gen.op.external")}</option>
          </select>
        </div>
        <div class="panel-field">
          <label class={LABEL}>{t("cam.gen.op.hand")}</label>
          <select class={INPUT} aria-label={t("cam.gen.op.threadHand")} value={s().threadHand} onChange={(event) => gen.updateSettings("threadHand", event.currentTarget.value as typeof gen.settings.threadHand)}>
            <option value="right">{t("cam.gen.op.rightHand")}</option>
            <option value="left">{t("cam.gen.op.leftHand")}</option>
          </select>
        </div>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.radialPasses")}</label><NumberField min="1" max="20" step="1" value={s().threadPasses} onValue={(value) => gen.updateSettings("threadPasses", Math.round(value))} /></div>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.springPasses")}</label><NumberField min="0" max="5" step="1" value={s().threadSpringPasses} onValue={(value) => gen.updateSettings("threadSpringPasses", Math.round(value))} /></div>
      </div>
    </div>
  )
}

function ProbeSettings(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  return (
    <div class="panel-group" data-testid="probe-settings">
      <div class="panel-field">
        <label class={LABEL}>{t("cam.gen.op.probeCycle")}</label>
        <select class={INPUT} aria-label={t("cam.gen.op.probeCycle")} value={s().probeCycle} onChange={(event) => gen.updateSettings("probeCycle", event.currentTarget.value as typeof gen.settings.probeCycle)}>
          <For each={PROBE_CYCLES}>{(cycle) => <option value={cycle.value}>{t(cycle.label)}</option>}</For>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.probeFeed")}</label><NumberField min="1" value={s().probeFeed} onValue={(value) => gen.updateSettings("probeFeed", value)} /></div>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.searchDistance")}</label><NumberField min="0.1" step="0.5" value={s().probeSearch} onValue={(value) => gen.updateSettings("probeSearch", value)} /></div>
        <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.stylusTip")}</label><NumberField min="0.1" step="0.1" value={s().probeStylus} onValue={(value) => gen.updateSettings("probeStylus", value)} /></div>
        <Show when={s().probeCycle === "bore" || s().probeCycle === "boss"}>
          <div class="panel-field"><label class={LABEL}>{t("cam.gen.op.nominalDia")}</label><NumberField min="0.1" step="0.5" value={s().probeFeatureSize} onValue={(value) => gen.updateSettings("probeFeatureSize", value)} /></div>
        </Show>
      </div>
      <div class="panel-field">
        <label class={LABEL}>{t("cam.gen.op.controlDialect")}</label>
        <select class={INPUT} aria-label={t("cam.gen.op.probeDialect")} value={s().probeDialect} onChange={(event) => gen.updateSettings("probeDialect", event.currentTarget.value as "linuxcnc" | "fanuc")}>
          <option value="linuxcnc">{t("cam.gen.op.dialectLinux")}</option>
          <option value="fanuc">{t("cam.gen.op.dialectFanuc")}</option>
        </select>
      </div>
      <div class="panel-field">
        <p class="panel-hint">{t("cam.probing.openPanelHint")}</p>
        <button type="button" class="panel-btn panel-btn--fit" data-testid="open-probing-panel" onClick={() => useCamStore.getState().setRightTab("probing")}>{t("cam.probing.openPanel")}</button>
      </div>
      <p class="panel-hint">The spindle stays off. The result is written to work offset {s().workOffset}; the stylus is a ball, so contact is half its diameter before the surface and the cycle corrects for it.</p>
    </div>
  )
}

/** "Operation": which operation, and what it works on (own geometry, a selected element, or a custom path). */
export function OperationSection(): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const [paletteCell, setPaletteCell] = createSignal<string>()
  const info = () => cam.generator.getOperationDescription(gen.settings.operationType)
  const operation = (event: Event & { currentTarget: HTMLSelectElement }): void =>
    gen.updateSettings("operationType", event.currentTarget.value as typeof gen.settings.operationType)
  const machineFamily = (): MachineFamily =>
    gen.settings.machineType === "lathe" ? "lathe" : gen.settings.machineType === "3dprinter" ? "3dprinter" : "mill"
  /** Receive a palette cell id, and apply the underlying `operationType` the core schema understands.
   *  Multi-axis and advanced drilling variants resolve to the closest supported core op while
   *  still being visible in the palette as Fusion-class strategies. */
  const handlePaletteSelect = (paletteId: string): void => {
    setPaletteCell(paletteId)
    const target = paletteToCoreOperation(machineFamily(), paletteId)
    if (target === gen.settings.operationType) {
      // Even if the core op is the same, persist a hint so the assistant / multi-toolpath can
      // observe which Fusion-style cell was the user's first selection.
      gen.updateSettings("operationType", gen.settings.operationType)
      return
    }
    gen.updateSettings("operationType", target as typeof gen.settings.operationType)
  }
  return (
    <Section id="operation" icon={Play} title={t("cam.operations.current")} summary={info().title} testId="operation-section">
      <div class="panel-field">
        <label class={LABEL}>{t("cam.operation")}</label>
        <Switch>
          <Match when={gen.settings.machineType === "mill" || gen.settings.machineType === "lathe"}>
            <StrategyPalette
              family={machineFamily() === "3dprinter" ? "mill" : machineFamily()}
              activeOperation={gen.settings.operationType}
              onSelect={handlePaletteSelect}
            />
          </Match>
          <Match when={gen.settings.machineType === "3dprinter"}>
            <div class="panel-group">
              <Segmented
                label={t("cam.gen.op.printOperation")} testId="print-operations" value={gen.settings.operationType as string}
                options={[["standard", "Standard"], ["vase", "Vase"], ["support", "Support"], ["infill", "Solid"], ["raft", "Raft"], ["brim", "Brim"]]}
                onChange={(value) => gen.updateSettings("operationType", value as typeof gen.settings.operationType)}
              />
              <PrinterElementSelection />
            </div>
          </Match>
        </Switch>
      </div>

      <OperationExample />

      <OperationExamples cell={paletteCell()} />

      <Show when={gen.settings.machineType === "mill" && gen.settings.operationType === "probing"}>
        <ProbeSettings />
      </Show>

      <Show when={gen.settings.machineType === "mill" && gen.settings.operationType === "threading"}>
        <ThreadSettings />
      </Show>

      <Show when={gen.settings.machineType === "mill" && gen.settings.operationType === "3d_surface"}>
        <SurfaceSettings />
      </Show>

      <Show when={gen.settings.machineType === "lathe"}>
        <SelectedElementPanel />
      </Show>

      <Show when={gen.settings.machineType === "mill"}>
        <div class="panel-field">
          <label class={LABEL}>{t("cam.gen.op.geometryType")}</label>
          <select class={INPUT} value={gen.geometryType} onChange={(event) => gen.setGeometryType(event.currentTarget.value as GeometryType, job.element())}>
            <option value="rectangle">{t("cad.rectangle")}</option>
            <option value="circle">{t("cad.circle")}</option>
            <option value="polygon">{t("cad.polygon")}</option>
            <option value="selected">{t("cam.gen.op.fromSelected")}</option>
            <option value="custom">{t("cam.gen.op.custom")}</option>
          </select>
        </div>

        <Show when={gen.geometryType === "selected"}>
          <SelectedElementPanel />
        </Show>

        <Show when={gen.geometryType === "rectangle"}>
          <div class="grid grid-cols-2 gap-4">
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.op.widthX")}</label>
              <NumberField min="1" value={gen.rectangleWidth} onValue={(value) => gen.setRectangle(value, undefined)} />
            </div>
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.op.heightY")}</label>
              <NumberField min="1" value={gen.rectangleHeight} onValue={(value) => gen.setRectangle(undefined, value)} />
            </div>
            <ThicknessField class="col-span-2" />
          </div>
          <RectanglePreview width={gen.rectangleWidth} height={gen.rectangleHeight} depth={gen.settings.depth} />
        </Show>

        <Show when={gen.geometryType === "circle"}>
          <div class="grid grid-cols-2 gap-4">
            <div class="panel-field">
              <label class={LABEL}>{t("cad.drawing.radius")}</label>
              <NumberField min="1" value={gen.circleRadius} onValue={(value) => gen.setCircleRadius(value)} />
            </div>
            <ThicknessField />
          </div>
          <CirclePreview radius={gen.circleRadius} depth={gen.settings.depth} />
        </Show>

        <Show when={gen.geometryType === "polygon"}>
          <div class="grid grid-cols-2 gap-4">
            <div class="panel-field">
              <label class={LABEL}>{t("cam.gen.op.sides")}</label>
              <NumberField min="3" max="20" int accept={(value) => value >= 3} value={gen.polygonSides} onValue={(value) => gen.setPolygon(value, undefined)} />
            </div>
            <div class="panel-field">
              <label class={LABEL}>{t("cad.drawing.radius")}</label>
              <NumberField min="1" value={gen.polygonRadius} onValue={(value) => gen.setPolygon(undefined, value)} />
            </div>
            <ThicknessField class="col-span-2" />
          </div>
          <PolygonPreview sides={gen.polygonSides} radius={gen.polygonRadius} depth={gen.settings.depth} />
        </Show>

        <Show when={gen.geometryType === "custom"}>
          <div class="panel-field">
            <label class={LABEL}>G-code Custom</label>
            <div class="relative">
              <textarea
                class={`${INPUT} font-mono`}
                rows={8}
                value={gen.customPath}
                onInput={(event) => gen.setCustomPath(event.currentTarget.value)}
                placeholder={t("cam.gen.op.customGcodePlaceholder")}
              />
              <Show when={gen.settings.useAI && !gen.isAIProcessing}>
                <button
                  type="button"
                  class="panel-icon-btn absolute right-1.5 top-1.5 border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-bg)]"
                  title={t("cam.generateAi")}
                  onClick={() => {
                    const s = gen.settings
                    gen.setAIProcessing(true)
                    setTimeout(() => {
                      gen.setCustomPath(
                        "; AI-generated G-code\n" +
                        "G0 Z10 ; Safe position\n" +
                        "G0 X0 Y0 ; Initial position\n" +
                        `G1 Z-${s.depth / 2} F${s.plungerate} ; First depth\n` +
                        `G1 X10 Y10 F${s.feedrate} ; Linear move\n` +
                        `G2 X20 Y0 I0 J-10 F${s.feedrate} ; Clockwise arc\n` +
                        `G1 X0 Y0 F${s.feedrate} ; Return to origin\n` +
                        "G0 Z10 ; Safe position\n"
                      )
                      gen.setAIProcessing(false)
                    }, 2000)
                  }}
                >
                  <Cpu size={14} />
                </button>
              </Show>
              <Show when={gen.isAIProcessing}>
                <div class="absolute top-2 right-2 p-1">
                  <LoaderCircle size={16} class="animate-spin text-[color:var(--panel-text-muted)]" aria-hidden="true" />
                </div>
              </Show>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-4">
              <div class="flex justify-start">
                <button type="button" class="panel-btn" onClick={() => gen.setCustomPath(SAMPLE)}>{t("cam.gen.op.insertExample")}</button>
              </div>
              <ThicknessField />
            </div>
          </div>
        </Show>
      </Show>
      <KernelOperationControls />
    </Section>
  )
}
