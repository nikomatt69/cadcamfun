/**
 * CamRibbon pure data — extracted so the data layer is testable with `bun:test`
 * and the Solid JSX / DOM module is a thin renderer.
 *
 * The ribbon is the visible production-CAM taxonomy: every Fusion / Hypermill
 * strategy and workflow is one click away. Keeping the data here makes the
 * contract reviewable and guarantees the visible features match what the
 * core generator actually emits.
 */
import type { Key } from "../../../i18n/index.ts"

export type RibbonTabId = "home" | "setup" | "machining" | "simulation" | "post" | "tools"

export type RibbonAccent =
  | "blue"
  | "purple"
  | "cyan"
  | "amber"
  | "orange"
  | "green"
  | "red"
  | "neutral"

export interface RibbonTab {
  readonly id: RibbonTabId
  readonly labelKey: Key
}

export interface RibbonActionSpec {
  readonly id: string
  readonly labelKey: Key
  readonly accent: RibbonAccent
  /** Callsite the action routes to. Mirrors the legacy page's `onClick` handlers. */
  readonly route:
    | "save"
    | "import"
    | "library"
    | "costs"
    | "active-preview"
    | "active-editor"
    | "active-toolpath"
    | "active-post"
    | "right-generator"
    | "right-cycles"
    | "right-verify"
    | "operation-change"
    | "post-fanuc"
    | "post-heidenhain"
    | "post-gcode"
    | "sidebar-workpiece"
    | "sidebar-machine"
    | "play-simulation"
}

export interface RibbonGroupSpec {
  readonly titleKey: Key
  readonly accent: RibbonAccent
  readonly actions: ReadonlyArray<RibbonActionSpec>
}

export const RIBBON_TABS: ReadonlyArray<RibbonTab> = [
  { id: "home", labelKey: "cam.ribbon.home" },
  { id: "setup", labelKey: "cam.ribbon.setup" },
  { id: "machining", labelKey: "cam.ribbon.machining" },
  { id: "simulation", labelKey: "cam.ribbon.simulation" },
  { id: "post", labelKey: "cam.ribbon.post" },
  { id: "tools", labelKey: "cam.ribbon.tools" }
]

const PROFILING_GROUPS: ReadonlyArray<RibbonGroupSpec> = [
  {
    titleKey: "cam.ribbon.group.profiling",
    accent: "blue",
    actions: [
      { id: "strategy-contour", labelKey: "cam.strategy.contour", accent: "blue", route: "operation-change" },
      { id: "strategy-pocket", labelKey: "cam.strategy.pocket", accent: "blue", route: "operation-change" },
      { id: "strategy-face", labelKey: "cam.strategy.face", accent: "blue", route: "operation-change" },
      { id: "strategy-drill", labelKey: "cam.strategy.drill", accent: "cyan", route: "operation-change" },
      { id: "strategy-threadmill", labelKey: "cam.strategy.threadMilling", accent: "blue", route: "operation-change" }
    ]
  },
  {
    titleKey: "cam.ribbon.group.surface",
    accent: "purple",
    actions: [
      { id: "strategy-zlevel", labelKey: "cam.strategy.zLevelRough", accent: "purple", route: "operation-change" },
      { id: "strategy-parallel", labelKey: "cam.strategy.parallel", accent: "purple", route: "operation-change" },
      { id: "strategy-waterline", labelKey: "cam.strategy.waterline", accent: "purple", route: "operation-change" },
      { id: "strategy-adaptive", labelKey: "cam.strategy.adaptive", accent: "purple", route: "operation-change" },
      { id: "strategy-rest", labelKey: "cam.strategy.rest", accent: "purple", route: "operation-change" }
    ]
  },
  {
    titleKey: "cam.ribbon.group.multi",
    accent: "amber",
    actions: [
      { id: "strategy-32", labelKey: "cam.strategy.index32", accent: "amber", route: "operation-change" },
      { id: "strategy-4", labelKey: "cam.strategy.axis4", accent: "amber", route: "operation-change" },
      { id: "strategy-5swarf", labelKey: "cam.strategy.axis5Swarf", accent: "amber", route: "operation-change" },
      { id: "strategy-5sim", labelKey: "cam.strategy.axis5Sim", accent: "amber", route: "operation-change" }
    ]
  },
  {
    titleKey: "cam.ribbon.group.lathe",
    accent: "orange",
    actions: [
      { id: "strategy-facing", labelKey: "cam.strategy.facing", accent: "orange", route: "operation-change" },
      { id: "strategy-turning", labelKey: "cam.strategy.turningOD", accent: "orange", route: "operation-change" },
      { id: "strategy-boring", labelKey: "cam.strategy.turningID", accent: "orange", route: "operation-change" },
      { id: "strategy-threading", labelKey: "cam.strategy.threadingOD", accent: "orange", route: "operation-change" },
      { id: "strategy-parting", labelKey: "cam.strategy.parting", accent: "orange", route: "operation-change" }
    ]
  }
]

export const RIBBON_GROUPS: Readonly<Record<RibbonTabId, ReadonlyArray<RibbonGroupSpec>>> = {
  home: [
    {
      titleKey: "cam.ribbon.group.file",
      accent: "blue",
      actions: [
        { id: "save", labelKey: "cam.ribbon.save", accent: "blue", route: "save" },
        { id: "import", labelKey: "cam.ribbon.import", accent: "blue", route: "import" },
        { id: "costs", labelKey: "cam.ribbon.costs", accent: "orange", route: "costs" }
      ]
    },
    {
      titleKey: "cam.ribbon.group.workbench",
      accent: "purple",
      actions: [
        { id: "preview", labelKey: "cam.ribbon.preview", accent: "purple", route: "active-preview" },
        { id: "editor", labelKey: "cam.ribbon.editor", accent: "purple", route: "active-editor" },
        { id: "toolpath", labelKey: "cam.ribbon.toolpath", accent: "purple", route: "active-toolpath" }
      ]
    }
  ],
  setup: [
    {
      titleKey: "cam.ribbon.group.workpiece",
      accent: "blue",
      actions: [
        { id: "open-workpiece", labelKey: "cam.ribbon.workpiece", accent: "blue", route: "sidebar-workpiece" }
      ]
    },
    {
      titleKey: "cam.ribbon.group.origin",
      accent: "blue",
      actions: [
        { id: "open-origin", labelKey: "cam.ribbon.origin", accent: "blue", route: "right-generator" }
      ]
    }
  ],
  machining: PROFILING_GROUPS,
  simulation: [
    {
      titleKey: "cam.ribbon.group.verify",
      accent: "green",
      actions: [
        { id: "open-cycles", labelKey: "cam.ribbon.cycles", accent: "cyan", route: "right-cycles" },
        { id: "open-verify", labelKey: "cam.ribbon.verify", accent: "green", route: "right-verify" },
        { id: "open-preview", labelKey: "cam.ribbon.preview", accent: "green", route: "active-preview" },
        { id: "play-sim", labelKey: "cam.ribbon.editor", accent: "green", route: "play-simulation" }
      ]
    }
  ],
  post: [
    {
      titleKey: "cam.ribbon.group.post",
      accent: "neutral",
      actions: [
        { id: "post-fanuc", labelKey: "cam.ribbon.fanuc", accent: "blue", route: "post-fanuc" },
        { id: "post-heidenhain", labelKey: "cam.ribbon.heidenhain", accent: "purple", route: "post-heidenhain" },
        { id: "post-gcode", labelKey: "cam.ribbon.generic", accent: "neutral", route: "post-gcode" },
        { id: "open-post-tab", labelKey: "cam.ribbon.openPost", accent: "neutral", route: "active-post" }
      ]
    }
  ],
  tools: [
    {
      titleKey: "cam.ribbon.group.libraries",
      accent: "blue",
      actions: [
        { id: "open-library", labelKey: "cam.ribbon.toolLibrary", accent: "blue", route: "library" },
        { id: "open-materials", labelKey: "cam.ribbon.materials", accent: "amber", route: "library" }
      ]
    }
  ]
}

/** All distinct route kinds exposed by the ribbon — used by the integration tests. */
export const RIBBON_ROUTES = new Set<RibbonActionSpec["route"]>([
  "save",
  "import",
  "library",
  "costs",
  "active-preview",
  "active-editor",
  "active-toolpath",
  "active-post",
  "right-generator",
  "right-cycles",
  "right-verify",
  "operation-change",
  "post-fanuc",
  "post-heidenhain",
  "post-gcode",
  "sidebar-workpiece",
  "sidebar-machine",
  "play-simulation"
])
