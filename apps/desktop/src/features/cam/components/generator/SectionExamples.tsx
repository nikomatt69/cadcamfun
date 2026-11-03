/**
 * One parameterised miniature for every generator section that used to explain itself with words alone. The scenes
 * share the preview viewport of `PreviewStage`: same ground, grid, caption, mono chip, face shades and line weights as
 * the origin / geometry / operation diagrams. Values come from the live settings; anything not available cheaply is
 * left out rather than invented.
 */
import { For, Match, Show, Switch, createUniqueId, type JSX } from "solid-js"
import type { cam } from "@cadcamfun/core"
import { PreviewStage } from "./PreviewStage.tsx"
import { ToolSilhouette } from "../ToolSilhouette.tsx"
import "../../styles/setup-examples.css"

export type SectionExampleKind =
  | "workholding"
  | "machine"
  | "material"
  | "cutting"
  | "fixed-cycles"
  | "lathe"
  | "print-profile"
  | "advanced"
  | "ai"
  | "evidence"
  | "kernel-setup"
  | "print-verify"
  | "origin"
  | "post"
  | "tool"
  | "stock"

/** What a workholding miniature can draw: the four holdings of the settings plus the two a machine brings (vacuum table, rotary table). */
export type HoldingScene = "vise" | "clamps" | "plate" | "none" | "vacuum" | "rotary"

/** What a scene needs to be drawn; the caption (title, detail, chip) belongs to the frame around it. */
export interface SceneProps {
  readonly kind: SectionExampleKind
  readonly detail?: string | undefined
  readonly chip?: string | undefined
  readonly family?: "mill" | "lathe" | "3dprinter" | undefined
  readonly holding?: HoldingScene | undefined
  /** Parallels under the stock, mm: the stock stands on them in the vise. */
  readonly parallels?: number | undefined
  readonly kinematics?: "bed-slinger" | "corexy" | "delta" | "cartesian" | undefined
  /** `machine`: which machine the miniature draws. */
  readonly variant?: "vmc" | "fiveaxis" | "router" | undefined
  /** `origin`: where the zero sits. */
  readonly originKind?: "center" | "corner" | "machine" | "face" | "chuck" | undefined
  /** `origin`: the work offset written next to the zero. */
  readonly offset?: string | undefined
  /** `post`: the first lines the dialect writes. */
  readonly postLines?: ReadonlyArray<string> | undefined
  /** `tool`: the cutter drawn as its real assembly. */
  readonly cutter?: cam.kernel.Cutter | undefined
  /** `stock`: the raw piece, mm. */
  readonly stock?: { readonly x: number; readonly y: number; readonly z: number } | undefined
  readonly jawAxis?: "x" | "y" | undefined
  readonly material?: string | undefined
  readonly toolDiameter?: number | undefined
  readonly stepdown?: number | undefined
  readonly stepover?: number | undefined
  readonly direction?: "climb" | "conventional" | undefined
  readonly feedrate?: number | undefined
  readonly rpm?: number | undefined
  readonly layerHeight?: number | undefined
  readonly walls?: number | undefined
  readonly infill?: number | undefined
  readonly operation?: string | undefined
  readonly turning?: "external" | "internal" | "face" | undefined
  readonly tolerance?: number | undefined
  readonly tabs?: number | undefined
  readonly finishing?: boolean | undefined
  readonly rest?: boolean | undefined
  readonly arcFitting?: boolean | undefined
  readonly ai?: boolean | undefined
  readonly aiDifficulty?: string | undefined
  readonly orientation?: string | undefined
  readonly fixture?: boolean | undefined
  readonly checks?: ReadonlyArray<{ readonly id: string; readonly status: string }> | undefined
  readonly hash?: string | undefined
  readonly holes?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z?: number }> | undefined
  readonly depth?: number | undefined
  readonly buildHeight?: number | undefined
  readonly stockDiameter?: number | undefined
  readonly stockLength?: number | undefined
  readonly gripLength?: number | undefined
  readonly tailstock?: boolean | undefined
  readonly chuck?: "3-jaw" | "4-jaw" | "collet" | undefined
  readonly bed?: { readonly width: number; readonly depth: number; readonly height: number } | undefined
  readonly nozzle?: number | undefined
}

export interface SectionExampleProps extends SceneProps {
  readonly title: string
  readonly testId: string
}

type XY = readonly [number, number]

const ISO_X = 0.866
const ISO_Y = 0.5
const iso = (cx: number, cy: number, x: number, y: number, z: number): XY => [cx + (x - y) * ISO_X, cy + (x + y) * ISO_Y - z]
const pts = (points: ReadonlyArray<XY>): string => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
const mm = (value: number | undefined, fallback = "—"): string => value === undefined || !Number.isFinite(value) ? fallback : String(Math.round(value * 100) / 100)

/** A shaded axis-aligned block in the same isometric projection as the rest of the panel. `z` is its underside. */
function Box(props: {
  readonly cx: number
  readonly cy: number
  readonly x?: number
  readonly y?: number
  readonly z?: number
  readonly w: number
  readonly d: number
  readonly h: number
  readonly tone?: string
  readonly outline?: boolean
  readonly topFill?: string
}): JSX.Element {
  const x0 = props.x ?? 0
  const y0 = props.y ?? 0
  const z0 = props.z ?? 0
  const p = (x: number, y: number, z: number): XY => iso(props.cx, props.cy, x0 + x, y0 + y, z0 + z)
  const top = [p(0, 0, props.h), p(props.w, 0, props.h), p(props.w, props.d, props.h), p(0, props.d, props.h)]
  const right = [p(props.w, 0, 0), p(props.w, props.d, 0), p(props.w, props.d, props.h), p(props.w, 0, props.h)]
  const front = [p(0, props.d, 0), p(props.w, props.d, 0), p(props.w, props.d, props.h), p(0, props.d, props.h)]
  const face = props.outline === true ? "panel-preview__face--outline" : undefined
  return (
    <g class={`iso iso--${props.tone ?? "stock"}`} classList={{ "iso--outline": props.outline === true }}>
      <polygon points={pts(front)} class={`panel-preview__face ${face ?? "panel-preview__face--side"}`} />
      <polygon points={pts(right)} class={`panel-preview__face ${face ?? "panel-preview__face--end"}`} />
      <polygon points={pts(top)} class={`panel-preview__face ${face ?? "panel-preview__face--top"}`} style={props.topFill === undefined ? undefined : { fill: props.topFill }} />
    </g>
  )
}

function Measure(props: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly label?: string }): JSX.Element {
  const vertical = Math.abs(props.y2 - props.y1) > Math.abs(props.x2 - props.x1)
  const tick = 3
  const textX = vertical ? props.x2 + 5 : (props.x1 + props.x2) / 2
  const textY = vertical ? (props.y1 + props.y2) / 2 + 3 : props.y1 - 4
  return (
    <g class="panel-preview__measure">
      <line x1={props.x1} y1={props.y1} x2={props.x2} y2={props.y2} />
      <line x1={props.x1 - (vertical ? tick : 0)} y1={props.y1 - (vertical ? 0 : tick)} x2={props.x1 + (vertical ? tick : 0)} y2={props.y1 + (vertical ? 0 : tick)} />
      <line x1={props.x2 - (vertical ? tick : 0)} y1={props.y2 - (vertical ? 0 : tick)} x2={props.x2 + (vertical ? tick : 0)} y2={props.y2 + (vertical ? 0 : tick)} />
      <Show when={props.label}>{(label) => <text x={textX} y={textY} text-anchor={vertical ? "start" : "middle"}>{label()}</text>}</Show>
    </g>
  )
}

function Hatch(props: { readonly id: string; readonly kind: "metal" | "wood" | "plastic" | "composite" }): JSX.Element {
  return (
    <defs>
      <pattern id={props.id} width={props.kind === "wood" ? "11" : "7"} height="7" patternUnits="userSpaceOnUse" patternTransform={props.kind === "wood" ? "rotate(0)" : "rotate(35)"}>
        <Show when={props.kind === "metal"} fallback={
          <Show when={props.kind === "wood"} fallback={
            <Show when={props.kind === "composite"} fallback={<circle cx="2" cy="2" r="0.8" class="panel-preview__hatch" />}>
              <path d="M0 0 L7 7 M7 0 L0 7" class="panel-preview__hatch" />
            </Show>
          }>
            <path d="M0 2 Q3 0 6 2 T11 2" class="panel-preview__hatch" />
          </Show>
        }>
          <path d="M0 0 L7 7" class="panel-preview__hatch" />
        </Show>
      </pattern>
    </defs>
  )
}

const materialTone = (material: string | undefined): string => {
  const value = (material ?? "").toLowerCase()
  if (value.includes("wood") || value.includes("ply")) return "mat-wood"
  if (value.includes("plastic") || value.includes("pla") || value.includes("petg") || value.includes("abs")) return "mat-plastic"
  if (value.includes("brass")) return "mat-brass"
  if (value.includes("titan")) return "mat-titanium"
  if (value.includes("steel") || value.includes("iron")) return "mat-steel"
  if (value.includes("composite") || value.includes("carbon")) return "mat-composite"
  return "mat-aluminum"
}
const hatchOf = (tone: string): "metal" | "wood" | "plastic" | "composite" => tone === "mat-wood" ? "wood" : tone === "mat-plastic" ? "plastic" : tone === "mat-composite" ? "composite" : "metal"

// ---------------------------------------------------------------- workholding

/** The tilted platter of a trunnion between its two cheeks, drawn in the panel's projection; `tilt` is degrees about X. */
function Trunnion(props: { readonly cx: number; readonly cy: number; readonly z: number; readonly tilt?: number; readonly part?: boolean }): JSX.Element {
  const { cx, cy } = props
  const tilt = ((props.tilt ?? 32) * Math.PI) / 180
  const rise = props.z
  /** A rectangle of the platter (centred on the rotation axis), lifted `lift` along the platter's normal. */
  const plate = (w: number, d: number, lift: number): string => {
    const corners: ReadonlyArray<XY> = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    return pts(corners.map(([x, y]) => iso(cx, cy, x, y * Math.cos(tilt) - lift * Math.sin(tilt), rise + y * Math.sin(tilt) + lift * Math.cos(tilt))))
  }
  const hub = iso(cx, cy, 0, 0, rise)
  const reach = iso(cx, cy, 0, -26, rise + 28)
  return (
    <g>
      <Box cx={cx} cy={cy} x={-52} y={-26} z={-30} w={104} d={52} h={10} tone="fixture" />
      <Box cx={cx} cy={cy} x={-52} y={-8} z={-20} w={10} d={16} h={rise + 26} tone="fixture" />
      <polygon points={plate(70, 44, 0)} class="panel-preview__face panel-preview__face--side" />
      <Show when={props.part !== false}>
        <polygon points={plate(40, 24, 8)} class="panel-preview__face panel-preview__face--top" />
      </Show>
      <Box cx={cx} cy={cy} x={42} y={-8} z={-20} w={10} d={16} h={rise + 26} tone="fixture" />
      <path d={`M${hub[0] - 40} ${hub[1] - 34} A 22 22 0 0 1 ${hub[0] - 22} ${hub[1] - 44}`} class="panel-preview__spin" />
      <polygon points={`${hub[0] - 22},${hub[1] - 44} ${hub[0] - 27},${hub[1] - 45} ${hub[0] - 24},${hub[1] - 39}`} class="panel-preview__spin-head" />
      <line x1={reach[0]} y1={reach[1] - 14} x2={reach[0]} y2={reach[1]} class="panel-preview__tool-line" />
    </g>
  )
}

/** A mill vise: two jaws gripping the stock across `axis`'s perpendicular, the stock standing on parallels. */
function ViseScene(props: { readonly jawAxis: "x" | "y"; readonly parallels: number }): JSX.Element {
  const cx = 160, cy = 56
  const lift = props.parallels > 0 ? Math.min(14, Math.max(4, props.parallels * 0.8)) : 0
  const stock = { cx, cy, x: 0, y: 0, z: lift, w: 88, d: 32, h: 30 }
  const jawLow = 22
  const at = (x: number, y: number, z: number): XY => iso(cx, cy, x, y, z)
  /** The clamping force: two short arrows pointing at the stock from the outside of each jaw. */
  const force = (x1: number, y1: number, x2: number, y2: number): JSX.Element => {
    const a = at(x1, y1, lift + 14), b = at(x2, y2, lift + 14)
    return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="panel-preview__force" />
  }
  return (
    <g>
      <Box cx={cx} cy={cy} x={-24} y={-22} z={-14} w={136} d={76} h={14} tone="fixture" />
      <Show when={lift > 0}>
        <Box cx={cx} cy={cy} x={6} y={-2} z={0} w={14} d={36} h={lift} tone="fixture" />
        <Box cx={cx} cy={cy} x={68} y={-2} z={0} w={14} d={36} h={lift} tone="fixture" />
      </Show>
      <Show when={props.jawAxis === "x"} fallback={
        <g>
          <Box cx={cx} cy={cy} x={-14} y={-4} z={0} w={14} d={40} h={jawLow + lift} tone="jaw" />
          <Box {...stock} />
          <Box cx={cx} cy={cy} x={88} y={-4} z={0} w={14} d={40} h={jawLow + lift} tone="jaw" />
          {force(-20, 16, -4, 16)}
          {force(108, 16, 92, 16)}
        </g>
      }>
        <g>
          <Box cx={cx} cy={cy} x={-8} y={-14} z={0} w={104} d={14} h={jawLow + lift} tone="jaw" />
          <Box {...stock} />
          <Box cx={cx} cy={cy} x={-8} y={32} z={0} w={104} d={14} h={jawLow + lift} tone="jaw" />
          {force(44, -20, 44, -4)}
          {force(44, 52, 44, 36)}
        </g>
      </Show>
      <circle cx={at(44, 16, lift + 30)[0]} cy={at(44, 16, lift + 30)[1]} r="2.4" class="panel-preview__contact-dot" />
      <text x={at(props.jawAxis === "x" ? 100 : 44, props.jawAxis === "x" ? 40 : 52, 0)[0]} y={at(props.jawAxis === "x" ? 100 : 44, props.jawAxis === "x" ? 40 : 52, 0)[1] + 12} text-anchor="middle" class="panel-preview__axis">{props.jawAxis.toUpperCase()}</text>
    </g>
  )
}

function MillHoldScene(props: { readonly holding: HoldingScene; readonly jawAxis: "x" | "y"; readonly parallels: number }): JSX.Element {
  const cx = 160, cy = 56
  const stock = { cx, cy, x: 0, y: 0, z: 0, w: 88, d: 32, h: 32 }
  const contact = (x: number): JSX.Element => {
    const a = iso(cx, cy, x, 32, 0), b = iso(cx, cy, x, 32, 32)
    return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="panel-preview__contact" />
  }
  return (
    <Switch>
      <Match when={props.holding === "none"}>
        <g>
          <Box cx={cx} cy={cy} x={-26} y={-4} z={-24} w={140} d={40} h={12} tone="fixture" />
          <Box {...stock} />
          <line x1={iso(cx, cy, 44, 16, 0)[0]} y1={iso(cx, cy, 44, 16, 0)[1]} x2={iso(cx, cy, 44, 16, -12)[0]} y2={iso(cx, cy, 44, 16, -12)[1]} class="panel-preview__drop" />
          <circle cx={iso(cx, cy, 44, 16, -12)[0]} cy={iso(cx, cy, 44, 16, -12)[1]} r="2" class="panel-preview__open" />
        </g>
      </Match>
      <Match when={props.holding === "vacuum"}>
        <g>
          <Box cx={cx} cy={cy} x={-50} y={-30} z={-14} w={188} d={96} h={14} tone="fixture" />
          <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
            {(index) => {
              const at = iso(cx, cy, -34 + index * 24, 62, -7)
              return <ellipse cx={at[0]} cy={at[1]} rx="2.4" ry="1.2" class="panel-preview__hole" />
            }}
          </For>
          <Box cx={cx} cy={cy} x={-20} y={-14} z={0} w={148} d={62} h={5} tone="stock" />
          <For each={[0, 1, 2, 3]}>
            {(index) => {
              const top = iso(cx, cy, 10 + index * 32, 17, 5), bottom = iso(cx, cy, 10 + index * 32, 17, -6)
              return <line x1={top[0]} y1={top[1] - 12} x2={bottom[0]} y2={bottom[1]} class="panel-preview__suction" />
            }}
          </For>
        </g>
      </Match>
      <Match when={props.holding === "rotary"}>
        <Trunnion cx={cx} cy={cy + 14} z={30} />
      </Match>
      <Match when={props.holding === "vise"}>
        <ViseScene jawAxis={props.jawAxis} parallels={props.parallels} />
      </Match>
      <Match when={props.holding === "clamps"}>
        <g>
          <Box cx={cx} cy={cy} x={-22} y={-4} z={-12} w={132} d={40} h={12} tone="fixture" />
          <Box {...stock} />
          <line x1={iso(cx, cy, -14, 16, 38)[0]} y1={iso(cx, cy, -14, 16, 38)[1]} x2={iso(cx, cy, 30, 16, 38)[0]} y2={iso(cx, cy, 30, 16, 38)[1]} class="panel-preview__clamp" />
          <line x1={iso(cx, cy, 58, 16, 38)[0]} y1={iso(cx, cy, 58, 16, 38)[1]} x2={iso(cx, cy, 102, 16, 38)[0]} y2={iso(cx, cy, 102, 16, 38)[1]} class="panel-preview__clamp" />
          <Box cx={cx} cy={cy} x={-22} y={8} z={0} w={10} d={16} h={38} tone="fixture" />
          <Box cx={cx} cy={cy} x={100} y={8} z={0} w={10} d={16} h={38} tone="fixture" />
          <line x1={iso(cx, cy, 12, 16, 32)[0]} y1={iso(cx, cy, 12, 16, 32)[1]} x2={iso(cx, cy, 24, 16, 32)[0]} y2={iso(cx, cy, 24, 16, 32)[1]} class="panel-preview__contact" />
          <line x1={iso(cx, cy, 64, 16, 32)[0]} y1={iso(cx, cy, 64, 16, 32)[1]} x2={iso(cx, cy, 76, 16, 32)[0]} y2={iso(cx, cy, 76, 16, 32)[1]} class="panel-preview__contact" />
          <circle cx={iso(cx, cy, -18, 16, 38)[0]} cy={iso(cx, cy, -18, 16, 38)[1]} r="3" class="panel-preview__bolt" />
          <circle cx={iso(cx, cy, 106, 16, 38)[0]} cy={iso(cx, cy, 106, 16, 38)[1]} r="3" class="panel-preview__bolt" />
          <line x1={iso(cx, cy, -18, 16, 38)[0]} y1={iso(cx, cy, -18, 16, 38)[1] - 3} x2={iso(cx, cy, -18, 16, 38)[0]} y2={iso(cx, cy, -18, 16, 38)[1] + 3} class="panel-preview__bolt-mark" />
          <line x1={iso(cx, cy, 106, 16, 38)[0]} y1={iso(cx, cy, 106, 16, 38)[1] - 3} x2={iso(cx, cy, 106, 16, 38)[0]} y2={iso(cx, cy, 106, 16, 38)[1] + 3} class="panel-preview__bolt-mark" />
        </g>
      </Match>
      <Match when={props.holding === "plate"}>
        <g>
          <Box cx={cx} cy={cy} x={-34} y={-10} z={-12} w={156} d={52} h={12} tone="fixture" />
          <Box cx={cx} cy={cy} x={-6} y={0} z={0} w={6} d={32} h={20} tone="fixture" />
          <Box cx={cx} cy={cy} x={88} y={0} z={0} w={6} d={32} h={20} tone="fixture" />
          <Box {...stock} />
          {contact(0)}
          {contact(88)}
          <For each={[[-28, -4], [-28, 36], [122, -4], [122, 36], [8, -14], [80, -14], [8, 46], [80, 46]] as ReadonlyArray<readonly [number, number]>}>
            {([x, y]) => {
              const at = iso(cx, cy, x, y, 0)
              return <ellipse cx={at[0]} cy={at[1]} rx="2.6" ry="1.3" class="panel-preview__hole" />
            }}
          </For>
        </g>
      </Match>
    </Switch>
  )
}

function LatheHoldScene(props: { readonly gripLength?: number | undefined; readonly tailstock?: boolean | undefined; readonly chuck?: "3-jaw" | "4-jaw" | "collet" | undefined }): JSX.Element {
  const grip = Math.max(8, Math.min(54, (props.gripLength ?? 12) * 1.8))
  const collet = props.chuck === "collet"
  return (
    <g>
      <line x1="38" y1="108" x2="286" y2="108" class="panel-preview__bed" />
      <line x1="42" y1="66" x2="284" y2="66" class="panel-preview__centre" />
      <Show when={collet} fallback={
        <g>
          <rect x="48" y="40" width="48" height="52" rx="2" class="panel-preview__chuck" />
          <rect x="56" y="48" width="32" height="8" rx="1" class="panel-preview__chuck-step" />
          <rect x="56" y="76" width="32" height="8" rx="1" class="panel-preview__chuck-step" />
          <Show when={props.chuck === "4-jaw"} fallback={
            <g>
              <rect x="92" y="52" width="16" height="12" rx="1" class="panel-preview__jaw" />
              <rect x="92" y="68" width="16" height="12" rx="1" class="panel-preview__jaw" />
              <rect x="92" y="84" width="16" height="12" rx="1" class="panel-preview__jaw" />
            </g>
          }>
            <g>
              <rect x="92" y="46" width="16" height="16" rx="1" class="panel-preview__jaw" />
              <rect x="92" y="70" width="16" height="16" rx="1" class="panel-preview__jaw" />
            </g>
          </Show>
        </g>
      }>
        <g>
          <rect x="48" y="46" width="38" height="40" rx="2" class="panel-preview__chuck" />
          <polygon points="86,46 108,56 108,76 86,86" class="panel-preview__jaw" />
          <line x1="96" y1="56" x2="96" y2="76" class="panel-preview__chuck-step" />
        </g>
      </Show>
      <rect x="106" y={collet ? 60 : 54} width="142" height={collet ? 12 : 24} rx="2" class="panel-preview__bar" />
      <ellipse cx="248" cy="66" rx={collet ? 3 : 5} ry={collet ? 6 : 12} class="panel-preview__bar-end" />
      <rect x="106" y={collet ? 60 : 54} width={grip} height={collet ? 12 : 24} class="panel-preview__grip" />
      <line x1="106" y1={collet ? 60 : 54} x2="106" y2={collet ? 72 : 78} class="panel-preview__contact" />
      <Show when={props.tailstock === true}>
        <polygon points="248,48 280,56 280,76 248,84" class="panel-preview__tailstock" />
        <line x1="240" y1="66" x2="248" y2="66" class="panel-preview__quill" />
        <line x1="240" y1="60" x2="240" y2="72" class="panel-preview__contact" />
      </Show>
      <Show when={props.chuck === "3-jaw"}>
        <path d="M66 34 A8 8 0 1 1 82 34" class="panel-preview__spin" />
        <polygon points="82,34 85,31 85,37" class="panel-preview__spin-head" />
      </Show>
      <Show when={props.chuck === "4-jaw"}>
        <path d="M66 34 A8 8 0 1 0 82 34" class="panel-preview__spin" />
        <polygon points="66,34 63,31 63,37" class="panel-preview__spin-head" />
      </Show>
      <Show when={collet}>
        <path d="M60 36 A8 8 0 1 1 76 36" class="panel-preview__spin" />
        <polygon points="76,36 79,33 79,39" class="panel-preview__spin-head" />
      </Show>
    </g>
  )
}

function PrinterHoldScene(props: { readonly buildHeight?: number | undefined; readonly kinematics?: "bed-slinger" | "corexy" | "delta" | "cartesian" | undefined }): JSX.Element {
  const cx = 160, cy = 58
  const partTop = 30
  return (
    <Switch>
      <Match when={props.kinematics === "corexy"}>
        <g>
          <Box cx={cx} cy={cy} x={-46} y={-28} z={-10} w={92} d={56} h={10} tone="fixture" />
          <Box cx={cx} cy={cy} x={-18} y={-12} z={0} w={36} d={24} h={partTop} />
          <rect x="52" y="26" width="216" height="8" rx="1" class="panel-preview__rail" />
          <line x1="52" y1="30" x2="268" y2="30" class="panel-preview__rail" />
          <line x1="60" y1="30" x2="260" y2="30" class="panel-preview__belt" />
          <line x1="160" y1="30" x2="160" y2="42" class="panel-preview__rail" />
          <polygon points="153,42 167,42 164,50 156,50" class="panel-preview__nozzle" />
          <rect x="46" y="22" width="12" height="12" rx="1" class="panel-preview__motor" />
          <rect x="262" y="22" width="12" height="12" rx="1" class="panel-preview__motor" />
          <line x1="52" y1="34" x2="52" y2="104" class="panel-preview__rail" />
          <line x1="268" y1="34" x2="268" y2="104" class="panel-preview__rail" />
        </g>
      </Match>
      <Match when={props.kinematics === "delta"}>
        <g>
          <ellipse cx="160" cy="98" rx="62" ry="12" class="panel-preview__plate" />
          <Box cx={cx} cy={cy + 12} x={-14} y={-10} z={0} w={28} d={20} h={26} />
          <For each={[96, 160, 224]}>
            {(x) => <line x1={x} y1="20" x2={x} y2="100" class="panel-preview__rail" />}
          </For>
          <line x1="96" y1="26" x2="152" y2="46" class="panel-preview__arm" />
          <line x1="224" y1="26" x2="168" y2="46" class="panel-preview__arm" />
          <line x1="160" y1="36" x2="160" y2="46" class="panel-preview__arm" />
          <polygon points="152,46 168,46 164,54 156,54" class="panel-preview__nozzle" />
          <circle cx="96" cy="26" r="2.4" class="panel-preview__bolt" />
          <circle cx="224" cy="26" r="2.4" class="panel-preview__bolt" />
        </g>
      </Match>
      <Match when={true}>
        <g>
          <Box cx={cx} cy={cy} x={-46} y={-28} z={-10} w={92} d={56} h={10} tone="fixture" />
          <Box cx={cx} cy={cy} x={-18} y={-12} z={0} w={36} d={24} h={partTop} />
          <line x1={iso(cx, cy, -18, 12, 0)[0]} y1={iso(cx, cy, -18, 12, 0)[1]} x2={iso(cx, cy, 18, 12, 0)[0]} y2={iso(cx, cy, 18, 12, 0)[1]} class="panel-preview__contact" />
          <line x1="52" y1="30" x2="52" y2="104" class="panel-preview__rail" />
          <line x1="268" y1="30" x2="268" y2="104" class="panel-preview__rail" />
          <line x1="52" y1="30" x2="268" y2="30" class="panel-preview__rail" />
          <line x1="160" y1="30" x2="160" y2="42" class="panel-preview__rail" />
          <polygon points="153,42 167,42 164,50 156,50" class="panel-preview__nozzle" />
          <Measure x1={282} y1={iso(cx, cy, 0, 0, 0)[1] - partTop} x2={282} y2={iso(cx, cy, 0, 0, 0)[1]} />
        </g>
      </Match>
    </Switch>
  )
}

function WorkholdingScene(props: SceneProps): JSX.Element {
  return (
    <Switch>
      <Match when={props.family === "3dprinter"}><PrinterHoldScene buildHeight={props.buildHeight} kinematics={props.kinematics} /></Match>
      <Match when={props.family === "lathe"}><LatheHoldScene gripLength={props.gripLength} tailstock={props.tailstock} chuck={props.chuck} /></Match>
      <Match when={true}><MillHoldScene holding={props.holding ?? "vise"} jawAxis={props.jawAxis ?? "x"} parallels={props.parallels ?? 0} /></Match>
    </Switch>
  )
}

// ---------------------------------------------------------------- machine

function MachineScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 60
  return (
    <Switch>
      <Match when={props.family === "lathe"}>
        <g>
          <line x1="36" y1="108" x2="286" y2="108" class="panel-preview__bed" />
          <rect x="52" y="42" width="40" height="52" rx="2" class="panel-preview__chuck" />
          <rect x="92" y="56" width="150" height="24" rx="2" class="panel-preview__bar" />
          <polygon points="250,48 276,58 276,72 250,78" class="panel-preview__turret" />
          <line x1="92" y1="66" x2="276" y2="66" class="panel-preview__centre" />
          <g class="panel-preview__axis-set">
            <line x1="44" y1="104" x2="64" y2="92" /><text x="67" y="93">X</text>
            <line x1="44" y1="104" x2="24" y2="92" /><text x="14" y="93">Z</text>
          </g>
        </g>
      </Match>
      <Match when={props.family === "3dprinter"}>
        <g>
          <Box cx={cx} cy={cy} x={-60} y={-42} z={-10} w={120} d={84} h={64} outline />
          <Box cx={cx} cy={cy} x={-48} y={-30} z={-10} w={96} d={60} h={10} tone="fixture" />
          <Box cx={cx} cy={cy} x={-20} y={-14} z={0} w={40} d={28} h={28} />
          <line x1="46" y1="28" x2="46" y2="102" class="panel-preview__rail" />
          <line x1="274" y1="28" x2="274" y2="102" class="panel-preview__rail" />
          <line x1="46" y1="28" x2="274" y2="28" class="panel-preview__rail" />
          <line x1="160" y1="28" x2="160" y2="42" class="panel-preview__rail" />
          <polygon points="153,42 167,42 164,50 156,50" class="panel-preview__nozzle" />
        </g>
      </Match>
      <Match when={props.variant === "fiveaxis"}>
        <g>
          <Trunnion cx={cx} cy={cy + 20} z={26} tilt={28} />
          <rect x="154" y="6" width="12" height="20" rx="1" class="panel-preview__spindle" />
          <line x1="160" y1="26" x2="160" y2="40" class="panel-preview__tool-line" />
          <g class="panel-preview__axis-set">
            <line x1="38" y1="108" x2="58" y2="96" /><text x="61" y="97">X</text>
            <line x1="38" y1="108" x2="18" y2="96" /><text x="8" y="97">Y</text>
            <line x1="38" y1="108" x2="38" y2="88" /><text x="34" y="84">Z</text>
          </g>
        </g>
      </Match>
      <Match when={props.variant === "router"}>
        <g>
          <Box cx={cx} cy={cy + 8} x={-70} y={-44} z={-12} w={140} d={88} h={12} tone="fixture" />
          <Box cx={cx} cy={cy + 8} x={-54} y={-30} z={0} w={108} d={60} h={5} tone="stock" />
          <line x1="70" y1="40" x2="70" y2="96" class="panel-preview__rail" />
          <line x1="250" y1="40" x2="250" y2="96" class="panel-preview__rail" />
          <line x1="70" y1="40" x2="250" y2="40" class="panel-preview__rail" />
          <rect x="154" y="34" width="12" height="16" rx="1" class="panel-preview__spindle" />
          <line x1="160" y1="50" x2="160" y2="62" class="panel-preview__tool-line" />
          <g class="panel-preview__axis-set">
            <line x1="26" y1="108" x2="46" y2="96" /><text x="49" y="97">X</text>
            <line x1="26" y1="108" x2="6" y2="96" /><text x="0" y="97">Y</text>
          </g>
        </g>
      </Match>
      <Match when={true}>
        <g>
          <Box cx={cx} cy={cy} x={-54} y={-34} z={-12} w={108} d={68} h={72} outline />
          <Box cx={cx} cy={cy} x={-10} y={-14} z={0} w={48} d={28} h={22} />
          <rect x="154" y="14" width="12" height="22" rx="1" class="panel-preview__spindle" />
          <line x1="160" y1="36" x2="160" y2="48" class="panel-preview__tool-line" />
          <g class="panel-preview__axis-set">
            <line x1="38" y1="104" x2="58" y2="92" /><text x="61" y="93">X</text>
            <line x1="38" y1="104" x2="18" y2="92" /><text x="8" y="93">Y</text>
            <line x1="38" y1="104" x2="38" y2="84" /><text x="34" y="80">Z</text>
          </g>
        </g>
      </Match>
    </Switch>
  )
}

// ---------------------------------------------------------------- material

function MaterialScene(props: SceneProps): JSX.Element {
  const hatch = createUniqueId()
  const tone = materialTone(props.material)
  return (
    <Show when={props.family !== "3dprinter"} fallback={
      <g>
        <line x1="44" y1="104" x2="276" y2="104" class="panel-preview__bed" />
        <circle cx="102" cy="56" r="27" class="panel-preview__spool" />
        <circle cx="102" cy="56" r="15" class="panel-preview__spool-hub" />
        <circle cx="102" cy="56" r="7" class="panel-preview__spool-core" />
        <path d="M129 52 C158 44 176 52 196 64" class="panel-preview__filament" />
        <polygon points="190,60 202,64 194,72" class="panel-preview__nozzle" />
        <line x1="198" y1="72" x2="198" y2="100" class="panel-preview__bead" />
        <line x1="160" y1="100" x2="248" y2="100" class="panel-preview__bead-line" />
      </g>
    }>
      <g>
        <Hatch id={hatch} kind={hatchOf(tone)} />
        <Box cx={160} cy={58} x={-42} y={-18} z={-26} w={84} d={36} h={26} tone={tone} topFill={`url(#${hatch})`} />
        <Box cx={160} cy={58} x={52} y={12} z={-8} w={16} d={14} h={8} tone={tone} />
        <line x1="106" y1="82" x2="148" y2="82" class="panel-preview__section" />
        <line x1="196" y1="82" x2="218" y2="82" class="panel-preview__section" />
      </g>
    </Show>
  )
}

// ---------------------------------------------------------------- cutting

function CuttingScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 54
  const ae = ((props.stepover ?? 45) / 100) * (props.toolDiameter ?? 6)
  const ap = props.stepdown ?? 2
  return (
    <g>
      <Box cx={cx} cy={cy} x={-48} y={-24} z={-30} w={96} d={48} h={30} />
      <polygon
        points={pts([iso(cx, cy, -22, -10, 0), iso(cx, cy, 36, -10, 0), iso(cx, cy, 36, 16, 0), iso(cx, cy, -22, 16, 0)])}
        class="panel-preview__pocket"
      />
      <circle cx="170" cy="72" r="14" class="panel-preview__cutter-ring" />
      <circle cx="170" cy="72" r="10" class="panel-preview__cutter" />
      <For each={[0, 90, 180, 270]}>
        {(angle) => {
          const rad = angle * Math.PI / 180
          return <line x1={170 + Math.cos(rad) * 4} y1={72 + Math.sin(rad) * 4} x2={170 + Math.cos(rad) * 10} y2={72 + Math.sin(rad) * 10} class="panel-preview__flute" />
        }}
      </For>
      <line x1="170" y1="72" x2="170" y2="34" class="panel-preview__shank" />
      <circle cx="170" cy="72" r="1.6" class="panel-preview__centre-dot" />
      <Measure x1={188} y1={72} x2={214} y2={72} label="ae" />
      <Measure x1={226} y1={78} x2={226} y2={104} label="ap" />
      <text x="100" y="120" class="panel-preview__caption-note">{`ae ${mm(ae)} · ap ${mm(ap)}`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- fixed cycles

function FixedCyclesScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 58
  const actual = props.holes ?? []
  const fallback: ReadonlyArray<{ x: number; y: number }> = [{ x: -28, y: -12 }, { x: 0, y: -12 }, { x: 28, y: -12 }, { x: -28, y: 12 }, { x: 0, y: 12 }, { x: 28, y: 12 }]
  const points = actual.length > 0 ? actual.slice(0, 8).map((hole) => ({ x: hole.x, y: hole.y })) : fallback
  const spread = (values: number[]): readonly [number, number] => values.length === 0 ? [-28, 28] : [Math.min(...values), Math.max(...values)]
  const xs = spread(points.map((point) => point.x))
  const ys = spread(points.map((point) => point.y))
  const map = (value: number, min: number, max: number, span: number): number => max - min < 1e-6 ? 0 : ((value - min) / (max - min) - 0.5) * span
  const mapped = points.map((point) => ({ x: map(point.x, xs[0], xs[1], 52), y: map(point.y, ys[0], ys[1], 22) }))
  const first = mapped[0] ?? { x: 0, y: 0 }
  const firstAt = iso(cx, cy, first.x, first.y, 0)
  return (
    <g>
      <Box cx={cx} cy={cy} x={-48} y={-26} z={-18} w={96} d={52} h={18} />
      <For each={mapped}>
        {(hole) => {
          const at = iso(cx, cy, hole.x, hole.y, 0)
          return <ellipse cx={at[0]} cy={at[1]} rx="4.2" ry="2.2" class="panel-preview__hole" />
        }}
      </For>
      <line x1={firstAt[0]} y1={firstAt[1] - 34} x2={firstAt[0]} y2={firstAt[1] - 6} class="panel-preview__drill-line" />
      <polygon points={`${firstAt[0] - 3},${firstAt[1] - 4} ${firstAt[0] + 3},${firstAt[1] - 4} ${firstAt[0]},${firstAt[1] + 3}`} class="panel-preview__drill-tip" />
      <Measure x1={firstAt[0] + 8} y1={firstAt[1] - 12} x2={firstAt[0] + 8} y2={firstAt[1] + 2} label="Z" />
      <text x="82" y="118" class="panel-preview__caption-note">{`${points.length} × G81`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- lathe

function LatheScene(props: SceneProps): JSX.Element {
  const op = props.operation ?? (props.turning === "internal" ? "boring" : props.turning === "face" ? "facing" : "turning")
  const cy = 66
  const inner = op === "boring" || props.turning === "internal"
  const groove = op === "grooving"
  const parting = op === "parting"
  const thread = op === "threading" || op === "knurling"
  return (
    <g>
      <line x1="34" y1="108" x2="288" y2="108" class="panel-preview__bed" />
      <line x1="44" y1={cy} x2="284" y2={cy} class="panel-preview__centre" />
      <rect x="44" y="38" width="42" height="56" rx="2" class="panel-preview__chuck" />
      <rect x="86" y="52" width="12" height="12" rx="1" class="panel-preview__jaw" />
      <rect x="86" y="68" width="12" height="12" rx="1" class="panel-preview__jaw" />
      <rect x="86" y="84" width="12" height="12" rx="1" class="panel-preview__jaw" />
      <polygon points={`98,48 190,48 190,56 250,56 250,76 190,76 190,84 98,84`} class="panel-preview__bar" />
      <line x1="98" y1="48" x2="190" y2="48" class="panel-preview__bar-edge" />
      <line x1="98" y1="84" x2="190" y2="84" class="panel-preview__bar-edge" />
      <Show when={inner}>
        <line x1="98" y1="58" x2="248" y2="58" class="panel-preview__bore" />
        <line x1="98" y1="74" x2="248" y2="74" class="panel-preview__bore" />
        <polygon points="196,58 203,58 200,74 193,74" class="panel-preview__tool" />
      </Show>
      <Show when={groove}>
        <rect x="190" y="48" width="9" height="9" class="panel-preview__groove" />
        <rect x="190" y="75" width="9" height="9" class="panel-preview__groove" />
      </Show>
      <Show when={parting}>
        <line x1="224" y1="44" x2="224" y2="88" class="panel-preview__part-line" />
      </Show>
      <Show when={thread}>
        <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
          {(index) => <line x1={112 + index * 11} y1="48" x2={118 + index * 11} y2="42" class="panel-preview__thread" />}
        </For>
        <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
          {(index) => <line x1={112 + index * 11} y1="84" x2={118 + index * 11} y2="90" class="panel-preview__thread" />}
        </For>
      </Show>
      <Show when={!inner}>
        <Show when={groove} fallback={
          <Show when={parting} fallback={
            <g>
              <polygon points="204,46 214,40 218,46 208,52" class="panel-preview__tool" />
              <line x1="214" y1="42" x2="236" y2="24" class="panel-preview__holder" />
            </g>
          }>
            <g>
              <polygon points="220,42 228,34 234,40 226,48" class="panel-preview__tool" />
              <line x1="230" y1="36" x2="250" y2="20" class="panel-preview__holder" />
            </g>
          </Show>
        }>
          <g>
            <polygon points="194,57 202,57 199,73 191,73" class="panel-preview__tool" />
            <line x1="196" y1="57" x2="214" y2="36" class="panel-preview__holder" />
          </g>
        </Show>
      </Show>
      <Measure x1={98} y1={102} x2={250} y2={102} label={props.stockLength === undefined ? undefined : `${mm(props.stockLength)}`} />
      <text x="60" y="94" class="panel-preview__caption-note">{props.stockDiameter === undefined ? "Ø" : `Ø ${mm(props.stockDiameter)}`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- print profile

function PrintProfileScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 64
  const layers = [0, 9, 18]
  const walls = Math.max(1, Math.min(5, Math.round(props.walls ?? 3)))
  const infill = Math.max(0, Math.min(100, Math.round(props.infill ?? 20)))
  const hatch = createUniqueId()
  return (
    <g>
      <Hatch id={hatch} kind="metal" />
      <For each={layers}>
        {(z) => <Box cx={cx} cy={cy} x={0} y={0} z={z} w={68} d={38} h={6} tone="print-layer" />}
      </For>
      <For each={Array.from({ length: walls }, (_, index) => index)}>
        {(index) => {
          const inset = 5 + index * 4
          return <polygon points={pts([iso(cx, cy, inset, inset, 24), iso(cx, cy, 68 - inset, inset, 24), iso(cx, cy, 68 - inset, 38 - inset, 24), iso(cx, cy, inset, 38 - inset, 24)])} class="panel-preview__wall" />
        }}
      </For>
      <Show when={infill > 0}>
        <For each={[10, 16, 22, 28]}>
          {(y) => <line x1={iso(cx, cy, 10, y, 24)[0]} y1={iso(cx, cy, 10, y, 24)[1]} x2={iso(cx, cy, 58, y, 24)[0]} y2={iso(cx, cy, 58, y, 24)[1]} class="panel-preview__infill" />}
        </For>
      </Show>
      <Measure x1={246} y1={18} x2={246} y2={27} label={props.layerHeight === undefined ? undefined : `${mm(props.layerHeight)}`} />
      <Measure x1={248} y1={9} x2={248} y2={18} />
      <Measure x1={250} y1={0} x2={250} y2={9} />
      <text x="78" y="116" class="panel-preview__caption-note">{`${infill}% · ${props.layerHeight === undefined ? "—" : mm(props.layerHeight)} mm`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- advanced

function AdvancedScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 64
  const tabs = Math.max(0, Math.min(8, Math.round(props.tabs ?? 0)))
  return (
    <g>
      <Box cx={cx} cy={cy} x={-46} y={-26} z={-8} w={92} d={52} h={8} tone="fixture" />
      <rect x="104" y="36" width="112" height="56" rx="8" class="panel-preview__stock-top" />
      <rect x="112" y="44" width="96" height="40" rx="6" class="panel-preview__contour" />
      <Show when={props.finishing === true}>
        <rect x="117" y="49" width="86" height="30" rx="5" class="panel-preview__finish" />
      </Show>
      <path d="M76 26 L94 26 L104 36" class="panel-preview__lead" />
      <path d="M208 76 L216 88" class="panel-preview__lead" />
      <Show when={props.arcFitting === true}>
        <path d="M196 44 A8 8 0 0 1 204 52" class="panel-preview__arc" />
        <text x="208" y="42" class="panel-preview__caption-note">G2</text>
      </Show>
      <Show when={tabs > 0}>
        <For each={Array.from({ length: tabs }, (_, index) => index)}>
          {(index) => {
            const x = 112 + ((index + 1) * 96) / (tabs + 1)
            return <rect x={x - 3} y="80" width="6" height="8" rx="1" class="panel-preview__tab" />
          }}
        </For>
        <line x1="166" y1="88" x2="184" y2="100" class="panel-preview__leader" />
        <text x="187" y="104" class="panel-preview__caption-note">tab</text>
      </Show>
      <Show when={props.rest === true}>
        <circle cx="156" cy="64" r="17" class="panel-preview__rest" />
      </Show>
      <Measure x1={112} y1={26} x2={208} y2={26} label={props.tolerance === undefined ? undefined : `tol ${mm(props.tolerance)}`} />
    </g>
  )
}

// ---------------------------------------------------------------- ai

function AiScene(props: SceneProps): JSX.Element {
  const enabled = props.ai !== false
  return (
    <g classList={{ "panel-preview__ai--off": !enabled }}>
      <rect x="22" y="34" width="108" height="58" rx="5" class="panel-preview__prompt" />
      <path d="M32 48 L36 52 L32 56" class="panel-preview__prompt-mark" />
      <text x="44" y="56" class="panel-preview__prompt-text">{props.operation ?? "—"}</text>
      <line x1="32" y1="68" x2="118" y2="68" class="panel-preview__quiet-line" />
      <line x1="32" y1="78" x2="94" y2="78" class="panel-preview__quiet-line" />
      <path d={enabled ? "M134 62 L158 62" : "M134 62 L158 62"} class={enabled ? "panel-preview__flow" : "panel-preview__flow panel-preview__flow--off"} />
      <polygon points={enabled ? "158,62 151,58 151,66" : "158,62 151,58 151,66"} class={enabled ? "panel-preview__flow-head" : "panel-preview__flow-head panel-preview__flow-head--off"} />
      <rect x="166" y="30" width="132" height="66" rx="5" class="panel-preview__params" />
      <text x="178" y="48" class="panel-preview__param-label">S</text>
      <text x="196" y="48" class="panel-preview__param-value">{props.rpm === undefined ? "—" : String(Math.round(props.rpm))}</text>
      <line x1="178" y1="56" x2="276" y2="56" class="panel-preview__quiet-line" />
      <text x="178" y="72" class="panel-preview__param-label">F</text>
      <text x="196" y="72" class="panel-preview__param-value">{props.feedrate === undefined ? "—" : String(Math.round(props.feedrate))}</text>
      <line x1="178" y1="80" x2="258" y2="80" class="panel-preview__quiet-line" />
      <text x="22" y="112" class="panel-preview__caption-note">{props.aiDifficulty ?? (enabled ? "on" : "off")}</text>
    </g>
  )
}

// ---------------------------------------------------------------- evidence

const statusClass = (status: string): string => status === "passed" ? "panel-preview__check--ok" : status === "failed" ? "panel-preview__check--bad" : "panel-preview__check--warn"

function EvidenceScene(props: SceneProps): JSX.Element {
  const checks = (props.checks ?? []).slice(0, 4)
  return (
    <g>
      <rect x="34" y="24" width="252" height="82" rx="5" class="panel-preview__report" />
      <line x1="46" y1="36" x2="172" y2="36" class="panel-preview__quiet-line" />
      <For each={checks}>
        {(check, index) => {
          const y = 50 + index() * 12
          return (
            <g class={statusClass(check.status)}>
              <circle cx="50" cy={y - 2} r="3.4" class="panel-preview__check" />
              <path d={check.status === "passed" ? `M48 ${y - 2} L49.5 ${y - 0.5} L52 ${y - 4}` : check.status === "failed" ? `M48.5 ${y - 4} L51.5 ${y - 0.5} M51.5 ${y - 4} L48.5 ${y - 0.5}` : `M50 ${y - 5} L50 ${y - 1} M50 ${y + 0.5} L50 ${y + 1}`} class="panel-preview__check-mark" />
              <line x1="60" y1={y - 2} x2={index() === 1 ? 178 : 210} y2={y - 2} class="panel-preview__quiet-line" />
            </g>
          )
        }}
      </For>
      <Show when={props.hash}>{(hash) => <text x="46" y="98" class="panel-preview__hash">{hash().slice(0, 18)}</text>}</Show>
      <text x="238" y="98" class="panel-preview__caption-note">{`${checks.filter((check) => check.status === "passed").length}/${checks.length}`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- setups

/** Which face of the part looks at the spindle for a manual set-up, with the way the tool comes to it. */
const FACING: Readonly<Record<string, { readonly face: (w: number, d: number, h: number) => ReadonlyArray<readonly [number, number, number]>; readonly from: readonly [number, number, number]; readonly hidden: boolean }>> = {
  "+Z": { face: (w, d, h) => [[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], from: [0, 0, 1], hidden: false },
  "-Z": { face: (w, d) => [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], from: [0, 0, -1], hidden: true },
  "+X": { face: (w, d, h) => [[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]], from: [1, 0, 0], hidden: false },
  "-X": { face: (_w, d, h) => [[0, 0, 0], [0, d, 0], [0, d, h], [0, 0, h]], from: [-1, 0, 0], hidden: true },
  "+Y": { face: (w, d, h) => [[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]], from: [0, 1, 0], hidden: false },
  "-Y": { face: (w, _d, h) => [[0, 0, 0], [w, 0, 0], [w, 0, h], [0, 0, h]], from: [0, -1, 0], hidden: true }
}

function KernelSetupScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 72
  const orientation = props.orientation ?? "+Z"
  const facing = FACING[orientation] ?? FACING["+Z"]!
  const w = 60, d = 34, h = 30
  const at = (x: number, y: number, z: number): XY => iso(cx, cy, x - w / 2, y - d / 2, z)
  const corners = facing.face(w, d, h)
  const centre = corners.reduce<readonly [number, number, number]>((sum, [x, y, z]) => [sum[0] + x / corners.length, sum[1] + y / corners.length, sum[2] + z / corners.length], [0, 0, 0])
  const tip = at(...centre)
  const start = at(centre[0] + facing.from[0] * 40, centre[1] + facing.from[1] * 40, centre[2] + facing.from[2] * 40)
  const dx = tip[0] - start[0], dy = tip[1] - start[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  return (
    <g>
      <Box cx={cx} cy={cy} x={-w / 2 - 14} y={-d / 2 - 10} z={-10} w={w + 28} d={d + 20} h={10} tone="fixture" />
      <Box cx={cx} cy={cy} x={-w / 2} y={-d / 2} z={0} w={w} d={d} h={h} />
      <polygon points={pts(corners.map(([x, y, z]) => at(x, y, z)))} class={facing.hidden ? "panel-preview__face-lit panel-preview__face-lit--hidden" : "panel-preview__face-lit"} />
      <line x1={start[0]} y1={start[1]} x2={tip[0] - ux * 4} y2={tip[1] - uy * 4} class="panel-preview__setup-arrow" />
      <polygon points={`${tip[0]},${tip[1]} ${tip[0] - ux * 9 - uy * 4},${tip[1] - uy * 9 + ux * 4} ${tip[0] - ux * 9 + uy * 4},${tip[1] - uy * 9 - ux * 4}`} class="panel-preview__setup-head" />
      <text x={Math.max(12, Math.min(284, start[0] + 8))} y={Math.max(14, Math.min(118, start[1]))} class="panel-preview__caption-note">{orientation}</text>
    </g>
  )
}

// ---------------------------------------------------------------- origin

/** The zero of the program: a marker on the stock, the machine zero beside it, a lathe's face or chuck, a printer's plate. */
function OriginScene(props: SceneProps): JSX.Element {
  const kind = props.originKind ?? "center"
  return (
    <Switch>
      <Match when={props.family === "lathe"}>
        <g>
          <line x1="34" y1="108" x2="288" y2="108" class="panel-preview__bed" />
          <line x1="44" y1="66" x2="284" y2="66" class="panel-preview__centre" />
          <rect x="44" y="38" width="42" height="56" rx="2" class="panel-preview__chuck" />
          <rect x="86" y="52" width="12" height="28" rx="1" class="panel-preview__jaw" />
          <rect x="98" y="48" width="152" height="36" rx="2" class="panel-preview__bar" />
          <line x1="98" y1="48" x2="98" y2="84" class="panel-preview__contact" />
          <circle cx={kind === "chuck" ? 98 : 250} cy="66" r="3.4" class="panel-preview__origin-dot" />
          <line x1={kind === "chuck" ? 98 : 250} y1="66" x2={kind === "chuck" ? 150 : 198} y2="66" class="panel-preview__setup-arrow" />
          <polygon points={kind === "chuck" ? "158,66 150,62 150,70" : "190,66 198,62 198,70"} class="panel-preview__setup-head" />
          <text x={kind === "chuck" ? 104 : 232} y="40" class="panel-preview__axis">Z0</text>
        </g>
      </Match>
      <Match when={props.family === "3dprinter"}>
        <g>
          <Box cx={160} cy={62} x={-60} y={-40} z={-10} w={120} d={80} h={10} tone="fixture" />
          <Box cx={160} cy={62} x={-16} y={-12} z={0} w={32} d={24} h={22} />
          <circle cx={iso(160, 62, kind === "center" ? 0 : -60, kind === "center" ? 0 : 40, 0)[0]} cy={iso(160, 62, kind === "center" ? 0 : -60, kind === "center" ? 0 : 40, 0)[1]} r="3.6" class="panel-preview__origin-dot" />
          <text x={iso(160, 62, kind === "center" ? 0 : -60, kind === "center" ? 0 : 40, 0)[0] + 8} y={iso(160, 62, kind === "center" ? 0 : -60, kind === "center" ? 0 : 40, 0)[1] + 12} class="panel-preview__axis">XY0</text>
        </g>
      </Match>
      <Match when={true}>
        {(() => {
          const cx = 168, cy = 66, w = 100, d = 52, h = 18
          const spot: Record<string, readonly [number, number, number]> = { center: [w / 2, d / 2, h], corner: [0, d, h], machine: [-34, d + 22, 0] }
          const [px, py, pz] = spot[kind] ?? spot["center"]!
          const marker = iso(cx, cy, px - w / 2, py - d / 2, pz)
          const corner = iso(cx, cy, -w / 2, d / 2, h)
          const axisX = iso(cx, cy, px - w / 2 + 36, py - d / 2, pz), axisY = iso(cx, cy, px - w / 2, py - d / 2 - 26, pz)
          return (
            <g>
              <Box cx={cx} cy={cy} x={-w / 2 - 12} y={-d / 2 - 12} z={-10} w={w + 24} d={d + 24} h={10} tone="fixture" />
              <Box cx={cx} cy={cy} x={-w / 2} y={-d / 2} z={0} w={w} d={d} h={h} />
              <Show when={kind === "machine"}>
                <line x1={marker[0]} y1={marker[1]} x2={corner[0]} y2={corner[1]} class="panel-preview__leader" />
              </Show>
              <line x1={marker[0]} y1={marker[1]} x2={axisX[0]} y2={axisX[1]} class="panel-preview__setup-arrow" />
              <line x1={marker[0]} y1={marker[1]} x2={axisY[0]} y2={axisY[1]} class="panel-preview__setup-arrow" />
              <text x={axisX[0] + 4} y={axisX[1] + 10} class="panel-preview__axis">X</text>
              <text x={axisY[0] + 4} y={axisY[1] - 2} class="panel-preview__axis">Y</text>
              <circle cx={marker[0]} cy={marker[1]} r="3.6" class="panel-preview__origin-dot" />
              <Show when={props.offset}>{(offset) => <text x="22" y="26" class="panel-preview__offset">{offset()}</text>}</Show>
            </g>
          )
        })()}
      </Match>
    </Switch>
  )
}

// ---------------------------------------------------------------- post

/** The first lines a dialect writes, as code on a quiet card. */
function PostScene(props: SceneProps): JSX.Element {
  const lines = (props.postLines ?? []).slice(0, 6)
  return (
    <g>
      <rect x="24" y="14" width="272" height="100" rx="5" class="panel-preview__report" />
      <For each={lines}>
        {(line, index) => <text x="38" y={34 + index() * 15} class="panel-preview__code">{line}</text>}
      </For>
      <Show when={lines.length === 0}>
        <For each={[0, 1, 2, 3]}>
          {(index) => <line x1="38" y1={34 + index * 15} x2={150 + (index % 2) * 60} y2={34 + index * 15} class="panel-preview__quiet-line" />}
        </For>
      </Show>
    </g>
  )
}

// ---------------------------------------------------------------- tool

/** A lathe insert on its holder, a parting blade or a printer nozzle: the tools the kernel's mill assemblies do not cover. */
function ToolGlyphScene(props: SceneProps): JSX.Element {
  return (
    <Switch>
      <Match when={props.family === "3dprinter"}>
        <g>
          <line x1="44" y1="104" x2="276" y2="104" class="panel-preview__bed" />
          <rect x="140" y="12" width="40" height="22" rx="2" class="panel-preview__spindle" />
          <polygon points="146,34 174,34 166,64 154,64" class="panel-preview__nozzle" />
          <line x1="160" y1="64" x2="160" y2="86" class="panel-preview__bead" />
          <line x1="104" y1="92" x2="216" y2="92" class="panel-preview__bead-line" />
          <Measure x1={192} y1={34} x2={192} y2={64} />
          <text x="204" y="52" class="panel-preview__caption-note">{props.nozzle === undefined ? "" : `Ø ${mm(props.nozzle)}`}</text>
        </g>
      </Match>
      <Match when={true}>
        <g>
          <line x1="34" y1="108" x2="288" y2="108" class="panel-preview__bed" />
          <line x1="44" y1="66" x2="284" y2="66" class="panel-preview__centre" />
          <rect x="60" y="48" width="130" height="36" rx="2" class="panel-preview__bar" />
          <Show when={props.operation === "parting"} fallback={
            <g>
              <polygon points="196,50 206,44 212,50 202,56" class="panel-preview__tool" />
              <line x1="208" y1="46" x2="244" y2="14" class="panel-preview__holder" />
            </g>
          }>
            <g>
              <line x1="146" y1="44" x2="146" y2="88" class="panel-preview__part-line" />
              <polygon points="140,36 152,36 150,48 142,48" class="panel-preview__tool" />
              <line x1="146" y1="36" x2="146" y2="8" class="panel-preview__holder" />
            </g>
          </Show>
        </g>
      </Match>
    </Switch>
  )
}

// ---------------------------------------------------------------- stock

/** The raw piece to scale, with its three dimensions. */
function StockScene(props: SceneProps): JSX.Element {
  const size = props.stock ?? { x: 100, y: 100, z: 20 }
  const scale = Math.min(96 / Math.max(size.x, size.y), 70 / size.z, 1.4)
  const w = size.x * scale, d = size.y * scale, h = Math.max(6, size.z * scale)
  const cx = 160, cy = 62
  const a = iso(cx, cy, -w / 2, d / 2, 0), b = iso(cx, cy, w / 2, d / 2, 0), c = iso(cx, cy, w / 2, -d / 2, 0)
  return (
    <g>
      <Box cx={cx} cy={cy} x={-w / 2} y={-d / 2} z={0} w={w} d={d} h={h} />
      <Measure x1={a[0] + 4} y1={a[1] + 12} x2={b[0] + 4} y2={b[1] + 12} label={mm(size.x)} />
      <Measure x1={b[0] + 12} y1={b[1] + 4} x2={c[0] + 12} y2={c[1] + 4} label={mm(size.y)} />
      <Measure x1={c[0] + 10} y1={c[1] - h} x2={c[0] + 10} y2={c[1]} label={mm(size.z)} />
    </g>
  )
}

// ---------------------------------------------------------------- verified print

function PrintVerifyScene(props: SceneProps): JSX.Element {
  const cx = 160, cy = 60
  return (
    <g>
      <Box cx={cx} cy={cy} x={-50} y={-30} z={-10} w={100} d={60} h={10} tone="fixture" />
      <Box cx={cx} cy={cy} x={-20} y={-14} z={0} w={40} d={28} h={28} />
      <line x1={iso(cx, cy, -20, 14, 0)[0]} y1={iso(cx, cy, -20, 14, 0)[1]} x2={iso(cx, cy, 20, 14, 0)[0]} y2={iso(cx, cy, 20, 14, 0)[1]} class="panel-preview__contact" />
      <line x1="160" y1="16" x2="160" y2="34" class="panel-preview__rail" />
      <polygon points="151,34 169,34 165,44 155,44" class="panel-preview__nozzle" />
      <line x1="160" y1="44" x2="160" y2="52" class="panel-preview__filament" />
      <Measure x1={iso(cx, cy, -50, 30, 0)[0]} y1={iso(cx, cy, -50, 30, 0)[1] + 10} x2={iso(cx, cy, 50, 30, 0)[0]} y2={iso(cx, cy, 50, 30, 0)[1] + 10} label={props.bed === undefined ? undefined : `${mm(props.bed.width)} × ${mm(props.bed.depth)}`} />
      <text x="214" y="34" class="panel-preview__caption-note">{props.nozzle === undefined ? "nozzle" : `Ø ${mm(props.nozzle)}`}</text>
    </g>
  )
}

// ---------------------------------------------------------------- root

const label = (props: { readonly title?: string | undefined; readonly detail?: string | undefined; readonly chip?: string | undefined }): string =>
  [props.title, props.detail, props.chip].filter((value): value is string => value !== undefined && value !== "").join(" · ")

/** The drawing alone: the scene of `kind` inside the shared 320 x 128 viewBox, or the real tool assembly for a cutter. */
export function SectionScene(props: SceneProps & { readonly title?: string | undefined; readonly height?: number | undefined }): JSX.Element {
  return (
    <Show when={props.kind === "tool" && props.cutter !== undefined} fallback={
      <svg viewBox="0 0 320 128" role="img" aria-label={label(props)} data-example={props.kind}>
        <g class="panel-preview__scene">
          <Show when={props.kind === "workholding"}><WorkholdingScene {...props} /></Show>
          <Show when={props.kind === "machine"}><MachineScene {...props} /></Show>
          <Show when={props.kind === "material"}><MaterialScene {...props} /></Show>
          <Show when={props.kind === "cutting"}><CuttingScene {...props} /></Show>
          <Show when={props.kind === "fixed-cycles"}><FixedCyclesScene {...props} /></Show>
          <Show when={props.kind === "lathe"}><LatheScene {...props} /></Show>
          <Show when={props.kind === "print-profile"}><PrintProfileScene {...props} /></Show>
          <Show when={props.kind === "advanced"}><AdvancedScene {...props} /></Show>
          <Show when={props.kind === "ai"}><AiScene {...props} /></Show>
          <Show when={props.kind === "evidence"}><EvidenceScene {...props} /></Show>
          <Show when={props.kind === "kernel-setup"}><KernelSetupScene {...props} /></Show>
          <Show when={props.kind === "print-verify"}><PrintVerifyScene {...props} /></Show>
          <Show when={props.kind === "origin"}><OriginScene {...props} /></Show>
          <Show when={props.kind === "post"}><PostScene {...props} /></Show>
          <Show when={props.kind === "tool"}><ToolGlyphScene {...props} /></Show>
          <Show when={props.kind === "stock"}><StockScene {...props} /></Show>
        </g>
      </svg>
    }>
      <div class="setup-tool" data-example="tool" role="img" aria-label={label(props)}>
        <ToolSilhouette cutter={props.cutter!} height={props.height ?? 92} class="setup-tool__silhouette" />
        <div class="setup-tool__floor" aria-hidden="true" />
      </div>
    </Show>
  )
}

export function SectionExample(props: SectionExampleProps): JSX.Element {
  return (
    <PreviewStage title={props.title} detail={props.detail} chip={props.chip} testId={props.testId} compact ariaLabel={label(props)}>
      <SectionScene {...props} />
    </PreviewStage>
  )
}
