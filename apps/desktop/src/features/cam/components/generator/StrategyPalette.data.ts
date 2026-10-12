/**
 * Strategy palette — pure data only (no JSX / Solid components).
 *
 * Kept separate from the rendering component so the rendering module can be tested
 * by being mounted in a browser harness and the data module is testable with the
 * plain `bun:test` runner.
 */
import { cam } from "@cadcamfun/core"
import type { Key } from "../../../../i18n/index.ts"

export type MachineFamily = "mill" | "lathe" | "3dprinter"

export interface StrategyDefinition {
  readonly id: string
  readonly label: Key
  readonly description: Key
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

/** Categories organised by machine family — mirrors the Fusion 360 / Hypermill menus. */
export const STRATEGY_CATEGORIES: ReadonlyArray<StrategyCategory> = [
  {
    id: "mill-2.5d",
    label: "cam.palette.cat2_5d",
    family: "mill",
    accent: "blue",
    strategies: [
      { id: "contour", label: "cam.strategy.contour", description: "cam.strategy.contourDesc", accent: "blue" },
      { id: "pocket", label: "cam.strategy.pocket", description: "cam.strategy.pocketDesc", accent: "blue" },
      { id: "face", label: "cam.strategy.face", description: "cam.strategy.faceDesc", accent: "blue" },
      { id: "slot", label: "cam.strategy.slot", description: "cam.strategy.slotDesc", accent: "blue" },
      { id: "engrave", label: "cam.strategy.engrave", description: "cam.strategy.engraveDesc", accent: "blue" },
      { id: "thread-milling", label: "cam.strategy.threadMilling", description: "cam.strategy.threadMillingDesc", accent: "blue" }
    ]
  },
  {
    id: "mill-3d",
    label: "cam.palette.cat3d",
    family: "mill",
    accent: "purple",
    strategies: [
      { id: "3d_surface", label: "cam.strategy.zLevelRough", description: "cam.strategy.zLevelRoughDesc", accent: "purple" },
      { id: "3d_surface_parallel", label: "cam.strategy.parallel", description: "cam.strategy.parallelDesc", accent: "purple" },
      { id: "3d_surface_waterline", label: "cam.strategy.waterline", description: "cam.strategy.waterlineDesc", accent: "purple" },
      { id: "3d_surface_pencil", label: "cam.strategy.pencil", description: "cam.strategy.pencilDesc", accent: "purple" },
      { id: "3d_surface_scallop", label: "cam.strategy.scallop", description: "cam.strategy.scallopDesc", accent: "purple" },
      { id: "3d_surface_flowline", label: "cam.strategy.flowline", description: "cam.strategy.flowlineDesc", accent: "purple" },
      { id: "3d_surface_adaptive", label: "cam.strategy.adaptive", description: "cam.strategy.adaptiveDesc", accent: "purple" },
      { id: "3d_surface_rest", label: "cam.strategy.rest", description: "cam.strategy.restDesc", accent: "purple" }
    ]
  },
  {
    id: "mill-drilling",
    label: "cam.palette.catDrilling",
    family: "mill",
    accent: "cyan",
    strategies: [
      { id: "drill", label: "cam.strategy.drill", description: "cam.strategy.drillDesc", accent: "cyan" },
      { id: "drill_deep", label: "cam.strategy.deepDrill", description: "cam.strategy.deepDrillDesc", accent: "cyan" },
      { id: "drill_peck", label: "cam.strategy.peckDrill", description: "cam.strategy.peckDrillDesc", accent: "cyan" },
      { id: "drill_chip_break", label: "cam.strategy.chipBreak", description: "cam.strategy.chipBreakDesc", accent: "cyan" },
      { id: "drill_reaming", label: "cam.strategy.reaming", description: "cam.strategy.reamingDesc", accent: "cyan" },
      { id: "drill_boring", label: "cam.strategy.boring", description: "cam.strategy.boringDesc", accent: "cyan" },
      { id: "drill_back_bore", label: "cam.strategy.backBore", description: "cam.strategy.backBoreDesc", accent: "cyan" },
      { id: "drill_tapping", label: "cam.strategy.tapping", description: "cam.strategy.tappingDesc", accent: "cyan" },
      { id: "drill_center", label: "cam.strategy.center", description: "cam.strategy.centerDesc", accent: "cyan" }
    ]
  },
  {
    id: "mill-multi",
    label: "cam.palette.catMultiAxis",
    family: "mill",
    accent: "amber",
    strategies: [
      { id: "index_3_2", label: "cam.strategy.index32", description: "cam.strategy.index32Desc", accent: "amber" },
      { id: "axis_4", label: "cam.strategy.axis4", description: "cam.strategy.axis4Desc", accent: "amber" },
      { id: "axis_5_swarf", label: "cam.strategy.axis5Swarf", description: "cam.strategy.axis5SwarfDesc", accent: "amber" },
      { id: "axis_5_sim", label: "cam.strategy.axis5Sim", description: "cam.strategy.axis5SimDesc", accent: "amber" }
    ]
  },
  {
    id: "mill-probing",
    label: "cam.palette.catProbing",
    family: "mill",
    accent: "green",
    strategies: [
      { id: "probing", label: "cam.strategy.probe", description: "cam.strategy.probeDesc", accent: "green" },
      { id: "toolLength", label: "cam.strategy.toolLength", description: "cam.strategy.toolLengthDesc", accent: "green" }
    ]
  },
  {
    id: "lathe-turning",
    label: "cam.palette.catTurning",
    family: "lathe",
    accent: "orange",
    strategies: [
      { id: "facing", label: "cam.strategy.facing", description: "cam.strategy.facingDesc", accent: "orange" },
      { id: "turning", label: "cam.strategy.turningOD", description: "cam.strategy.turningODDesc", accent: "orange" },
      { id: "boring", label: "cam.strategy.turningID", description: "cam.strategy.turningIDDesc", accent: "orange" },
      { id: "threading", label: "cam.strategy.threadingOD", description: "cam.strategy.threadingODDesc", accent: "orange" },
      { id: "grooving", label: "cam.strategy.grooving", description: "cam.strategy.groovingDesc", accent: "orange" },
      { id: "parting", label: "cam.strategy.parting", description: "cam.strategy.partingDesc", accent: "orange" },
      { id: "knurling", label: "cam.strategy.knurling", description: "cam.strategy.knurlingDesc", accent: "orange" }
    ]
  },
  {
    id: "printer",
    label: "cam.palette.catPrinting",
    family: "3dprinter",
    accent: "red",
    strategies: [
      { id: "standard", label: "cam.strategy.printStandard", description: "cam.strategy.printStandardDesc", accent: "red" },
      { id: "vase", label: "cam.strategy.printVase", description: "cam.strategy.printVaseDesc", accent: "red" },
      { id: "support", label: "cam.strategy.printSupport", description: "cam.strategy.printSupportDesc", accent: "red" },
      { id: "infill", label: "cam.strategy.printInfill", description: "cam.strategy.printInfillDesc", accent: "red" },
      { id: "raft", label: "cam.strategy.printRaft", description: "cam.strategy.printRaftDesc", accent: "red" },
      { id: "brim", label: "cam.strategy.printBrim", description: "cam.strategy.printBrimDesc", accent: "red" }
    ]
  }
]

/** Map the strategy palette id (the cell the user clicked) onto the `operationType`
 *  the core schema + the sidecar's generator already recognise. Multi-axis and
 *  advanced drilling variants are routed onto the closest existing core op.
 *
 *  Anything outside the 8 supported core mill ops (profile, slot, thread milling, …)
 *  is funneled onto the closest one the generator can actually emit today. */
export const paletteToCoreOperation = (family: MachineFamily, paletteId: string): string => {
  if (family === "mill") {
    switch (paletteId) {
      // 2.5D cell family — funnel new strategies into the closest existing core op.
      case "contour":
      case "profile":
        return "contour"
      case "pocket":
      case "slot":
        return "pocket"
      case "face":
        return "face"
      case "engrave":
        return "engrave"
      case "thread-milling":
        return "threading"
      // Drilling cell family: every variant (deep, peck, chip-break, reaming, boring,
      // back-bore, tapping, center) collapses onto the `drill` core op, which already
      // emits G81 / G73 / G83 / G84 / G76 / G87 cycles at the post.
      case "drill":
      case "drill_deep":
      case "drill_peck":
      case "drill_chip_break":
      case "drill_center":
      case "drill_reaming":
      case "drill_boring":
      case "drill_back_bore":
      case "drill_tapping":
        return "drill"
      // 3D surface cell family: all variants collapse onto the same `3d_surface` core op
      // (the cell id lets the generator pick the strategy in the advanced panel).
      case "3d_surface":
      case "3d_surface_parallel":
      case "3d_surface_waterline":
      case "3d_surface_pencil":
      case "3d_surface_scallop":
      case "3d_surface_flowline":
      case "3d_surface_adaptive":
      case "3d_surface_rest":
        return "3d_surface"
      // Multi-axis: head-tilt / rotary strategies emit as 3D surface today; the post handles
      // the WCS rotation. Surfacing them keeps the Fusion-class taxonomy visible.
      case "index_3_2":
      case "axis_4":
      case "axis_5_swarf":
      case "axis_5_sim":
        return "3d_surface"
      case "probing":
      case "toolLength":
        return "probing"
      default:
        return "contour"
    }
  }
  if (family === "lathe") {
    switch (paletteId) {
      case "turning":
        return "turning"
      case "threading":
        return "threading"
      default:
        return paletteId
    }
  }
  return paletteId
}

/** Builds the working toolpath generator from the i18n catalog so the consumer
 *  can render it without an extra DependencyInjection setup. */
export const describeCore = (operationType: string): { title: string; description: string } =>
  cam.generator.getOperationDescription(operationType)
