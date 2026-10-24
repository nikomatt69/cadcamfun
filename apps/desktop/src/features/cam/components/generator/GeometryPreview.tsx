import { type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import { geometryExample } from "../../lib/generator-preview.ts"
import { ExamplePreview } from "./ExamplePreview.tsx"

const mm = (value: number): string => Number(value.toFixed(3)).toString()

export function RectanglePreview(props: { readonly width: number; readonly height: number; readonly depth: number }): JSX.Element {
  return <ExamplePreview title={t("cam.generator.preview.geometry")} testId="geometry-preview"
    detail={`${mm(props.width)} × ${mm(props.height)} × ${mm(props.depth)} mm`}
    model={geometryExample("rectangle", props.width, props.height, props.depth)} />
}
export function CirclePreview(props: { readonly radius: number; readonly depth: number }): JSX.Element {
  return <ExamplePreview title={t("cam.generator.preview.geometry")} testId="geometry-preview"
    detail={`Ø ${mm(props.radius * 2)} × ${mm(props.depth)} mm`}
    model={geometryExample("circle", props.radius * 2, props.radius * 2, props.depth)} />
}
export function PolygonPreview(props: { readonly sides: number; readonly radius: number; readonly depth: number }): JSX.Element {
  return <ExamplePreview title={t("cam.generator.preview.geometry")} testId="geometry-preview"
    detail={t("cam.generator.preview.polygon", { sides: props.sides, diameter: mm(props.radius * 2), depth: mm(props.depth) })}
    model={geometryExample("polygon", props.radius * 2, props.radius * 2, props.depth, props.sides)} />
}
