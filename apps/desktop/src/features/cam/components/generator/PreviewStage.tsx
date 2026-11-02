/**
 * The shared miniature viewport of the generator panel: caption row, inset machine-bed ground with its faint grid,
 * one framed body, and an optional foot. Every preview uses this frame so the origin, geometry, operation and the
 * per-section examples read as one product instead of a pile of unrelated diagrams.
 */
import { Show, type JSX } from "solid-js"
import type { cam } from "@cadcamfun/core"
import { ToolSilhouette } from "../ToolSilhouette.tsx"

export interface PreviewStageProps {
  readonly title: string
  /** Quiet supporting line, usually the live value the drawing reacts to. */
  readonly detail?: string | undefined
  /** Short mono token on the right: a work offset, a cutter size, a holding type. */
  readonly chip?: string | undefined
  readonly testId?: string | undefined
  readonly ariaLabel?: string | undefined
  readonly compact?: boolean | undefined
  readonly tall?: boolean | undefined
  readonly foot?: JSX.Element | undefined
  readonly children: JSX.Element
}

const labelOf = (...parts: ReadonlyArray<string | undefined>): string =>
  parts.filter((part): part is string => part !== undefined && part !== "").join(" · ")

/** Caption + ground + body; the body is whatever medium the preview needs (SVG, canvas, a live tool stage). */
export function PreviewStage(props: PreviewStageProps): JSX.Element {
  const label = (): string => props.ariaLabel ?? labelOf(props.title, props.detail, props.chip)
  return (
    <figure
      class="panel-preview"
      classList={{ "panel-preview--compact": props.compact === true, "panel-preview--tall": props.tall === true }}
      data-testid={props.testId}
    >
      <figcaption class="panel-preview__caption">
        <span class="panel-preview__title">{props.title}</span>
        <span class="panel-preview__meta">
          <Show when={props.detail}>{(detail) => <span class="panel-preview__detail">{detail()}</span>}</Show>
          <Show when={props.chip}>{(chip) => <span class="panel-preview__chip">{chip()}</span>}</Show>
        </span>
      </figcaption>
      <div class="panel-preview__viewport" aria-label={label()}>
        {props.children}
      </div>
      <Show when={props.foot}>{(foot) => <div class="panel-preview__foot">{foot()}</div>}</Show>
    </figure>
  )
}

/** The tool card's stage: the real assembly silhouette standing on the stock it is about to cut. */
export function ToolStage(props: {
  readonly cutter: cam.kernel.Cutter
  readonly title: string
  readonly detail?: string | undefined
  readonly chip?: string | undefined
  readonly testId?: string | undefined
}): JSX.Element {
  return (
    <PreviewStage
      title={props.title}
      detail={props.detail}
      chip={props.chip}
      testId={props.testId}
      compact
      ariaLabel={labelOf(props.title, props.cutter.name, props.detail, props.chip)}
    >
      <div class="tool-stage">
        <div class="tool-stage__axis" aria-hidden="true" />
        <ToolSilhouette cutter={props.cutter} height={88} class="tool-stage__silhouette" />
        <div class="tool-stage__stock" aria-hidden="true" />
      </div>
    </PreviewStage>
  )
}
