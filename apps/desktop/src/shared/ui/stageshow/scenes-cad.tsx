/**
 * CAD workspace scenes — three short illustrations for the CAD panels' empty states.
 *
 *  - ExplorerScene: the feature tree gains a sketch and an extrude, the model follows.
 *  - DrawingSheetScene: a dimension is dragged across the front view of a sheet.
 *  - PmiScene: a callout is placed on a hole.
 *
 * Same rules as previews.tsx: one cause and effect, a poster phase that tells it alone, a
 * reset beat, sample content marked `// i18n-ok`, decorative (`aria-hidden`), still for
 * reduced motion. Colours are the `--ss-*` tokens of the stage.
 */
import { type JSX } from "solid-js"
import { Box, ChevronDown, Folder, Square } from "lucide-solid"
import { Pointer, Stage, type Pose } from "./index.ts"
import "./scenes-cad.css"

const NARROW = 300 // side panels are ~280px wide: design at their width so type stays legible

/** Sample content the scenes show: illustration text, not UI strings. */
const SAMPLE_PART = "Part 1" // i18n-ok
const SAMPLE_SKETCH = "Sketch 1" // i18n-ok
const SAMPLE_EXTRUDE = "Extrude 1" // i18n-ok
const SAMPLE_DIM = "60" // i18n-ok
const SAMPLE_HOLE = "Ø 6 H7" // i18n-ok

function GridBackdrop(props: { readonly id: string; readonly width: number; readonly height: number; readonly x?: number }): JSX.Element {
  return (
    <>
      <defs>
        <pattern id={props.id} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="var(--ss-line)" stroke-width="1" opacity="0.7" />
        </pattern>
      </defs>
      <rect x={props.x ?? 0} width={props.width} height={props.height} fill={`url(#${props.id})`} />
    </>
  )
}

// ── Explorer: sketch → extrude, the tree and the model agree ───────────────
// 0 empty tree · 1 the sketch row arrives, its outline draws · 2 the extrude row arrives, the body follows
// · 3 hold · 4 reset. No cursor: the story is the history growing.
export function ExplorerScene(): JSX.Element {
  return (
    <div class="cadx-frame">
      <Stage class="ss-cadx-tree" width={NARROW} height={112} steps={[700, 1100, 1300, 3200, 500]} poster={3}>
        {(phase) => (
          <div class="ss-scene" data-reset={phase() === 4}>
            <svg width={NARROW} height={112} viewBox={`0 0 ${NARROW} 112`} style={{ position: "absolute", inset: "0" }}>
              <GridBackdrop id="ss-cadx-tree-grid" x={132} width={NARROW - 132} height={112} />
              <g class="cadx-ext" data-on={phase() >= 2 && phase() <= 3} style={{ "--dx": "-16px", "--dy": "10px" }}>
                <polygon class="cad-top" points="170,50 186,40 246,40 230,50" />
                <polygon class="cad-side" points="230,50 246,40 246,72 230,82" />
              </g>
              <rect class="cad-front" data-on={phase() >= 2 && phase() <= 3} x="170" y="50" width="60" height="32" />
              <rect class="cad-sketch" data-on={phase() >= 1} data-done={phase() >= 2} pathLength="1" x="170" y="50" width="60" height="32" />
            </svg>
            <div class="cadx-tree">
              <div class="cadx-row cadx-row--root" data-on="true">
                <ChevronDown size={11} />
                <Folder size={13} fill="currentColor" />
                <span class="cadx-row__name">{SAMPLE_PART}</span>
              </div>
              <div class="cadx-row cadx-row--child" data-on={phase() >= 1 && phase() <= 3}>
                <Square size={13} fill="currentColor" />
                <span class="cadx-row__name">{SAMPLE_SKETCH}</span>
              </div>
              <div class="cadx-row cadx-row--child" data-on={phase() >= 2 && phase() <= 3} data-selected={phase() >= 3}>
                <Box size={13} fill="currentColor" />
                <span class="cadx-row__name">{SAMPLE_EXTRUDE}</span>
              </div>
            </div>
          </div>
        )}
      </Stage>
    </div>
  )
}

// ── Drawing sheet: a dimension is dragged across the front view ────────────
// 0 idle · 1 cursor to the left corner · 2 drag to the right corner, the dimension draws · 3 hold · 4 reset
const SHEET_POSES: ReadonlyArray<Pose> = [
  { x: 306, y: 74, glide: 0 },
  { x: 110, y: 86, glide: 800 },
  { x: 230, y: 86, pressed: true, glide: 900 },
  { x: 272, y: 52, glide: 600 }
]

export function DrawingSheetScene(): JSX.Element {
  return (
    <div class="cadx-frame">
      <Stage class="ss-cadx-sheet" width={360} height={128} steps={[600, 800, 1000, 3400, 500]} poster={3}>
        {(phase) => (
          <div class="ss-scene cadx-paper" data-reset={phase() === 4}>
            <svg width={360} height={128} viewBox="0 0 360 128" style={{ position: "absolute", inset: "0" }}>
              <rect class="cadx-border" x="8" y="8" width="344" height="112" />
              <rect class="cadx-view" x="110" y="30" width="120" height="56" />
              <circle class="cadx-view" cx="170" cy="58" r="11" />
              <path class="cadx-axis" d="M104 58H236M170 24V92" />
              <g class="cadx-dim" data-on={phase() >= 2}>
                <path pathLength="1" d="M110 94V104M230 94V104" />
                <path pathLength="1" d="M110 99H230" />
              </g>
              <rect class="cadx-titleblock" x="250" y="92" width="102" height="28" />
            </svg>
            <span class="ss-bar" style={{ position: "absolute", left: "258px", top: "100px", width: "46px" }} />
            <span class="ss-bar" style={{ position: "absolute", left: "258px", top: "109px", width: "30px" }} />
            <span class="ss-chip ss-chip--mono" data-show={phase() >= 2} style={{ left: "158px", top: "89px" }}>{SAMPLE_DIM}</span>
            <Pointer phase={phase()} poses={SHEET_POSES} />
          </div>
        )}
      </Stage>
    </div>
  )
}

// ── PMI: a callout is placed on a hole ──────────────────────────────────────
// 0 idle · 1 cursor to the hole · 2 click · 3 the leader draws, the flag lands · 4 reset
const PMI_POSES: ReadonlyArray<Pose> = [
  { x: 44, y: 98, glide: 0 },
  { x: 141, y: 62, glide: 800 },
  { x: 141, y: 62, pressed: true, glide: 150 },
  { x: 200, y: 92, glide: 800 }
]

export function PmiScene(): JSX.Element {
  return (
    <div class="cadx-frame">
      <Stage class="ss-cadx-pmi" width={NARROW} height={112} steps={[600, 800, 180, 3400, 500]} poster={3}>
        {(phase) => (
          <div class="ss-scene" data-reset={phase() === 4}>
            <svg width={NARROW} height={112} viewBox={`0 0 ${NARROW} 112`} style={{ position: "absolute", inset: "0" }}>
              <GridBackdrop id="ss-cadx-pmi-grid" width={NARROW} height={112} />
              <polygon class="cad-top" points="96,40 114,28 204,28 186,40" />
              <polygon class="cad-side" points="186,40 204,28 204,72 186,84" />
              <rect class="cad-front" data-on="true" x="96" y="40" width="90" height="44" />
              <circle class="cadx-hole" data-picked={phase() >= 2} cx="141" cy="62" r="7" />
              <path class="cadx-leader" data-on={phase() >= 3} pathLength="1" d="M146 57 L206 26 H214" />
            </svg>
            <span class="ss-chip ss-chip--mono cadx-flag" data-show={phase() >= 3} style={{ left: "214px", top: "14px" }}>{SAMPLE_HOLE}</span>
            <Pointer phase={phase()} poses={PMI_POSES} />
          </div>
        )}
      </Stage>
    </div>
  )
}
