/**
 * The generator's contextual diagrams: origin reference, geometry and the operation in 3D. They project real
 * model-space scenes through one bounded camera and sit in the shared preview viewport (`PreviewStage`).
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import { operationExample, projectExample, type PreviewScene } from "../../lib/generator-preview.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { PreviewStage } from "./PreviewStage.tsx"

type Point = readonly [number, number]
const pointsOf = (points: string): Point[] => points.split(" ").map((pair) => {
  const [x, y] = pair.split(",")
  return [Number(x), Number(y)]
})
const longestLine = (lines: ReadonlyArray<{ readonly points: string; readonly kind?: string }>): { readonly points: string; readonly kind?: string } | undefined =>
  lines.filter((line) => line.kind === undefined || line.kind === "path").reduce<{ readonly points: string; readonly kind?: string } | undefined>(
    (best, line) => best === undefined || line.points.length > best.points.length ? line : best,
    undefined
  )

/**
 * The drawing alone, without the caption and the frame: the projected scene of `ExamplePreview`, also used at thumbnail size by
 * the operation examples. A `mini` drawing keeps its strokes at screen width instead of shrinking them with the viewBox.
 */
export function SceneDrawing(props: {
  readonly model: PreviewScene
  readonly label: string
  readonly variant?: "origin" | "geometry" | "operation" | undefined
  readonly mini?: boolean | undefined
}): JSX.Element {
  const view = createMemo(() => projectExample(props.model))
  const path = createMemo(() => props.variant === "operation" ? longestLine(view().lines) : undefined)
  const start = createMemo(() => {
    const line = path()
    return line === undefined ? undefined : pointsOf(line.points)[0]
  })
  const end = createMemo(() => {
    const line = path()
    if (line === undefined) return undefined
    const points = pointsOf(line.points)
    const last = points.at(-1)
    const previous = points.at(-2)
    return last === undefined || previous === undefined ? undefined : { point: last, angle: Math.atan2(last[1] - previous[1], last[0] - previous[0]) * 180 / Math.PI }
  })
  const stroke = (width: string): JSX.CSSProperties | undefined => props.mini === true ? { "stroke-width": width, "vector-effect": "non-scaling-stroke" } : undefined
  return (
    <svg viewBox="0 0 320 154" role="img" aria-label={props.label} style={props.mini === true ? { height: "100%" } : undefined}>
      <g class={`panel-preview__scene panel-preview__scene--${props.variant ?? "operation"}`}>
        <For each={view().faces}>
          {(face) => <polygon points={face.points} class={`panel-preview__face panel-preview__face--${face.shade}`} stroke-linejoin="round" style={stroke("0.6px")} />}
        </For>
        <For each={view().lines}>
          {(line) => <polyline points={line.points} pathLength={line.kind === "axis" ? undefined : 1} class={`panel-preview__line panel-preview__line--${line.kind ?? "path"}`} fill="none" stroke-linejoin="round" stroke-linecap="round" style={stroke("1.1px")} />}
        </For>
        <Show when={view().marker}>
          {(point) => (
            <g class="panel-preview__origin" data-testid="preview-origin-marker" transform={`translate(${point()[0]},${point()[1]})`}>
              <circle r="6" class="panel-preview__halo" />
              <circle r="2.5" />
              <text x="9" y="-8">{t("cam.generator.preview.zero")}</text>
            </g>
          )}
        </Show>
        <Show when={props.variant === "operation" && start()}>
          {(point) => (
            <g class="panel-preview__start" transform={`translate(${point()[0]},${point()[1]})`}>
              <circle r="4.2" class="panel-preview__start-ring" />
              <circle r="1.5" />
            </g>
          )}
        </Show>
        <Show when={props.variant === "operation" && end()}>
          {(tail) => (
            <path
              d="M-4 -3 L1 0 L-4 3"
              class="panel-preview__chevron"
              transform={`translate(${tail().point[0]},${tail().point[1]}) rotate(${tail().angle})`}
            />
          )}
        </Show>
        <Show when={props.model.lines.some((line) => line.kind === "axis")}>
          <For each={view().lines.filter((line) => line.kind === "axis")}>
            {(line, index) => {
              const tail = pointsOf(line.points).at(-1)
              return tail === undefined ? undefined : <text class="panel-preview__axis" x={tail[0] + 4} y={tail[1] - 4}>{["X", "Y", "Z"][index()]}</text>
            }}
          </For>
        </Show>
      </g>
    </svg>
  )
}

/** SVG projects real model-space geometry without allocating another viewport or a render loop. */
export function ExamplePreview(props: {
  readonly model: PreviewScene
  readonly title: string
  readonly detail?: string | undefined
  readonly example?: boolean | undefined
  readonly testId?: string | undefined
  readonly variant?: "origin" | "geometry" | "operation" | undefined
  readonly chip?: string | undefined
}): JSX.Element {
  const detail = (): string | undefined => props.example === true ? t("cam.generator.preview.example") : props.detail
  const label = (): string => [props.title, detail(), props.chip].filter((value): value is string => value !== undefined && value !== "").join(" · ")
  return (
    <PreviewStage title={props.title} detail={detail()} chip={props.chip} testId={props.testId} ariaLabel={label()}>
      <SceneDrawing model={props.model} label={label()} variant={props.variant} />
    </PreviewStage>
  )
}

export function OperationExample(): JSX.Element {
  const gen = useGeneratorStore()
  const model = createMemo(() => operationExample(gen.settings))
  const chip = createMemo(() => gen.settings.machineType === "3dprinter" ? `Ø ${gen.settings.nozzleDiameter}` : `Ø ${gen.settings.toolDiameter}`)
  return <ExamplePreview model={model()} title={t("cam.generator.preview.operation")} example testId="operation-example" variant="operation" chip={chip()} />
}
