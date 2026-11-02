/**
 * Previews — the three module illustrations (CAD, CAM, projects) the dashboard shows.
 *
 * Each one is a single cause-and-effect story, 5–7 seconds, that ends on a resting frame
 * that explains itself (the `poster`). Real words only where the story is about them:
 * "New project" (the app's own label), a dimension, a few lines of G-code. Everything else
 * is a quiet bar. Phase tables are written next to each scene so the choreography is
 * readable: the cursor position and press state are looked up per phase, never computed.
 */
import { For, Show, type JSX } from "solid-js"
import { Box, File, Layers, Plug, Plus, Route, Server, Square, Wrench } from "lucide-solid"
import { Cursor, Stage } from "./stage.tsx"
import { t } from "../../../i18n/index.ts"

export const W = 360
export const H = 128

export interface Pose { readonly x: number; readonly y: number; readonly pressed?: boolean; readonly glide?: number }

/** The cursor for the current phase; the reset beat hides it, the opening beat snaps it home. */
export function Pointer(props: { readonly phase: number; readonly poses: ReadonlyArray<Pose> }): JSX.Element {
  const pose = (): Pose => props.poses[Math.min(props.phase, props.poses.length - 1)] ?? { x: 0, y: 0 }
  const last = (): boolean => props.phase >= props.poses.length
  return <Cursor x={pose().x} y={pose().y} pressed={pose().pressed} glide={pose().glide} hidden={last()} />
}

// ── CAD ─────────────────────────────────────────────────────────────────────
// 0 idle · 1 drag the rectangle · 2 release, pick the extrude tool · 3 pull · 4 hold · 5 reset
const CAD_POSES: ReadonlyArray<Pose> = [
  { x: 84, y: 104, glide: 0 },
  { x: 230, y: 106, pressed: true, glide: 950 },
  { x: 230, y: 58, glide: 500 },
  { x: 252, y: 42, pressed: true, glide: 650 },
  { x: 272, y: 34, glide: 600 }
]

export function CadPreview(): JSX.Element {
  return (
    <Stage class="ss-cad" width={W} height={H} steps={[600, 1100, 600, 900, 3000, 500]} poster={4}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <svg class="cad-grid" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <pattern id="ss-cad-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M16 0H0V16" fill="none" stroke="var(--ent-line)" stroke-width="1" opacity="0.7" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#ss-cad-grid)" />
            {/* The extruded body: top and right faces slide out from behind the front face. */}
            <g class="cad-extrusion" data-on={phase() >= 3 && phase() <= 4}>
              <polygon class="cad-top" points="140,56 162,40 252,40 230,56" />
              <polygon class="cad-side" points="230,56 252,40 252,90 230,106" />
            </g>
            <rect class="cad-front" data-on={phase() >= 2} x="140" y="56" width="90" height="50" />
            <circle class="cad-hole" data-on={phase() >= 4} cx="185" cy="81" r="9" />
            <rect
              class="cad-sketch"
              data-on={phase() >= 1}
              data-done={phase() >= 2}
              pathLength="1"
              x="140"
              y="56"
              width="90"
              height="50"
            />
          </svg>
          <div class="ss-rail" style={{ height: `${H}px` }}>
            <span class="ss-rail__tool" data-active={phase() < 2}><Square size={13} fill="currentColor" /></span>
            <span class="ss-rail__tool" data-active={phase() >= 2}><Box size={13} fill="currentColor" /></span>
          </div>
          <span class="ss-chip ss-chip--mono" data-show={phase() >= 3 && phase() <= 4} style={{ left: "164px", top: "10px" }}>
            18 mm
          </span>
          <Pointer phase={phase()} poses={CAD_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── CAM ─────────────────────────────────────────────────────────────────────
// 0 idle · 1 cursor to the toolpath tool · 2 click · 3 path draws, G-code follows · 4 hold · 5 reset
const CAM_POSES: ReadonlyArray<Pose> = [
  { x: 170, y: 110, glide: 0 },
  { x: 18, y: 31, glide: 700 },
  { x: 18, y: 31, pressed: true, glide: 200 },
  { x: 120, y: 104, glide: 900 },
  { x: 120, y: 104, glide: 400 }
]

const GCODE: ReadonlyArray<string> = ["G0 Z5", "G1 Z-2 F300", "G1 X96 Y52", "G1 X198 Y52"]

export function CamPreview(): JSX.Element {
  return (
    <Stage class="ss-cam" width={W} height={H} steps={[600, 800, 200, 2800, 3000, 500]} poster={4}>
      {(phase) => {
        const drawing = (): boolean => phase() >= 3 && phase() <= 4
        return (
          <div class="ss-scene" data-reset={phase() === 5}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: "0" }}>
              <rect class="cam-stock" x="60" y="18" width="160" height="94" rx="3" />
              <rect class="cam-pocket" x="86" y="42" width="124" height="54" rx="2" />
              <path
                class="cam-path"
                data-on={drawing()}
                pathLength="1"
                d="M96 52 H198 V86 H96 V62 H188 V76 H106 V69 H178"
              />
            </svg>
            <span class="cam-tool" data-on={drawing()} />
            <div class="ss-rail" style={{ height: `${H}px` }}>
              <span class="ss-rail__tool" data-active={phase() < 2}><Box size={13} fill="currentColor" /></span>
              <span class="ss-rail__tool" data-active={phase() >= 2}><Route size={13} /></span>
            </div>
            <div class="cam-code">
              <For each={GCODE}>
                {(line, i) => (
                  <span
                    class="cam-code__line"
                    data-on={drawing()}
                    data-now={phase() === 4 && i() === GCODE.length - 1}
                    style={{ "transition-delay": drawing() ? `${0.25 + i() * 0.55}s` : "0s" }}
                  >
                    {line}
                  </span>
                )}
              </For>
            </div>
            <span class="ss-chip ss-chip--mono" data-show={phase() === 4} style={{ left: "242px", top: "100px" }}>
              2 min 14 s
            </span>
            <Pointer phase={phase()} poses={CAM_POSES} />
          </div>
        )
      }}
    </Stage>
  )
}

// ── Projects ────────────────────────────────────────────────────────────────
// 0 idle · 1 cursor to the button · 2 click · 3 the new row arrives and carries the rest · 4 reset
const PRJ_POSES: ReadonlyArray<Pose> = [
  { x: 196, y: 104, glide: 0 },
  { x: 306, y: 19, glide: 750 },
  { x: 306, y: 19, pressed: true, glide: 150 },
  { x: 236, y: 106, glide: 900 }
]

/** The sample part the new project is named after: illustration content, not UI text. */
const SAMPLE_PROJECT = "Bracket" // i18n-ok

const BAR_WIDTHS: ReadonlyArray<readonly [number, number]> = [[58, 44], [70, 52], [48, 40], [64, 48]]

export function ProjectsPreview(): JSX.Element {
  return (
    <Stage class="ss-prj" width={W} height={H} steps={[600, 800, 180, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="prj-head">
            <span class="ss-bar" style={{ width: "64px" }} />
            <span class="prj-btn" data-pressed={phase() === 2}>
              <Plus size={11} stroke-width={2.5} />
              {t("dashboard.hero.cta.start")}
            </span>
          </div>
          <div class="prj-list">
            <div class="prj-rows" data-carry={phase() >= 3}>
              <div class="prj-row" data-fresh={phase() >= 3}>
                <span class="prj-row__icon"><File size={13} fill="currentColor" /></span>
                <span class="prj-row__name">{SAMPLE_PROJECT}</span>
                <span class="prj-dot" />
                <span class="ss-bar prj-row__meta" />
              </div>
              <For each={BAR_WIDTHS}>
                {([name, meta]) => (
                  <div class="prj-row">
                    <span class="prj-row__icon"><File size={13} fill="currentColor" /></span>
                    <span class="ss-bar" style={{ width: `${name}px` }} />
                    <span class="ss-bar prj-row__meta" style={{ width: `${meta}px` }} />
                  </div>
                )}
              </For>
            </div>
          </div>
          <Pointer phase={phase()} poses={PRJ_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Lost (404 / 500 / offline) ──────────────────────────────────────────────
// 0 idle · 1 searches left · 2 searches right · 3 settles on the empty outline · 4 reset
const LOST_POSES: ReadonlyArray<Pose> = [
  { x: 60, y: 100, glide: 0 },
  { x: 120, y: 44, glide: 900 },
  { x: 250, y: 96, glide: 1000 },
  { x: 186, y: 76, glide: 800 }
]

/** A sketch outline with nothing in it — the page or part that is not there. */
export function LostPreview(props: { readonly code?: string }): JSX.Element {
  return (
    <Stage class="ss-lost" width={W} height={H} steps={[500, 1000, 1100, 3600, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <svg class="cad-grid" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <pattern id="ss-lost-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M16 0H0V16" fill="none" stroke="var(--ent-line)" stroke-width="1" opacity="0.7" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#ss-lost-grid)" />
            <rect class="lost-outline" data-found={phase() >= 3} x="142" y="38" width="88" height="52" rx="2" />
          </svg>
          <Show when={props.code !== undefined}>
            <span class="ss-chip ss-chip--mono" data-show={phase() >= 3} style={{ left: "164px", top: "98px" }}>
              {props.code}
            </span>
          </Show>
          <Pointer phase={phase()} poses={LOST_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Library: a new tile joins the grid ──────────────────────────────────────
// 0 idle · 1 cursor to the empty slot · 2 click · 3 the new item takes the slot · 4 reset
const LIB_POSES: ReadonlyArray<Pose> = [
  { x: 262, y: 112, glide: 0 },
  { x: 70, y: 40, glide: 800 },
  { x: 70, y: 40, pressed: true, glide: 150 },
  { x: 190, y: 118, glide: 900 }
]

/** The sample tool the new tile shows: illustration content, not UI text. */
const SAMPLE_TOOL = "Ø 10 mm" // i18n-ok
const LIB_ICONS = [Layers, Box, Wrench, Layers, Box] as const

export function LibraryPreview(): JSX.Element {
  return (
    <Stage class="ss-lib" width={W} height={H} steps={[600, 800, 180, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="lib-grid">
            <div class="lib-tile lib-tile--slot" data-gone={phase() >= 3}><Plus size={14} stroke-width={2.5} /></div>
            <div class="lib-tile lib-tile--fresh" data-on={phase() >= 3}>
              <Wrench size={14} fill="currentColor" />
              <span class="lib-tile__name">{SAMPLE_TOOL}</span>
              <span class="prj-dot" />
            </div>
            <For each={LIB_ICONS}>
              {(Icon, i) => (
                <div class="lib-tile">
                  <Icon size={14} fill="currentColor" />
                  <span class="ss-bar" style={{ width: `${[48, 38, 54, 42, 34][i()]}px` }} />
                </div>
              )}
            </For>
          </div>
          <Pointer phase={phase()} poses={LIB_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Connect: a link is made between two things (plugins, MCP servers) ──────
// 0 idle · 1 cursor to the source · 2 click · 3 the link draws, the far end comes alive · 4 reset
const CONN_POSES: ReadonlyArray<Pose> = [
  { x: 250, y: 108, glide: 0 },
  { x: 100, y: 70, glide: 800 },
  { x: 100, y: 70, pressed: true, glide: 150 },
  { x: 180, y: 108, glide: 900 }
]

export function ConnectPreview(): JSX.Element {
  return (
    <Stage class="ss-conn" width={W} height={H} steps={[600, 800, 180, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: "0" }}>
            <path class="conn-link" data-on={phase() >= 3} pathLength="1" d="M160 64 H200" />
          </svg>
          <div class="conn-node" style={{ left: "44px" }} data-active={phase() >= 2}>
            <span class="conn-node__tile"><Plug size={14} fill="currentColor" /></span>
            <span class="ss-bar" style={{ width: "52px" }} />
          </div>
          <div class="conn-node" style={{ left: "200px" }} data-active={phase() >= 3}>
            <span class="conn-node__tile"><Server size={14} fill="currentColor" /></span>
            <span class="ss-bar" style={{ width: "44px" }} />
            <span class="prj-dot conn-node__live" data-on={phase() >= 3} />
          </div>
          <Pointer phase={phase()} poses={CONN_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Assistant: a prompt becomes a part ──────────────────────────────────────
// No cursor — the story is the model working. 0 idle · 1 the prompt is typed · 2 sent, the plate appears
// · 3 the holes arrive one by one · 4 hold · 5 reset
/** The sample prompt: illustration content, not UI text. */
const SAMPLE_PROMPT = "Plate 60 × 40, 4 × M5" // i18n-ok

export function AssistantPreview(): JSX.Element {
  return (
    <Stage class="ss-ai" width={W} height={H} steps={[500, 1500, 900, 1400, 2800, 500]} poster={4}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <svg class="cad-grid" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <pattern id="ss-ai-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M16 0H0V16" fill="none" stroke="var(--ss-line)" stroke-width="1" opacity="0.7" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#ss-ai-grid)" />
            <g class="ai-part" data-on={phase() >= 2}>
              <polygon class="cad-top" points="196,52 214,38 330,38 312,52" />
              <polygon class="cad-side" points="312,52 330,38 330,82 312,96" />
              <rect class="cad-front" data-on="true" x="196" y="52" width="116" height="44" />
              <For each={[[216, 66], [292, 66], [216, 84], [292, 84]]}>
                {([x, y], i) => <circle class="cad-hole ai-hole" data-on={phase() >= 3} style={{ "transition-delay": `${i() * 0.28}s` }} cx={x} cy={y} r="5" />}
              </For>
            </g>
          </svg>
          <div class="ai-chat">
            <div class="ai-bubble" data-sent={phase() >= 2}>
              <span class="ai-bubble__text" data-typed={phase() >= 1}>{SAMPLE_PROMPT}</span>
            </div>
            <span class="ss-bar" style={{ width: "70px", opacity: phase() >= 2 ? 0.55 : 0 }} />
            <span class="ss-bar" style={{ width: "46px", opacity: phase() >= 3 ? 0.55 : 0 }} />
          </div>
        </div>
      )}
    </Stage>
  )
}

export type PreviewKind = "cad" | "cam" | "projects" | "library" | "connect" | "assistant"

/** The illustration for a module or an empty state, by kind. */
export function ModulePreview(props: { readonly module: PreviewKind }): JSX.Element {
  return (
    <div class="dash-mod-preview">
      <Show when={props.module === "cad"}><CadPreview /></Show>
      <Show when={props.module === "cam"}><CamPreview /></Show>
      <Show when={props.module === "projects"}><ProjectsPreview /></Show>
      <Show when={props.module === "library"}><LibraryPreview /></Show>
      <Show when={props.module === "connect"}><ConnectPreview /></Show>
      <Show when={props.module === "assistant"}><AssistantPreview /></Show>
    </div>
  )
}
