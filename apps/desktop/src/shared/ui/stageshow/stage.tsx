/**
 * Stage — a miniature, believable product screen drawn at a fixed design size and scaled to
 * the width it is given.
 *
 * Design rules (the Stageshow skill, ported to Solid):
 *  - the scene is built once at `width × height` design pixels, real type sizes, and scaled;
 *  - it is decorative: the page around it already says what it means, so it is `aria-hidden`;
 *  - one thing happens, every motion has a cause, the loop ends with a visible reset beat;
 *  - the `poster` phase is the frame that works alone (reduced motion, first paint);
 *  - colours come from the app's `--ent-*` tokens, so light and dark need no second drawing.
 */
import { createSignal, onCleanup, onMount, type Accessor, type JSX } from "solid-js"
import { createStory, type Story } from "./story.ts"
import "./stage.css"

export interface StageProps {
  /** Design size of the scene, in px. */
  readonly width: number
  readonly height: number
  /** Milliseconds each phase holds; the last phase is the fade-out/reset beat. */
  readonly steps: ReadonlyArray<number>
  /** The phase that tells the story alone. */
  readonly poster: number
  readonly class?: string
  readonly children: (phase: Accessor<number>) => JSX.Element
}

export function Stage(props: StageProps): JSX.Element {
  let root!: HTMLDivElement
  const [scale, setScale] = createSignal(1)
  const story: Story = createStory({ steps: props.steps, poster: props.poster })

  onMount(() => {
    const fit = (): void => {
      const width = root.clientWidth
      if (width > 0) setScale(width / props.width)
    }
    fit()
    story.watch(root)
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(fit)
      observer.observe(root)
      onCleanup(() => observer.disconnect())
    }
  })

  return (
    <div
      ref={root}
      class={`ss-stage ${props.class ?? ""}`}
      style={{ "aspect-ratio": `${props.width} / ${props.height}` }}
      aria-hidden="true"
    >
      <div
        class="ss-stage__canvas"
        style={{ width: `${props.width}px`, height: `${props.height}px`, transform: `scale(${scale()})` }}
      >
        {props.children(story.phase)}
      </div>
    </div>
  )
}

/**
 * The pointer an illustration draws: one solid, rounded arrowhead (the kit's `arrow` style).
 * It glides to `x, y` in design px, and shrinks a touch while `pressed` — the click.
 */
export function Cursor(props: {
  readonly x: number
  readonly y: number
  readonly pressed?: boolean
  readonly hidden?: boolean
  /** Glide time in ms; a drag is slower than a hop. */
  readonly glide?: number
}): JSX.Element {
  return (
    <div
      class="ss-cursor"
      data-pressed={props.pressed === true ? "true" : "false"}
      data-hidden={props.hidden === true ? "true" : "false"}
      style={{
        transform: `translate(${props.x}px, ${props.y}px)`,
        "transition-duration": `${props.glide ?? 650}ms, 250ms`
      }}
    >
      <svg class="ss-cursor__arrow" width="22" height="22" viewBox="0 0 22 22">
        <path d="M4 3 18.5 9.6 11.8 11.8 9.6 18.5Z" />
      </svg>
    </div>
  )
}
