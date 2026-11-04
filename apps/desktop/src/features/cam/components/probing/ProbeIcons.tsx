/**
 * Glyphs of the probing cycles (spec 73 §4): one 24 grid, one 2px round stroke, `currentColor` only, no fill, a box that never
 * shrinks. Each glyph is the feature with the stylus ball touching it; the status marks of the inspection list use the same rule.
 */
import type { JSX } from "solid-js"
import type { ProbeCycleKind } from "../../lib/probing/contract.ts"

const Glyph = (props: { readonly size: number; readonly class?: string; readonly children: JSX.Element }): JSX.Element => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" class={props.class} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ "flex-shrink": "0" }} aria-hidden="true">
    {props.children}
  </svg>
)

const BALL = 2

const SHAPES: Readonly<Record<ProbeCycleKind, () => JSX.Element>> = {
  "z-surface": () => <><path d="M4 19h16" /><path d="M12 3v9" /><circle cx="12" cy="14.5" r={BALL} /></>,
  edge: () => <><path d="M17 4v16" /><path d="M3 12h7" /><circle cx="12.5" cy="12" r={BALL} /></>,
  corner: () => <><path d="M5 4v15h15" /><path d="M9 10l2.5 2.5" /><circle cx="13" cy="14" r={BALL} /></>,
  web: () => <><path d="M9 4v16M15 4v16" /><path d="M3 12h3M18 12h3" /></>,
  pocket: () => <><path d="M4 4v16M20 4v16" /><path d="M8 12h2M14 12h2" /><circle cx="12" cy="12" r="1" /></>,
  rectangle: () => <><rect x="4" y="6" width="16" height="12" rx="1" /><circle cx="12" cy="12" r={BALL} /></>,
  bore: () => <><circle cx="12" cy="12" r="8" /><path d="M12 9v6M9 12h6" /></>,
  boss: () => <><circle cx="12" cy="12" r="4.5" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  "edge-angle": () => <><path d="M4 18L20 8" /><path d="M9 14.5l-1.8-3M15 10.5l-1.8-3" /></>,
  plane: () => <><path d="M3 16l5-9h13l-5 9z" /><circle cx="12.5" cy="11.5" r="1" /></>,
  sphere: () => <><circle cx="12" cy="12" r="7" /><path d="M5 12a7 2.5 0 0 0 14 0" /></>,
  "tool-length": () => <><path d="M12 3v11" /><path d="M5 20h14" /><path d="M9 16.5l3 3.5 3-3.5" /></>,
  "tool-radius": () => <><circle cx="12" cy="12" r="7" /><path d="M12 12h7" /></>,
  "broken-tool": () => <><path d="M12 3v7l-2.5 2.5L14 15l-2 2v4" /></>,
  "stylus-calibrate": () => <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></>,
  "rotary-axis": () => <><path d="M5 12a7 7 0 1 1 3 5.7" /><path d="M5 17v-5h5" /><circle cx="12" cy="12" r="1.5" /></>
}

export function ProbeIcon(props: { readonly kind: ProbeCycleKind; readonly size?: number; readonly class?: string }): JSX.Element {
  const shape = SHAPES[props.kind]
  return <Glyph size={props.size ?? 16} {...(props.class !== undefined ? { class: props.class } : {})}>{shape()}</Glyph>
}
