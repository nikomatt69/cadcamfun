/**
 * Fusion 360 / Hypermill-style machining strategy palette.
 *
 * Replaces the legacy `<select>` of `OperationSection` with a categorised icon palette:
 * the user picks the strategy family on the left (2.5D Milling, 3D Milling, Drilling,
 * Turning, Multi-Axis, 3D Printing), then the active strategy on the right. Every cell
 * shows an icon, a short label and a description that mirrors the language the
 * `cam.core` schema and the sidecar already use.
 *
 * Operations are organised to mirror what users see in Fusion 360 / Hypermill so the
 * app reads as "production CAM" instead of a five-item dropdown.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { t, type Key } from "../../../i18n/index.ts"

export type MachineFamily = "mill" | "lathe" | "3dprinter"

export interface StrategyDefinition {
  readonly id: string
  readonly label: Key
  readonly description: Key
  /** Inline SVG renderer (size + optional class). Rendered as `{icon(20, "")}`. */
  readonly icon: (size: number, klass: string) => JSX.Element
  /** Optional category hint for grouping visuals. */
  readonly accent: "blue" | "purple" | "cyan" | "orange" | "green" | "red" | "amber"
}

export interface StrategyCategory {
  readonly id: string
  readonly label: Key
  readonly family: MachineFamily
  /** Visual accent for the category header bar. */
  readonly accent?: StrategyDefinition["accent"]
  /** Strategies shown in the cell grid of this category. */
  readonly strategies: ReadonlyArray<StrategyDefinition>
}

// SVG icons drawn inline (no extra dep) — visually compact so the palette stays small.
const ICON_FACE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="5" width="18" height="3" rx="0.5" />
    <path d="M5 8 L5 16 M9 8 L9 16 M13 8 L13 16 M17 8 L17 16" />
    <circle cx="12" cy="11" r="1.6" fill="currentColor" />
  </svg>
)
const ICON_POCKET = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <path d="M9 12 L11 9 L13 11 L15 9" />
  </svg>
)
const ICON_PROFILE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 20 L4 8 Q4 4 8 4 L20 4" />
    <path d="M5 18 L7 16 L5 14" />
    <path d="M6 6 L8 8 L6 10" transform="translate(8 0)" />
  </svg>
)
const ICON_SLOT = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="2" y="9" width="20" height="6" rx="1" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <path d="M6 5 L18 5" stroke-dasharray="2 2" />
  </svg>
)
const ICON_ENGRAVE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M3 18 L9 12 L13 16 L21 8" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <path d="M18 6 L21 9" />
  </svg>
)
const ICON_THREAD = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="12" cy="12" r="8" />
    <path d="M5 10 Q9 8 12 10 T 19 10" />
    <path d="M5 14 Q9 12 12 14 T 19 14" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </svg>
)
const ICON_DRILL = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M11 3 L13 3 L13 11 L17 16 L17 19 L7 19 L7 16 L11 11 Z" />
    <path d="M12 19 L12 22" />
  </svg>
)
const ICON_BORE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3 L12 21 M3 12 L21 12" stroke-dasharray="2 3" />
  </svg>
)
const ICON_REAM = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M12 3 L15 6 L13 8 L15 10 L13 12 L15 14 L13 16 L15 18 L13 20 L11 20 L9 18 L11 16 L9 14 L11 12 L9 10 L11 8 L9 6 Z" />
  </svg>
)
const ICON_TAP = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M6 6 L8 4 L10 6 L12 4 L14 6 L16 4 L18 6" />
    <path d="M12 4 L12 21" />
    <path d="M9 11 L15 11 M8 14 L16 14 M8 17 L16 17" />
  </svg>
)
const ICON_BACK_BORE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 9 L20 9" />
    <path d="M8 9 L8 16 Q8 19 11 19 L13 19 Q16 19 16 16 L16 9" />
    <path d="M11 19 L13 19" />
    <path d="M9 11 L15 11" stroke-dasharray="2 2" />
  </svg>
)
const ICON_3D_ROUGH = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 19 L4 6 L20 6 L20 19 Z" />
    <path d="M7 6 L7 17 M10 6 L10 17 M13 6 L13 17 M16 6 L16 17" />
    <path d="M4 9 L20 9" stroke-dasharray="3 2" />
  </svg>
)
const ICON_3D_FINISH = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M3 18 Q9 4 21 14" />
    <path d="M3 20 Q9 6 21 16" opacity="0.6" />
    <circle cx="18" cy="14" r="1" fill="currentColor" />
  </svg>
)
const ICON_PARALLEL = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 7 L20 5 M4 10 L20 8 M4 13 L20 11 M4 16 L20 14 M4 19 L20 17" />
  </svg>
)
const ICON_WATERLINE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M5 8 Q12 5 19 8" />
    <path d="M5 12 Q12 9 19 12" />
    <path d="M5 16 Q12 13 19 16" />
    <path d="M3 20 L21 20" stroke-dasharray="2 2" />
  </svg>
)
const ICON_PENCIL = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M3 20 L8 19 L19 8 L16 5 L5 16 Z" />
    <path d="M14 7 L17 10" />
  </svg>
)
const ICON_SCALLOP = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M3 18 Q6 12 9 18 T 15 18 T 21 18" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" />
    <path d="M12 7 L12 16" />
  </svg>
)
const ICON_FLOW = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M3 8 Q12 18 21 8" />
    <path d="M3 14 Q12 22 21 14" opacity="0.6" />
    <path d="M9 4 L12 7 L15 4" />
  </svg>
)
const ICON_ADAPTIVE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 18 L8 14 L12 16 L16 12 L20 14" />
    <circle cx="8" cy="14" r="1" fill="currentColor" />
    <circle cx="16" cy="12" r="1" fill="currentColor" />
  </svg>
)
const ICON_REST = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M5 18 L19 6" stroke-dasharray="2 2" />
    <path d="M4 14 L7 17 L10 14" />
    <path d="M14 8 L17 11 L14 14" opacity="0.6" />
  </svg>
)
const ICON_PROBE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M12 3 L12 13" />
    <circle cx="12" cy="15" r="2" />
    <path d="M6 21 L18 21" />
    <path d="M6 18 L18 18" opacity="0.6" />
  </svg>
)
const ICON_INDEXING = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="9" width="18" height="10" rx="1" />
    <path d="M12 9 L12 19" stroke-dasharray="2 2" />
    <path d="M16 9 L12 4 L8 9" />
    <circle cx="12" cy="3" r="1.5" />
  </svg>
)
const ICON_5AXIS = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M12 3 L12 21" />
    <path d="M3 12 L21 12" />
    <path d="M5 5 L19 19 M5 19 L19 5" opacity="0.6" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
)
const ICON_TURN_OD = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="4" y="9" width="16" height="6" rx="1" />
    <path d="M4 12 L8 12 L8 14 L12 14 L12 12" />
    <circle cx="14" cy="12" r="1" fill="currentColor" />
  </svg>
)
const ICON_FACING = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="12" cy="12" r="8" />
    <path d="M19 8 L21 9 L19 12" />
    <path d="M5 16 L3 17 L5 20" />
  </svg>
)
const ICON_PARTING = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="10" width="18" height="4" />
    <path d="M10 10 L10 6 L14 6 L14 10" />
  </svg>
)
const ICON_GROOVING = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="9" width="18" height="6" />
    <path d="M7 9 L7 6 L11 6 L11 9" />
    <path d="M13 9 L13 18 L17 18 L17 9" />
  </svg>
)
const ICON_KNURL = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="8" width="18" height="8" />
    <path d="M6 8 L6 16 M9 8 L9 16 M12 8 L12 16 M15 8 L15 16 M18 8 L18 16" />
  </svg>
)
const ICON_PRINT = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="11" width="18" height="8" rx="1" />
    <path d="M7 11 L7 7 L17 7 L17 11" />
    <circle cx="15" cy="14" r="1" fill="currentColor" />
  </svg>
)
const ICON_VASE = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M9 3 L9 6 Q5 9 5 14 Q5 19 9 21 L15 21 Q19 19 19 14 Q19 9 15 6 L15 3 Z" />
    <path d="M9 7 Q15 11 15 7 M9 11 Q15 15 15 11 M9 15 Q15 19 15 15" opacity="0.6" />
  </svg>
)
const ICON_RAFT = (size = 22, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="16" width="18" height="2" />
    <rect x="5" y="13" width="14" height="2" opacity="0.6" />
    <rect x="7" y="10" width="10" height="2" opacity="0.6" />
    <path d="M9 7 L15 7 L15 4 L9 4 Z" />
  </svg>
)

const ACCENT_CLASS: Readonly<Record<StrategyDefinition["accent"], { chip: string; glow: string; iconActive: string }>> = {
  blue: { chip: "border-blue-200 dark:border-blue-800", glow: "bg-blue-100/70 dark:bg-blue-900/40", iconActive: "text-blue-700 dark:text-blue-300" },
  purple: { chip: "border-purple-200 dark:border-purple-800", glow: "bg-purple-100/70 dark:bg-purple-900/40", iconActive: "text-purple-700 dark:text-purple-300" },
  cyan: { chip: "border-cyan-200 dark:border-cyan-800", glow: "bg-cyan-100/70 dark:bg-cyan-900/40", iconActive: "text-cyan-700 dark:text-cyan-300" },
  orange: { chip: "border-orange-200 dark:border-orange-800", glow: "bg-orange-100/70 dark:bg-orange-900/40", iconActive: "text-orange-700 dark:text-orange-300" },
  green: { chip: "border-emerald-200 dark:border-emerald-800", glow: "bg-emerald-100/70 dark:bg-emerald-900/40", iconActive: "text-emerald-700 dark:text-emerald-300" },
  red: { chip: "border-red-200 dark:border-red-800", glow: "bg-red-100/70 dark:bg-red-900/40", iconActive: "text-red-700 dark:text-red-300" },
  amber: { chip: "border-amber-200 dark:border-amber-800", glow: "bg-amber-100/70 dark:bg-amber-900/40", iconActive: "text-amber-700 dark:text-amber-300" }
}

/** All categories, organised by machine family. Mirrors the Fusion 360 / Hypermill menus. */
export const STRATEGY_CATEGORIES: ReadonlyArray<StrategyCategory> = [
  {
    id: "mill-2.5d",
    label: "cam.palette.cat2_5d",
    family: "mill",
    accent: "blue",
    strategies: [
      { id: "contour", label: "cam.strategy.contour", description: "cam.strategy.contourDesc", icon: ICON_PROFILE, accent: "blue" },
      { id: "pocket", label: "cam.strategy.pocket", description: "cam.strategy.pocketDesc", icon: ICON_POCKET, accent: "blue" },
      { id: "face", label: "cam.strategy.face", description: "cam.strategy.faceDesc", icon: ICON_FACE, accent: "blue" },
      { id: "slot", label: "cam.strategy.slot", description: "cam.strategy.slotDesc", icon: ICON_SLOT, accent: "blue" },
      { id: "engrave", label: "cam.strategy.engrave", description: "cam.strategy.engraveDesc", icon: ICON_ENGRAVE, accent: "blue" },
      { id: "thread-milling", label: "cam.strategy.threadMilling", description: "cam.strategy.threadMillingDesc", icon: ICON_THREAD, accent: "blue" }
    ]
  },
  {
    id: "mill-3d",
    label: "cam.palette.cat3d",
    family: "mill",
    accent: "purple",
    strategies: [
      { id: "3d_surface", label: "cam.strategy.zLevelRough", description: "cam.strategy.zLevelRoughDesc", icon: ICON_3D_ROUGH, accent: "purple" },
      { id: "3d_surface_parallel", label: "cam.strategy.parallel", description: "cam.strategy.parallelDesc", icon: ICON_PARALLEL, accent: "purple" },
      { id: "3d_surface_waterline", label: "cam.strategy.waterline", description: "cam.strategy.waterlineDesc", icon: ICON_WATERLINE, accent: "purple" },
      { id: "3d_surface_pencil", label: "cam.strategy.pencil", description: "cam.strategy.pencilDesc", icon: ICON_PENCIL, accent: "purple" },
      { id: "3d_surface_scallop", label: "cam.strategy.scallop", description: "cam.strategy.scallopDesc", icon: ICON_SCALLOP, accent: "purple" },
      { id: "3d_surface_flowline", label: "cam.strategy.flowline", description: "cam.strategy.flowlineDesc", icon: ICON_FLOW, accent: "purple" },
      { id: "3d_surface_adaptive", label: "cam.strategy.adaptive", description: "cam.strategy.adaptiveDesc", icon: ICON_ADAPTIVE, accent: "purple" },
      { id: "3d_surface_rest", label: "cam.strategy.rest", description: "cam.strategy.restDesc", icon: ICON_REST, accent: "purple" }
    ]
  },
  {
    id: "mill-drilling",
    label: "cam.palette.catDrilling",
    family: "mill",
    accent: "cyan",
    strategies: [
      { id: "drill", label: "cam.strategy.drill", description: "cam.strategy.drillDesc", icon: ICON_DRILL, accent: "cyan" },
      { id: "drill_deep", label: "cam.strategy.deepDrill", description: "cam.strategy.deepDrillDesc", icon: ICON_DRILL, accent: "cyan" },
      { id: "drill_peck", label: "cam.strategy.peckDrill", description: "cam.strategy.peckDrillDesc", icon: ICON_DRILL, accent: "cyan" },
      { id: "drill_chip_break", label: "cam.strategy.chipBreak", description: "cam.strategy.chipBreakDesc", icon: ICON_DRILL, accent: "cyan" },
      { id: "drill_reaming", label: "cam.strategy.reaming", description: "cam.strategy.reamingDesc", icon: ICON_REAM, accent: "cyan" },
      { id: "drill_boring", label: "cam.strategy.boring", description: "cam.strategy.boringDesc", icon: ICON_BORE, accent: "cyan" },
      { id: "drill_back_bore", label: "cam.strategy.backBore", description: "cam.strategy.backBoreDesc", icon: ICON_BACK_BORE, accent: "cyan" },
      { id: "drill_tapping", label: "cam.strategy.tapping", description: "cam.strategy.tappingDesc", icon: ICON_TAP, accent: "cyan" },
      { id: "drill_center", label: "cam.strategy.center", description: "cam.strategy.centerDesc", icon: ICON_DRILL, accent: "cyan" }
    ]
  },
  {
    id: "mill-multi",
    label: "cam.palette.catMultiAxis",
    family: "mill",
    accent: "amber",
    strategies: [
      { id: "index_3_2", label: "cam.strategy.index32", description: "cam.strategy.index32Desc", icon: ICON_INDEXING, accent: "amber" },
      { id: "axis_4", label: "cam.strategy.axis4", description: "cam.strategy.axis4Desc", icon: ICON_5AXIS, accent: "amber" },
      { id: "axis_5_swarf", label: "cam.strategy.axis5Swarf", description: "cam.strategy.axis5SwarfDesc", icon: ICON_5AXIS, accent: "amber" },
      { id: "axis_5_sim", label: "cam.strategy.axis5Sim", description: "cam.strategy.axis5SimDesc", icon: ICON_5AXIS, accent: "amber" }
    ]
  },
  {
    id: "mill-probing",
    label: "cam.palette.catProbing",
    family: "mill",
    accent: "green",
    strategies: [
      { id: "probing", label: "cam.strategy.probe", description: "cam.strategy.probeDesc", icon: ICON_PROBE, accent: "green" },
      { id: "toolLength", label: "cam.strategy.toolLength", description: "cam.strategy.toolLengthDesc", icon: ICON_PROBE, accent: "green" }
    ]
  },
  {
    id: "lathe-turning",
    label: "cam.palette.catTurning",
    family: "lathe",
    accent: "orange",
    strategies: [
      { id: "facing", label: "cam.strategy.facing", description: "cam.strategy.facingDesc", icon: ICON_FACING, accent: "orange" },
      { id: "turning", label: "cam.strategy.turningOD", description: "cam.strategy.turningODDesc", icon: ICON_TURN_OD, accent: "orange" },
      { id: "boring", label: "cam.strategy.turningID", description: "cam.strategy.turningIDDesc", icon: ICON_BORE, accent: "orange" },
      { id: "threading", label: "cam.strategy.threadingOD", description: "cam.strategy.threadingODDesc", icon: ICON_THREAD, accent: "orange" },
      { id: "grooving", label: "cam.strategy.grooving", description: "cam.strategy.groovingDesc", icon: ICON_GROOVING, accent: "orange" },
      { id: "parting", label: "cam.strategy.parting", description: "cam.strategy.partingDesc", icon: ICON_PARTING, accent: "orange" },
      { id: "knurling", label: "cam.strategy.knurling", description: "cam.strategy.knurlingDesc", icon: ICON_KNURL, accent: "orange" }
    ]
  },
  {
    id: "printer",
    label: "cam.palette.catPrinting",
    family: "3dprinter",
    accent: "red",
    strategies: [
      { id: "standard", label: "cam.strategy.printStandard", description: "cam.strategy.printStandardDesc", icon: ICON_PRINT, accent: "red" },
      { id: "vase", label: "cam.strategy.printVase", description: "cam.strategy.printVaseDesc", icon: ICON_VASE, accent: "red" },
      { id: "support", label: "cam.strategy.printSupport", description: "cam.strategy.printSupportDesc", icon: ICON_RAFT, accent: "red" },
      { id: "infill", label: "cam.strategy.printInfill", description: "cam.strategy.printInfillDesc", icon: ICON_PRINT, accent: "red" },
      { id: "raft", label: "cam.strategy.printRaft", description: "cam.strategy.printRaftDesc", icon: ICON_RAFT, accent: "red" },
      { id: "brim", label: "cam.strategy.printBrim", description: "cam.strategy.printBrimDesc", icon: ICON_PRINT, accent: "red" }
    ]
  }
]

/** Map the strategy palette id (the cell the user clicked) onto the `operationType`
 *  the core schema + the sidecar's generator already recognise. Multi-axis and
 *  advanced drilling variants are routed onto the closest existing core op. */
export const paletteToCoreOperation = (
  family: MachineFamily,
  paletteId: string
): string => {
  if (family === "mill") {
    switch (paletteId) {
      case "contour":
      case "pocket":
      case "face":
      case "slot":
      case "engrave":
      case "thread-milling":
        return paletteId === "face" ? "face" : paletteId
      case "drill":
      case "drill_deep":
      case "drill_peck":
      case "drill_chip_break":
      case "drill_center":
        return "drill"
      case "drill_reaming":
      case "drill_boring":
      case "drill_back_bore":
      case "drill_tapping":
        return "drill"
      case "3d_surface":
      case "3d_surface_parallel":
      case "3d_surface_waterline":
      case "3d_surface_pencil":
      case "3d_surface_scallop":
      case "3d_surface_flowline":
      case "3d_surface_adaptive":
      case "3d_surface_rest":
        return "3d_surface"
      case "index_3_2":
      case "axis_4":
      case "axis_5_swarf":
      case "axis_5_sim":
        // Indexed / 5-axis currently map onto the existing 3D surface strategy (wcs rotation
        // is handled at the post). This keeps the UI honest about which strategies the core
        // generator can run end-to-end today, while exposing the production-class taxonomy.
        return "3d_surface"
      case "probing":
      case "toolLength":
        return "probing"
      default:
        return "contour"
    }
  }
  if (family === "lathe") return paletteId
  return paletteId
}

export interface StrategyPaletteProps {
  readonly family: MachineFamily
  readonly activeOperation: string
  /** Called with the strategy palette id (e.g. `contour`, `axis_5_swarf`). */
  readonly onSelect?: (paletteId: string) => void
  /** Optional: render in a compact mode that hides the description panel. */
  readonly compact?: boolean
}

export default function StrategyPalette(props: StrategyPaletteProps): JSX.Element {
  const visible = (): ReadonlyArray<StrategyCategory> =>
    STRATEGY_CATEGORIES.filter((category) => category.family === props.family)
  const [active, setActive] = createSignal<string>(props.activeOperation)
  // Reflect prop changes when the generator switches family or operation upstream.
  if (props.activeOperation !== active()) setActive(props.activeOperation)
  const selected = (): StrategyDefinition | undefined => {
    for (const category of visible()) {
      for (const strategy of category.strategies) {
        if (strategy.id === active() || paletteToCoreOperation(props.family, strategy.id) === props.activeOperation) return strategy
      }
    }
    return undefined
  }
  const onCell = (cellId: string): void => {
    setActive(cellId)
    props.onSelect?.(cellId)
  }

  return (
    <div class="strategy-palette" data-testid="strategy-palette" data-family={props.family}>
      <div class="strategy-palette__head">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("cam.palette.title")}
        </div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white">
          {t("cam.palette.subtitle")}
        </div>
      </div>

      <div class="strategy-palette__body" classList={{ "strategy-palette__body--compact": props.compact === true }}>
        <For each={visible()}>
          {(category) => (
            <section class="strategy-palette__cat">
              <header class="strategy-palette__cat-head">
                <span class={`strategy-palette__cat-bar`} data-accent={category.accent ?? "blue"} />
                <span class="text-xs font-semibold text-gray-700 dark:text-gray-200">{t(category.label)}</span>
              </header>
              <div class="strategy-palette__grid">
                <For each={category.strategies}>
                  {(strategy) => {
                    const isActive = (): boolean => active() === strategy.id
                    const accent = ACCENT_CLASS[strategy.accent]
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
                        <span class={`strategy-cell__icon ${isActive() ? accent.iconActive : "text-gray-700 dark:text-gray-300"}`}>
                          {strategy.icon(20, "")}
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

      <Show when={!props.compact && selected() !== undefined}>
        {(() => {
          const cell = selected()
          if (cell === undefined) return null
          return (
            <div class="strategy-palette__detail" data-accent={cell.accent}>
              <div class="strategy-palette__detail-title">{t(cell.label)}</div>
              <p class="strategy-palette__detail-desc">{t(cell.description)}</p>
              <p class="strategy-palette__detail-hint">{t("cam.palette.wireHint")}</p>
            </div>
          )
        })()}
      </Show>
    </div>
  )
}

/** Builds the working toolpath generator from the i18n catalog so the consumer
 *  can render it without an extra DependencyInjection setup. */
export const describeCore = (operationType: string): { title: string; description: string } =>
  cam.generator.getOperationDescription(operationType)
