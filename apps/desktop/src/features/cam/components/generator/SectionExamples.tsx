/**
 * One parameterised miniature for every generator section that used to explain itself with words alone. The scenes
 * share the preview viewport of `PreviewStage`: same ground, grid, caption, mono chip, face shades and line weights as
 * the origin / geometry / operation diagrams. Values come from the live settings; anything not available cheaply is
 * left out rather than invented.
 */
import { For, Show, createUniqueId, type JSX } from "solid-js"
import { PreviewStage } from "./PreviewStage.tsx"

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

export interface SectionExampleProps {
  readonly kind: SectionExampleKind
  readonly title: string
  readonly testId: string
  readonly detail?: string | undefined
  readonly chip?: string | undefined
  readonly family?: "mill" | "lathe" | "3dprinter" | undefined
  readonly holding?: "vise" | "clamps" | "plate" | "none" | undefined
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

function MillHoldScene(props: { readonly holding: "vise" | "clamps" | "plate" | "none"; readonly jawAxis: "x" | "y" }): JSX.Element {
  const cx = 160, cy = 56
  const stock = { cx, cy, x: 0, y: 0, z: 0, w: 88, d: 32, h: 32 }
  const contact = (x: number): JSX.Element => {
    const a = iso(cx, cy, x, 32, 0), b = iso(cx, cy, x, 32, 32)
    return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="panel-preview__contact" />
  }
  return (
    <Show when={props.holding !== "none"} fallback={
      <g>
        <Box cx={cx} cy={cy} x={-26} y={-4} z={-24} w={140} d={40} h={12} tone="fixture" />
        <Box {...stock} />
        <line x1={iso(cx, cy, 44, 16, 0)[0]} y1={iso(cx, cy, 44, 16, 0)[1]} x2={iso(cx, cy, 44, 16, -12)[0]} y2={iso(cx, cy, 44, 16, -12)[1]} class="panel-preview__drop" />
        <circle cx={iso(cx, cy, 44, 16, -12)[0]} cy={iso(cx, cy, 44, 16, -12)[1]} r="2" class="panel-preview__open" />
      </g>
    }>
      <Box cx={cx} cy={cy} x={-22} y={-4} z={-12} w={132} d={40} h={12} tone="fixture" />
      <Show when={props.holding === "vise"}>
        <Box cx={cx} cy={cy} x={-13} y={0} z={0} w={13} d={32} h={46} tone="jaw" />
        <Box cx={cx} cy={cy} x={88} y={0} z={0} w={13} d={32} h={46} tone="jaw" />
        <Box {...stock} />
        {contact(0)}
        {contact(88)}
        <line x1={iso(cx, cy, -8, 32, 44)[0]} y1={iso(cx, cy, -8, 32, 44)[1]} x2={iso(cx, cy, 4, 32, 37)[0]} y2={iso(cx, cy, 4, 32, 37)[1]} class="panel-preview__force" />
        <line x1={iso(cx, cy, 96, 32, 44)[0]} y1={iso(cx, cy, 96, 32, 44)[1]} x2={iso(cx, cy, 84, 32, 37)[0]} y2={iso(cx, cy, 84, 32, 37)[1]} class="panel-preview__force" />
        <circle cx={iso(cx, cy, 44, 16, 32)[0]} cy={iso(cx, cy, 44, 16, 32)[1]} r="2.4" class="panel-preview__contact-dot" />
        <text x={iso(cx, cy, 0, 40, 48)[0]} y={iso(cx, cy, 0, 40, 48)[1]} text-anchor="middle" class="panel-preview__axis">{props.jawAxis.toUpperCase()}</text>
      </Show>
      <Show when={props.holding === "clamps"}>
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
      </Show>
      <Show when={props.holding === "plate"}>
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
      </Show>
    </Show>
  )
}

function LatheHoldScene(props: { readonly gripLength?: number | undefined; readonly tailstock?: boolean | undefined; readonly chuck?: "3-jaw" | "4-jaw" | "collet" | undefined }): JSX.Element {
  const grip = Math.max(8, Math.min(54, (props.gripLength ?? 12) * 1.8))
  return (
    <g>
      <line x1="38" y1="108" x2="286" y2="108" class="panel-preview__bed" />
      <line x1="42" y1="66" x2="284" y2="66" class="panel-preview__centre" />
      <rect x="48" y="40" width="48" height="52" rx="2" class="panel-preview__chuck" />
      <rect x="56" y="48" width="32" height="8" rx="1" class="panel-preview__chuck-step" />
      <rect x="56" y="76" width="32" height="8" rx="1" class="panel-preview__chuck-step" />
      <rect x="92" y="52" width="16" height="12" rx="1" class="panel-preview__jaw" />
      <rect x="92" y="68" width="16" height="12" rx="1" class="panel-preview__jaw" />
      <rect x="92" y="84" width="16" height="12" rx="1" class="panel-preview__jaw" />
      <rect x="106" y="54" width="142" height="24" rx="2" class="panel-preview__bar" />
      <ellipse cx="248" cy="66" rx="5" ry="12" class="panel-preview__bar-end" />
      <rect x="106" y="54" width={grip} height="24" class="panel-preview__grip" />
      <line x1="106" y1="54" x2="106" y2="78" class="panel-preview__contact" />
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
    </g>
  )
}

function PrinterHoldScene(props: { readonly buildHeight?: number | undefined }): JSX.Element {
  const cx = 160, cy = 58
  const partTop = 30
  return (
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
  )
}

function WorkholdingScene(props: SectionExampleProps): JSX.Element {
  return (
    <Show when={props.family !== "3dprinter"} fallback={<PrinterHoldScene buildHeight={props.buildHeight} />}>
      <Show when={props.family === "lathe"} fallback={<MillHoldScene holding={props.holding ?? "vise"} jawAxis={props.jawAxis ?? "x"} />}>
        <LatheHoldScene gripLength={props.gripLength} tailstock={props.tailstock} chuck={props.chuck} />
      </Show>
    </Show>
  )
}

// ---------------------------------------------------------------- machine

function MachineScene(props: SectionExampleProps): JSX.Element {
  const cx = 160, cy = 60
  return (
    <Show when={props.family !== "lathe"} fallback={
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
    }>
      <Show when={props.family !== "3dprinter"} fallback={
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
      }>
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
      </Show>
    </Show>
  )
}

// ---------------------------------------------------------------- material

function MaterialScene(props: SectionExampleProps): JSX.Element {
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

function CuttingScene(props: SectionExampleProps): JSX.Element {
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

function FixedCyclesScene(props: SectionExampleProps): JSX.Element {
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

function LatheScene(props: SectionExampleProps): JSX.Element {
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

function PrintProfileScene(props: SectionExampleProps): JSX.Element {
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

function AdvancedScene(props: SectionExampleProps): JSX.Element {
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

function AiScene(props: SectionExampleProps): JSX.Element {
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

function EvidenceScene(props: SectionExampleProps): JSX.Element {
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

function KernelSetupScene(props: SectionExampleProps): JSX.Element {
  const cx = 160, cy = 66
  const fixture = props.fixture !== false
  return (
    <g>
      <Box cx={cx} cy={cy} x={-42} y={-18} z={-10} w={84} d={36} h={10} tone="fixture" />
      <Box cx={cx} cy={cy} x={-20} y={-9} z={0} w={40} d={18} h={28} />
      <Show when={fixture} fallback={
        <g>
          <line x1={iso(cx, cy, -20, 9, 0)[0]} y1={iso(cx, cy, -20, 9, 0)[1]} x2={iso(cx, cy, 20, 9, 0)[0]} y2={iso(cx, cy, 20, 9, 0)[1]} class="panel-preview__drop" />
        </g>
      }>
        <Box cx={cx} cy={cy} x={-30} y={-4} z={0} w={10} d={8} h={14} tone="fixture" />
        <Box cx={cx} cy={cy} x={20} y={-4} z={0} w={10} d={8} h={14} tone="fixture" />
        <line x1={iso(cx, cy, -20, 9, 0)[0]} y1={iso(cx, cy, -20, 9, 0)[1]} x2={iso(cx, cy, -20, 9, 14)[0]} y2={iso(cx, cy, -20, 9, 14)[1]} class="panel-preview__contact" />
        <line x1={iso(cx, cy, 20, 9, 0)[0]} y1={iso(cx, cy, 20, 9, 0)[1]} x2={iso(cx, cy, 20, 9, 14)[0]} y2={iso(cx, cy, 20, 9, 14)[1]} class="panel-preview__contact" />
      </Show>
      <line x1="160" y1="26" x2="160" y2="42" class="panel-preview__setup-arrow" />
      <polygon points="160,20 155,29 165,29" class="panel-preview__setup-head" />
      <text x="168" y="28" class="panel-preview__caption-note">{props.orientation ?? "+Z"}</text>
    </g>
  )
}

// ---------------------------------------------------------------- verified print

function PrintVerifyScene(props: SectionExampleProps): JSX.Element {
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

export function SectionExample(props: SectionExampleProps): JSX.Element {
  const label = (): string => [props.title, props.detail, props.chip].filter((value): value is string => value !== undefined && value !== "").join(" · ")
  return (
    <PreviewStage title={props.title} detail={props.detail} chip={props.chip} testId={props.testId} compact ariaLabel={label()}>
      <svg viewBox="0 0 320 128" role="img" aria-label={label()} data-example={props.kind}>
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
        </g>
      </svg>
    </PreviewStage>
  )
}
