/**
 * "Examples" of the operation section: a short list of runnable examples for the operation (or strategy cell) on the machine
 * the panel is set to. Each row is a miniature of the cut, its name and one line, the cutter and the material, and an "Apply"
 * button that loads the example's settings and its demo part into the generator (the data is `lib/examples/operations.ts`;
 * a test runs every example through the real generator).
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t } from "../../../../i18n/index.ts"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import { useLayerStore } from "../../../cad/store/layerStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import {
  examplesFor, exampleChip, exampleFilament, exampleMaterialKey, exampleSettings,
  type OperationExample
} from "../../lib/examples/operations.ts"
import { operationExample } from "../../lib/generator-preview.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { SceneDrawing } from "./ExamplePreview.tsx"

/** The marker the demo part carries in the drawing: the next example replaces it, and the element panel leaves the depth alone. */
export const EXAMPLE_MARK = "exampleId"

export type ApplyOutcome = "applied" | "part" | "no-layer"

/**
 * Loads an example into the generator. Its settings go in as a patch (everything else keeps its value), in three steps so the
 * panel's own rules (a new material loads its feeds, a new machine its defaults, a new operation its tool) cannot overwrite what
 * the example says: the machine and material first, the rest on top, then the exact values once more.
 *
 * A panel shape (rectangle, circle, polygon) or the NC text goes into the geometry fields. A demo part is added to the drawing and
 * selected, the CAD workpiece becomes its stock, and the stock stops following the selection (the example brings its own); the
 * demo part of an earlier example is removed first. A lathe works from the bar in the settings, so the selection is cleared:
 * external turning with a part selected would turn that part instead.
 */
export const applyOperationExample = (example: OperationExample): ApplyOutcome => {
  const gen = useGeneratorStore.getState()
  const shape = example.geometry
  const layers = useLayerStore.getState()
  if (shape.kind === "part" && !layers.layers.some((layer) => layer.id === layers.activeLayer)) {
    gen.flashError(t("cam.example.op.noLayer"))
    return "no-layer"
  }

  const patch = example.settings
  gen.patchSettings({
    ...(patch.machineType !== undefined ? { machineType: patch.machineType } : {}),
    ...(patch.material !== undefined ? { material: patch.material } : {})
  })
  gen.patchSettings(patch)
  gen.replaceSettings({ ...useGeneratorStore.getState().settings, ...patch })
  if (example.printer !== undefined) gen.setPrinter(example.printer)

  const elements = useElementsStore.getState()
  const selection = useSelectionStore.getState()
  switch (shape.kind) {
    case "rectangle": gen.setGeometryType("rectangle"); gen.setRectangle(shape.width, shape.height); break
    case "circle": gen.setGeometryType("circle"); gen.setCircleRadius(shape.radius); break
    case "polygon": gen.setGeometryType("polygon"); gen.setPolygon(shape.sides, shape.radius); break
    case "gcode": gen.setGeometryType("custom"); gen.setCustomPath(shape.text); break
    case "none":
      if (example.family === "lathe") { selection.clearSelection(); elements.selectElement(null) }
      break
    case "part": {
      for (const old of elements.elements.filter((element) => element[EXAMPLE_MARK] !== undefined)) elements.deleteElement(old.id)
      const ids = useElementsStore.getState().addElements(shape.elements.map((element) => ({
        ...element, id: `${example.id}:${String(element["id"])}`, name: String(element["id"]), [EXAMPLE_MARK]: example.id
      })))
      selection.selectMultiple(ids)
      useElementsStore.getState().selectElement(ids.at(-1) ?? null)
      const cad = useCADStore.getState()
      const { elementId: _linked, ...workpiece } = cad.workpiece
      cad.setWorkpiece({
        ...workpiece, configured: true, width: shape.stock.width, height: shape.stock.height, depth: shape.stock.depth,
        x: shape.stock.x, y: shape.stock.y, topZ: shape.stock.topZ, allowance: shape.stock.allowance, radius: 0
      })
      useCamStore.getState().setStockFollowsSelection(false)
      if (example.family !== "print") gen.setGeometryType("selected")
      break
    }
  }
  gen.flash(t(shape.kind === "part" ? "cam.example.op.appliedPart" : "cam.example.op.applied", { name: t(example.title) }), 4000)
  return shape.kind === "part" ? "part" : "applied"
}

function ExampleRow(props: { readonly example: OperationExample }): JSX.Element {
  const example = (): OperationExample => props.example
  const scene = createMemo(() => operationExample(exampleSettings(example())))
  const material = (): string => {
    const key = exampleMaterialKey(example())
    return key !== undefined ? t(key) : exampleFilament(example()) ?? ""
  }
  const hint = (): string | undefined => {
    const kind = example().geometry.kind
    return kind === "part" ? t("cam.example.op.partHint") : kind === "gcode" ? t("cam.example.op.gcodeHint") : undefined
  }
  return (
    <li class="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-3 border-b border-[color:var(--panel-border)] py-2 last:border-b-0" data-testid="operation-example-row" data-example={example().id}>
      <div class="panel-preview h-[58px] w-[104px]" aria-hidden="true">
        <SceneDrawing model={scene()} label={t(example().title)} variant="operation" mini />
      </div>
      <div class="grid min-w-0 gap-1">
        <p class="m-0 text-[12px] font-medium leading-4 text-[color:var(--panel-text)]">{t(example().title)}</p>
        <p class="m-0 text-[11px] leading-4 text-[color:var(--panel-text-muted)]">{t(example().description)}</p>
        <div class="mt-1 flex items-center justify-between gap-2">
          <span class="min-w-0 truncate text-[10.5px] tabular-nums text-[color:var(--panel-text-faint)]">{[material(), exampleChip(example())].filter((part) => part !== "").join(" · ")}</span>
          <button
            type="button"
            class="panel-btn shrink-0"
            title={hint()}
            aria-label={`${t("cam.example.op.apply")}: ${t(example().title)}`}
            data-testid="operation-example-apply"
            onClick={() => { applyOperationExample(example()) }}
          >
            {t("cam.example.op.apply")}
          </button>
        </div>
      </div>
    </li>
  )
}

/** The examples of the current operation; nothing when the operation has none. `cell` is the strategy cell the user last picked. */
export function OperationExamples(props: { readonly cell?: string | undefined }): JSX.Element {
  const gen = useGeneratorStore()
  const list = createMemo(() => examplesFor(gen.settings, props.cell))
  const [open, setOpen] = createSignal(true)
  return (
    <Show when={list().length > 0}>
      <div class="grid gap-1" data-testid="operation-examples" data-count={list().length}>
        <button
          type="button"
          class="flex h-7 w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[11px] font-semibold text-[color:var(--panel-text-muted)]"
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
        >
          <Show when={open()} fallback={<ChevronRight size={14} aria-hidden="true" />}><ChevronDown size={14} aria-hidden="true" /></Show>
          <span>{t("cam.example.op.heading")}</span>
          <span class="font-normal tabular-nums text-[color:var(--panel-text-faint)]">{list().length}</span>
        </button>
        <Show when={open()}>
          <ul class="m-0 max-h-[272px] list-none overflow-y-auto p-0" aria-label={t("cam.example.op.list")}>
            <For each={list()}>{(example) => <ExampleRow example={example} />}</For>
          </ul>
        </Show>
      </div>
    </Show>
  )
}

/** Which keys of the panel's settings an example changes: the rest of the panel is not touched. Exported for the tests. */
export const exampleKeys = (example: OperationExample): ReadonlyArray<keyof cam.generator.ToolpathSettings> =>
  Object.keys(example.settings) as Array<keyof cam.generator.ToolpathSettings>
