import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import { operationExample, projectExample, type PreviewScene } from "../../lib/generator-preview.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"

/** SVG projects real model-space geometry without allocating another viewport or a render loop. */
export function ExamplePreview(props: { readonly model: PreviewScene; readonly title: string; readonly detail?: string; readonly example?: boolean; readonly testId?: string }): JSX.Element {
  const view = createMemo(() => projectExample(props.model))
  return (
    <figure class="panel-preview" data-testid={props.testId}>
      <figcaption class="panel-preview__caption">
        <span>{props.title}</span>
        <span class="panel-preview__detail">{props.example ? t("cam.generator.preview.example") : props.detail}</span>
      </figcaption>
      <svg viewBox="0 0 320 154" role="img" aria-label={[props.title, props.example ? t("cam.generator.preview.example") : props.detail].filter(Boolean).join(" · ")}>
        <For each={view().faces}>{(f) => <polygon points={f.points} class={`panel-preview__face panel-preview__face--${f.shade}`} stroke-linejoin="round" />}</For>
        <For each={view().lines}>{(l) => <polyline points={l.points} class={`panel-preview__line panel-preview__line--${l.kind ?? "path"}`} fill="none" stroke-linejoin="round" stroke-linecap="round" />}</For>
        <Show when={view().marker}>{(p) => <g class="panel-preview__origin" data-testid="preview-origin-marker" transform={`translate(${p()[0]},${p()[1]})`}>
          <circle r="6" class="panel-preview__halo" /><circle r="2.5" />
          <text x="9" y="-8">{t("cam.generator.preview.zero")}</text>
        </g>}</Show>
        <Show when={props.model.lines.some(l => l.kind === "axis")}>
          <For each={view().lines.filter(l => l.kind === "axis")}>{(l, i) => {
            const end = l.points.split(" ").at(-1)!.split(",")
            return <text class="panel-preview__axis" x={Number(end[0]) + 4} y={Number(end[1]) - 4}>{["X", "Y", "Z"][i()]}</text>
          }}</For>
        </Show>
      </svg>
    </figure>
  )
}

export function OperationExample(): JSX.Element {
  const gen = useGeneratorStore()
  const model = createMemo(() => operationExample(gen.settings))
  return <ExamplePreview model={model()} title={t("cam.generator.preview.operation")} example testId="operation-example" />
}
