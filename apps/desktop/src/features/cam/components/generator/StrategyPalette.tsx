/**
 * Fusion 360 / Hypermill-style machining strategy palette.
 *
 * Replaces the legacy `<select>` of `OperationSection` with a categorised icon palette:
 * the user picks the strategy family on the left (2.5D Milling, 3D Milling, Drilling,
 * Turning, Multi-Axis, 3D Printing), then the active strategy on the right. Every cell
 * shows a compact icon and label; the generator supplies a contextual 3D example.
 *
 * Operations are organised to mirror what users see in Fusion 360 / Hypermill so the
 * app reads as "production CAM" instead of a five-item dropdown.
 *
 * The data (categories, palette ids, mapping) lives in `StrategyPalette.data.ts` so a
 * pure-TS runner can test it without rendering Solid components.
 */
import { For, createEffect, createSignal, on, type JSX } from "solid-js"
import { Layers, Move3d, Pencil, Waves } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import {
  STRATEGY_CATEGORIES,
  paletteToCoreOperation,
  describeCore,
  type MachineFamily,
  type StrategyDefinition,
  type StrategyCategory
} from "./StrategyPalette.data.ts"

export type { MachineFamily, StrategyDefinition, StrategyCategory }
export { STRATEGY_CATEGORIES, paletteToCoreOperation, describeCore }
// Machining glyphs have no icon-set equivalent, so they are drawn here to the set's rules: one 24 grid, one 2px stroke with
// round caps (the lucide weight), `currentColor` only, a fixed 16px box that never shrinks. Where lucide has an honest equal
// (pencil, axes, waves, layers) it is used instead.
const ICON_SIZE = 16
const Glyph = (props: { readonly size: number; readonly klass: string; readonly children: JSX.Element }): JSX.Element => (
  <svg
    width={props.size}
    height={props.size}
    viewBox="0 0 24 24"
    class={props.klass}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={{ "flex-shrink": "0" }}
    aria-hidden="true"
  >
    {props.children}
  </svg>
)
const ICON_FACE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="5" width="18" height="3" rx="0.5" />
    <path d="M5 8 L5 16 M9 8 L9 16 M13 8 L13 16 M17 8 L17 16" />
    <circle cx="12" cy="11" r="1.6" fill="currentColor" />
  </Glyph>
)
const ICON_POCKET = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <path d="M9 12 L11 9 L13 11 L15 9" />
  </Glyph>
)
const ICON_PROFILE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M4 20 L4 8 Q4 4 8 4 L20 4" />
    <path d="M5 18 L7 16 L5 14" />
    <path d="M6 6 L8 8 L6 10" transform="translate(8 0)" />
  </Glyph>
)
const ICON_SLOT = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="2" y="9" width="20" height="6" rx="1" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <path d="M6 5 L18 5" stroke-dasharray="2 2" />
  </Glyph>
)
const ICON_ENGRAVE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M3 18 L9 12 L13 16 L21 8" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <path d="M18 6 L21 9" />
  </Glyph>
)
const ICON_THREAD = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <circle cx="12" cy="12" r="8" />
    <path d="M5 10 Q9 8 12 10 T 19 10" />
    <path d="M5 14 Q9 12 12 14 T 19 14" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </Glyph>
)
const ICON_DRILL = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M11 3 L13 3 L13 11 L17 16 L17 19 L7 19 L7 16 L11 11 Z" />
    <path d="M12 19 L12 22" />
  </Glyph>
)
const ICON_BORE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3 L12 21 M3 12 L21 12" stroke-dasharray="2 3" />
  </Glyph>
)
const ICON_REAM = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M12 3 L15 6 L13 8 L15 10 L13 12 L15 14 L13 16 L15 18 L13 20 L11 20 L9 18 L11 16 L9 14 L11 12 L9 10 L11 8 L9 6 Z" />
  </Glyph>
)
const ICON_TAP = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M6 6 L8 4 L10 6 L12 4 L14 6 L16 4 L18 6" />
    <path d="M12 4 L12 21" />
    <path d="M9 11 L15 11 M8 14 L16 14 M8 17 L16 17" />
  </Glyph>
)
const ICON_BACK_BORE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M4 9 L20 9" />
    <path d="M8 9 L8 16 Q8 19 11 19 L13 19 Q16 19 16 16 L16 9" />
    <path d="M11 19 L13 19" />
    <path d="M9 11 L15 11" stroke-dasharray="2 2" />
  </Glyph>
)
const ICON_3D_ROUGH = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M4 19 L4 6 L20 6 L20 19 Z" />
    <path d="M7 6 L7 17 M10 6 L10 17 M13 6 L13 17 M16 6 L16 17" />
    <path d="M4 9 L20 9" stroke-dasharray="3 2" />
  </Glyph>
)
const ICON_PARALLEL = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M4 7 L20 5 M4 10 L20 8 M4 13 L20 11 M4 16 L20 14 M4 19 L20 17" />
  </Glyph>
)
const ICON_WATERLINE = (size = 16, klass = ""): JSX.Element => <Waves size={size} class={klass} />
const ICON_PENCIL = (size = 16, klass = ""): JSX.Element => <Pencil size={size} class={klass} />
const ICON_SCALLOP = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M3 18 Q6 12 9 18 T 15 18 T 21 18" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" />
    <path d="M12 7 L12 16" />
  </Glyph>
)
const ICON_FLOW = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M3 8 Q12 18 21 8" />
    <path d="M3 14 Q12 22 21 14" />
    <path d="M9 4 L12 7 L15 4" />
  </Glyph>
)
const ICON_ADAPTIVE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M4 18 L8 14 L12 16 L16 12 L20 14" />
    <circle cx="8" cy="14" r="1" fill="currentColor" />
    <circle cx="16" cy="12" r="1" fill="currentColor" />
  </Glyph>
)
const ICON_REST = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M5 18 L19 6" stroke-dasharray="2 2" />
    <path d="M4 14 L7 17 L10 14" />
    <path d="M14 8 L17 11 L14 14" />
  </Glyph>
)
const ICON_PROBE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M12 3 L12 13" />
    <circle cx="12" cy="15" r="2" />
    <path d="M6 21 L18 21" />
    <path d="M6 18 L18 18" />
  </Glyph>
)
const ICON_INDEXING = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="9" width="18" height="10" rx="1" />
    <path d="M12 9 L12 19" stroke-dasharray="2 2" />
    <path d="M16 9 L12 4 L8 9" />
    <circle cx="12" cy="3" r="1.5" />
  </Glyph>
)
const ICON_5AXIS = (size = 16, klass = ""): JSX.Element => <Move3d size={size} class={klass} />
const ICON_TURN_OD = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="4" y="9" width="16" height="6" rx="1" />
    <path d="M4 12 L8 12 L8 14 L12 14 L12 12" />
    <circle cx="14" cy="12" r="1" fill="currentColor" />
  </Glyph>
)
const ICON_FACING = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <circle cx="12" cy="12" r="8" />
    <path d="M19 8 L21 9 L19 12" />
    <path d="M5 16 L3 17 L5 20" />
  </Glyph>
)
const ICON_PARTING = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="10" width="18" height="4" />
    <path d="M10 10 L10 6 L14 6 L14 10" />
  </Glyph>
)
const ICON_GROOVING = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="9" width="18" height="6" />
    <path d="M7 9 L7 6 L11 6 L11 9" />
    <path d="M13 9 L13 18 L17 18 L17 9" />
  </Glyph>
)
const ICON_KNURL = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="8" width="18" height="8" />
    <path d="M6 8 L6 16 M9 8 L9 16 M12 8 L12 16 M15 8 L15 16 M18 8 L18 16" />
  </Glyph>
)
const ICON_PRINT = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <rect x="3" y="11" width="18" height="8" rx="1" />
    <path d="M7 11 L7 7 L17 7 L17 11" />
    <circle cx="15" cy="14" r="1" fill="currentColor" />
  </Glyph>
)
const ICON_VASE = (size = 16, klass = ""): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <path d="M9 3 L9 6 Q5 9 5 14 Q5 19 9 21 L15 21 Q19 19 19 14 Q19 9 15 6 L15 3 Z" />
    <path d="M9 7 Q15 11 15 7 M9 11 Q15 15 15 11 M9 15 Q15 19 15 15" />
  </Glyph>
)
const ICON_RAFT = (size = 16, klass = ""): JSX.Element => <Layers size={size} class={klass} />

/** Map every strategy id to its SVG icon renderer (kept here, not in the data module,
 *  because Solid JSX is fine to import but the data file needs to be Solid-free). */
const ICON_OF: ReadonlyMap<string, (size: number, klass: string) => JSX.Element> = new Map<string, (size: number, klass: string) => JSX.Element>([
  ["contour", ICON_PROFILE],
  ["pocket", ICON_POCKET],
  ["face", ICON_FACE],
  ["slot", ICON_SLOT],
  ["engrave", ICON_ENGRAVE],
  ["thread-milling", ICON_THREAD],
  ["3d_surface", ICON_3D_ROUGH],
  ["3d_surface_parallel", ICON_PARALLEL],
  ["3d_surface_waterline", ICON_WATERLINE],
  ["3d_surface_pencil", ICON_PENCIL],
  ["3d_surface_scallop", ICON_SCALLOP],
  ["3d_surface_flowline", ICON_FLOW],
  ["3d_surface_adaptive", ICON_ADAPTIVE],
  ["3d_surface_rest", ICON_REST],
  ["drill", ICON_DRILL],
  ["drill_deep", ICON_DRILL],
  ["drill_peck", ICON_DRILL],
  ["drill_chip_break", ICON_DRILL],
  ["drill_center", ICON_DRILL],
  ["drill_reaming", ICON_REAM],
  ["drill_boring", ICON_BORE],
  ["drill_back_bore", ICON_BACK_BORE],
  ["drill_tapping", ICON_TAP],
  ["index_3_2", ICON_INDEXING],
  ["axis_4", ICON_5AXIS],
  ["axis_5_swarf", ICON_5AXIS],
  ["axis_5_sim", ICON_5AXIS],
  ["probing", ICON_PROBE],
  ["toolLength", ICON_PROBE],
  ["facing", ICON_FACING],
  ["turning", ICON_TURN_OD],
  ["boring", ICON_BORE],
  ["threading", ICON_THREAD],
  ["grooving", ICON_GROOVING],
  ["parting", ICON_PARTING],
  ["knurling", ICON_KNURL],
  ["standard", ICON_PRINT],
  ["vase", ICON_VASE],
  ["support", ICON_RAFT],
  ["infill", ICON_PRINT],
  ["raft", ICON_RAFT],
  ["brim", ICON_PRINT]
])

const fallbackIcon = (size: number, klass: string): JSX.Element => (
  <Glyph size={size} klass={klass}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7 L12 17 M7 12 L17 12" />
  </Glyph>
)

export interface StrategyPaletteProps {
  readonly family: MachineFamily
  readonly activeOperation: string
  /** Called with the strategy palette id (e.g. `contour`, `axis_5_swarf`). */
  readonly onSelect?: (paletteId: string) => void
  /** Optional compact palette layout. */
  readonly compact?: boolean
}

export default function StrategyPalette(props: StrategyPaletteProps): JSX.Element {
  const visible = (): ReadonlyArray<StrategyCategory> =>
    STRATEGY_CATEGORIES.filter((category) => category.family === props.family)
  const [active, setActive] = createSignal<string>(props.activeOperation)
  // A variant can share a core operation with other cells. Keep the chosen variant
  // until the actual operation or machine family changes elsewhere in the UI.
  createEffect(on([() => props.family, () => props.activeOperation], ([, operation]) => setActive(operation), { defer: true }))
  const onCell = (cellId: string): void => {
    setActive(cellId)
    props.onSelect?.(cellId)
  }
  const iconFor = (id: string): ((size: number, klass: string) => JSX.Element) =>
    ICON_OF.get(id) ?? fallbackIcon

  return (
    <div class="strategy-palette" data-testid="strategy-palette" data-family={props.family}>
      <div class="strategy-palette__body" classList={{ "strategy-palette__body--compact": props.compact === true }}>
        <For each={visible()}>
          {(category) => (
            <section class="strategy-palette__cat">
              <header class="strategy-palette__cat-head">
                <span class={`strategy-palette__cat-bar`} data-accent={category.accent ?? "blue"} />
                <span class="text-xs font-semibold" style={{ color: "var(--ent-text, #1b2230)" }}>{t(category.label)}</span>
              </header>
              <div class="strategy-palette__grid">
                <For each={category.strategies}>
                  {(strategy) => {
                    const isActive = (): boolean => active() === strategy.id
                    return (
                      <button
                        type="button"
                        class="strategy-cell"
                        classList={{
                          "strategy-cell--active": isActive(),
                          "strategy-cell--mapped": !isActive() && paletteToCoreOperation(props.family, strategy.id) === props.activeOperation
                        }}
                        data-accent={strategy.accent}
                        data-palette-id={strategy.id}
                        aria-pressed={isActive()}
                        onClick={() => onCell(strategy.id)}
                        title={t(strategy.label)}
                      >
                        <span class="strategy-cell__icon">
                          {iconFor(strategy.id)(ICON_SIZE, "")}
                        </span>
                        <span class="strategy-cell__label">{t(strategy.label)}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </section>
          )}
        </For>
      </div>


    </div>
  )
}
