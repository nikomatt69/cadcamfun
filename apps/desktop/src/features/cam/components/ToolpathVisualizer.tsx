/**
 * The 3D viewport that plays back a `cam.Program` (spec 06-desktop-ui.md §3 tab
 * "Preview").
 *
 * It re-uses the shared `View3D` component (the same one the CAD editor uses)
 * so the visual language is identical: same camera, same lighting, same
 * gizmos. The shell hosts only the controls that are CAM-specific (playback
 * timeline, simulator overlay).
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { RotateCcw, Settings, X } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { View3D, toolpathOverlayModel, type MachineInfo, type RenderMode, type ToolpathPointKind, type ViewPreset } from "../../../viewport/view3d/index.ts"
import { MACHINE_LABELS, SOURCE_LABELS, type MachineChoice, type OperationTool } from "../lib/machine-view.ts"
import { t } from "../../../i18n/index.ts"
import type { Workpiece } from "../store/camStore.ts"
import { SimulationMiniPlayer } from "./SimulationMiniPlayer.tsx"

export interface ToolpathVisualizerProps {
  readonly program: cam.Program
  readonly workpiece: Workpiece
  readonly stock?: cam.generator.Stock
  readonly playing: boolean
  readonly playbackTime: number
  readonly playbackRate: number
  readonly playbackDuration?: number
  readonly onPlayingChange?: (playing: boolean) => void
  readonly onPlaybackTimeChange: (seconds: number) => void
  /** Cutters by the toolpaths' `toolId` (the kernel's tool library); playback draws the one in the spindle in 3D. */
  readonly tools?: ReadonlyMap<string, cam.kernel.Cutter>
  /** Cutter for the toolpaths `tools` does not name (the generator's tool settings). */
  readonly defaultTool?: cam.kernel.Cutter
  /** The 3D model of the generator's tool (a user's tool resource or the settings), drawn instead of `defaultTool`. */
  readonly defaultToolModel?: cam.ToolModel
  /** What the generator's tool cannot do for its operation (spec 32 §4.2). */
  readonly toolIssues?: ReadonlyArray<cam.ToolOperationIssue>
  /** The 3D model of each operation's tool by `toolId` (a multi-operation program): playback swaps them at each operation. */
  readonly toolModels?: ReadonlyMap<string, cam.ToolModel>
  /** The operations' tools of a multi-operation program, for the stats overlay. */
  readonly operationTools?: ReadonlyArray<OperationTool>
  /** The machine the program runs on (spec 31): vise / chuck / bed, its axes, what turns. */
  readonly machine?: cam.viewer.MachineSetup
  /** Machine state per move (the parse's motion track). */
  readonly motion?: cam.viewer.MotionTrack
  /** Why this machine is shown, and whether the G-code disagrees. */
  readonly machineChoice?: MachineChoice
  /** The user picks the machine (`undefined` = follow the program). */
  readonly onMachineOverride?: (kind: cam.MachineKind | undefined) => void
}

const prefersReducedMotion = (): boolean => {
  try { return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true } catch { return false }
}

const fmt = (n: number): string => (Math.round(n * 1000) / 1000).toString()

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

/** Half the longest stock side, used to size the default camera distance. */
const defaultDistance = (workpiece: Workpiece): number => {
  const longest = Math.max(workpiece.x, workpiece.y, workpiece.z)
  return Math.max(150, longest * 2.2)
}

export default function ToolpathVisualizer(props: ToolpathVisualizerProps): JSX.Element {
  const [preset, setPreset] = createSignal<ViewPreset>("perspective")
  const [mode, setMode] = createSignal<RenderMode>("shaded-edges")
  const [gridVisible, setGridVisible] = createSignal(true)
  const [axesVisible, setAxesVisible] = createSignal(true)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [showStats, setShowStats] = createSignal(true)
  const [showPoints, setShowPoints] = createSignal(false)
  const [showPointLabels, setShowPointLabels] = createSignal(false)
  const [pointFilter, setPointFilter] = createSignal<"all" | ToolpathPointKind>("all")
  const [pointSize, setPointSize] = createSignal(0.7)
  const [showArcCenters, setShowArcCenters] = createSignal(false)
  const [showArcRadii, setShowArcRadii] = createSignal(false)
  const [stockVisible, setStockVisible] = createSignal(true)
  const [stockOpacity, setStockOpacity] = createSignal(0.6)
  const [arcTolerance, setArcTolerance] = createSignal(0.1)
  const [showTool, setShowTool] = createSignal(true)
  const [showHolder, setShowHolder] = createSignal(true)
  const [showWorkholding, setShowWorkholding] = createSignal(true)
  const [spin, setSpin] = createSignal(!prefersReducedMotion())
  const [depositMode, setDepositMode] = createSignal<"progressive" | "all">("progressive")
  const [layer, setLayer] = createSignal<number>()
  const [frame, setFrame] = createSignal<"part" | "machine">("part")
  const [machineInfo, setMachineInfo] = createSignal<MachineInfo>()
  const machineDisplay = createMemo(() => ({ showWorkholding: showWorkholding(), showTriad: true, spin: spin(), depositMode: depositMode(), frame: frame(), ...(layer() !== undefined ? { layer: layer()! } : {}) }))
  const rotary = (): cam.viewer.RotarySetup | undefined => (props.machine?.kind === "mill" ? props.machine.rotary : undefined)
  // Each machine opens on the view its operator reads: a lathe from the front (the XZ plane flat, the chuck on the left).
  const presetFor = (kind: cam.MachineKind | undefined): ViewPreset => (kind === "lathe" ? "front" : "perspective")
  createEffect(on(() => props.machine?.kind, (kind) => { setPreset(presetFor(kind)); setLayer(undefined) }))
  /** Where the tool is now and what the machine is doing (from the timeline the 3D view plays). */
  const pose = createMemo(() => {
    const info = machineInfo()
    return info && props.machine ? cam.viewer.poseAt(info.timeline, props.playbackTime) : undefined
  })
  const spindleText = (): string => {
    const kind = props.machine?.kind
    const state = pose()?.state
    if (kind === undefined) return ""
    if (kind === "3dprinter") return state && state.extrude > 0 ? t("cam.visualizer.extruding") : t("cam.visualizer.travel")
    if (!state || state.spindle === "off") return t("cam.visualizer.spindleOff")
    return `${kind === "lathe" ? "M" + (state.spindle === "cw" ? "3" : "4") : state.spindle === "cw" ? "M3" : "M4"} S${Math.round(state.rpm)}${state.css ? " (G96)" : ""} ${state.spindle === "cw" ? "CW" : "CCW"}`
  }
  /** The cutters the program uses, as the viewport draws them, for the stats overlay. */
  const usedTools = createMemo(() => {
    const seen = new Map<string, cam.kernel.Cutter>()
    for (const tp of props.program.toolpaths) {
      const cutter = props.tools?.get(tp.toolId) ?? props.defaultTool
      if (cutter !== undefined && !seen.has(tp.toolId)) seen.set(tp.toolId, cutter)
    }
    return [...seen.values()]
  })
  const overlay = createMemo(() => toolpathOverlayModel(props.program))

  const stock = createMemo(() => props.machine?.kind === "mill" ? {
    origin: props.machine.stock.min,
    size: { x: props.machine.stock.max.x - props.machine.stock.min.x, y: props.machine.stock.max.y - props.machine.stock.min.y, z: props.machine.stock.max.z - props.machine.stock.min.z }
  } : ({
    origin: props.stock ? { x: props.stock.x - props.stock.width / 2, y: props.stock.y - props.stock.height / 2, z: props.stock.topZ - props.stock.depth } : { x: -props.workpiece.x / 2, y: -props.workpiece.y / 2, z: 0 },
    size: props.stock ? { x: props.stock.width, y: props.stock.height, z: props.stock.depth } : { x: props.workpiece.x, y: props.workpiece.y, z: props.workpiece.z }
  }))

  const hasProgram = (): boolean => props.program.toolpaths.length > 0

  const resetView = (): void => {
    setPreset(presetFor(props.machine?.kind))
    setMode("shaded-edges")
    setGridVisible(true)
    setAxesVisible(true)
    setShowPoints(false)
    setShowPointLabels(false)
    setPointFilter("all")
    setShowArcCenters(false)
    setShowArcRadii(false)
    setStockVisible(true)
    setStockOpacity(0.6)
    setArcTolerance(0.1)
    setShowTool(true)
    setShowHolder(true)
    setShowWorkholding(true)
    setSpin(!prefersReducedMotion())
    setDepositMode("progressive")
    setLayer(undefined)
    props.onPlaybackTimeChange(0)
  }

  const toggle = (label: string, checked: () => boolean, change: (value: boolean) => void): JSX.Element => (
    <label class="flex items-center justify-between gap-4 text-xs text-slate-200">
      <span>{label}</span>
      <input type="checkbox" class="h-4 w-4 accent-blue-500" checked={checked()} onChange={(event) => change(event.currentTarget.checked)} />
    </label>
  )

  return (
    <Motion.div class="h-full w-full flex flex-col" {...rise} transition={{ duration: 0.5 }}>
      <div class="flex-1 relative overflow-hidden rounded-2xl border border-white/30 dark:border-gray-600/30 bg-gradient-to-br from-slate-900 to-slate-700 shadow-xl">
        <Show
          when={hasProgram()}
          fallback={
            <div class="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm">
              <p class="font-medium">{t("cam.preview.noToolpath")}</p>
              <p class="mt-1 text-xs text-white/50">{props.program.toolpaths.length === 0 ? t("cam.preview.hint") : t("cam.preview.pick")}</p>
            </div>
          }
        >
          <View3D
            visionMode="cam"
            program={props.program}
            {...(props.tools !== undefined ? { tools: props.tools } : {})}
            {...(props.defaultTool !== undefined ? { defaultTool: props.defaultTool } : {})}
            {...(props.defaultToolModel !== undefined ? { defaultToolModel: props.defaultToolModel } : {})}
            {...(props.toolModels !== undefined ? { toolModels: props.toolModels } : {})}
            preset={preset()}
            renderMode={mode()}
            gridVisible={gridVisible()}
            axesVisible={axesVisible()}
            playing={props.playing}
            playbackTime={props.playbackTime}
            playbackRate={props.playbackRate}
            onPlaybackTimeChange={props.onPlaybackTimeChange}
            controlsFooter={<Show when={props.onPlayingChange}>{(onPlayingChange) => <SimulationMiniPlayer playing={props.playing} time={props.playbackTime} duration={props.playbackDuration ?? 0} onPlayingChange={onPlayingChange()} onSeek={props.onPlaybackTimeChange} />}</Show>}
            stock={stock()}
            toolpathDisplay={{ showPoints: showPoints(), showPointLabels: showPointLabels(), pointFilter: pointFilter(), pointSize: pointSize(), showArcCenters: showArcCenters(), showArcRadii: showArcRadii(), stockVisible: stockVisible(), stockOpacity: stockOpacity(), arcTolerance: arcTolerance(), showTool: showTool(), showHolder: showHolder() }}
            {...(props.machine !== undefined ? { machine: props.machine, machineDisplay: machineDisplay(), onMachineInfo: setMachineInfo } : {})}
            {...(props.motion !== undefined ? { motion: props.motion } : {})}
            showControls
            onPresetChange={setPreset}
            onRenderModeChange={setMode}
          />
        </Show>
        <div class="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          <div class="pointer-events-auto flex gap-2">
            <button
              onClick={resetView}
              class="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5"
              title={t("cam.resetView")}
              aria-label={t("cam.resetView")}
            >
              <RotateCcw size={14} /> {t("cam.reset")}
            </button>
            <button
              onClick={() => setGridVisible(!gridVisible())}
              aria-pressed={gridVisible()}
              class={`px-3 py-1.5 rounded-lg text-xs backdrop-blur ${gridVisible() ? "bg-blue-600 text-white" : "bg-black/40 hover:bg-black/60 text-white"}`}
            >
              {t("cam.grid")}
            </button>
            <button
              onClick={() => setAxesVisible(!axesVisible())}
              aria-pressed={axesVisible()}
              class={`px-3 py-1.5 rounded-lg text-xs backdrop-blur ${axesVisible() ? "bg-blue-600 text-white" : "bg-black/40 hover:bg-black/60 text-white"}`}
            >
              {t("cam.axes")}
            </button>
          </div>
          <div class="pointer-events-auto">
            <button
              onClick={() => props.onPlaybackTimeChange(0)}
              class="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5"
              aria-label={t("cam.rewind")}
            >
              <RotateCcw size={14} />
              {t("cam.rewind")}
            </button>
          </div>
        </div>
        {/* Below the viewport's own control bar, so the machine shown is always readable. */}
        <div class="absolute left-4 top-16 z-30 flex flex-wrap items-center gap-2 pointer-events-auto" data-testid="machine-header">
            <Show when={props.machineChoice}>{(choice) => (
            <label class="px-2 py-1 rounded-lg bg-black/40 backdrop-blur text-white text-xs flex items-center gap-1.5" title={t("cam.visualizer.machineSource", { machine: MACHINE_LABELS[choice().kind], source: SOURCE_LABELS[choice().source] })}>
              <span data-testid="machine-badge">{MACHINE_LABELS[choice().kind]}</span>
              <span class="text-white/50">· {SOURCE_LABELS[choice().source]}</span>
              <select
                aria-label={t("cam.visualizer.machine")}
                class="ml-1 rounded bg-slate-800 border border-slate-600 px-1 py-0.5"
                value={choice().source === "override" ? choice().kind : "auto"}
                onChange={(event) => { const value = event.currentTarget.value; props.onMachineOverride?.(value === "auto" ? undefined : value as cam.MachineKind) }}
              >
                <option value="auto">{t("cam.visualizer.machineAuto")}</option>
                <option value="mill">{MACHINE_LABELS.mill}</option>
                <option value="lathe">{MACHINE_LABELS.lathe}</option>
                <option value="3dprinter">{MACHINE_LABELS["3dprinter"]}</option>
              </select>
            </label>
          )}</Show>
          <Show when={props.machineChoice?.mismatch}>{(mismatch) => (
            <span data-testid="machine-mismatch" role="status" class="px-2 py-1 rounded-lg bg-amber-500/80 text-black text-xs" title={mismatch().reasons.join("; ")}>
              {t("cam.visualizer.machineMismatch", { machine: MACHINE_LABELS[mismatch().inferred] })}
            </span>
          )}</Show>
          <Show when={(props.motion?.unsupported.length ?? 0) > 0}>
            <span data-testid="partial-preview" role="status" class="px-2 py-1 rounded-lg bg-orange-600/80 text-white text-xs" title={props.motion!.unsupported.slice(0, 20).map((u) => `line ${u.line}: ${u.word}`).join("\n")}>
              {t("cam.visualizer.partialPreview", { count: props.motion!.unsupported.length })}
            </span>
          </Show>
        </div>
        <button
          type="button"
          class={`absolute right-4 top-16 z-30 rounded-lg p-2 text-white backdrop-blur ${settingsOpen() ? "bg-blue-600" : "bg-black/50 hover:bg-black/70"}`}
          aria-label={t("cam.visualizer.settings")}
          aria-expanded={settingsOpen()}
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <Settings size={18} />
        </button>
        <Show when={showStats()}>
          <div class="absolute bottom-16 left-4 z-20 rounded-lg bg-black/65 px-3 py-2 text-[11px] leading-5 text-slate-200 backdrop-blur pointer-events-none">
            <div>{t("cam.visualizer.moves")}: <span class="text-white">{overlay().moveCount}</span></div>
            <div>{t("cam.visualizer.points")}: <span class="text-white">{overlay().points.length}</span></div>
            <div>{t("cam.visualizer.arcs")}: <span class="text-white">{overlay().arcs.length}</span></div>
            <Show when={props.machine}>{(machine) => (
              <div data-testid="visualizer-machine">
                <div>{t("cam.visualizer.machine")}: <span class="text-white">{MACHINE_LABELS[machine().kind]}</span> · {machine().kind === "mill" ? t("cam.visualizer.toolTurns") : machine().kind === "lathe" ? t("cam.visualizer.partTurns") : t("cam.visualizer.nothingTurns")}</div>
                <div>{machine().kind === "3dprinter" ? "E" : t("cam.visualizer.spindle")}: <span class="text-white" data-testid="visualizer-spindle">{spindleText()}</span></div>
                <Show when={pose()}>{(p) => (
                  <div>{t("cam.visualizer.position")}: <span class="text-white">{machine().kind === "lathe" ? `X${fmt(p().point.x)} Z${fmt(p().point.z)}` : `X${fmt(p().point.x)} Y${fmt(p().point.y)} Z${fmt(p().point.z)}`}</span>{p().state?.line !== undefined ? ` · ${t("cam.visualizer.line")} ${p().state!.line}` : ""}</div>
                )}</Show>
                <Show when={machine().assumed.includes("workholding")}><div class="text-amber-300">{t("cam.visualizer.assumedWorkholding")}</div></Show>
                <For each={(machineInfo()?.findings ?? []).slice(0, 3)}>{(f) => (
                  <div data-testid="visualizer-finding" class={f.severity === "error" ? "text-red-400" : "text-amber-300"}>{t("cam.visualizer.setupFindings")}: {f.message}{f.count > 1 ? ` (×${f.count})` : ""}</div>
                )}</For>
              </div>
            )}</Show>
            <Show when={props.defaultToolModel !== undefined && (props.operationTools ?? []).length === 0 && (props.tools === undefined || props.machine?.kind !== "mill")}>
              <div data-testid="visualizer-tool-model">{t("cam.visualizer.activeTool")}: <span class="text-white">{cam.describeTool(props.defaultToolModel!)}</span></div>
              <For each={props.toolIssues ?? []}>{(issue) => <div data-testid="visualizer-tool-issue" class={issue.severity === "error" ? "text-red-400" : "text-amber-300"}>{issue.message}</div>}</For>
            </Show>
            <For each={props.operationTools ?? []}>{(o) => (
              <div data-testid="visualizer-operation-tool">
                <div>{o.name}: <span class="text-white">{cam.describeTool(o.model)}</span></div>
                <For each={o.issues}>{(issue) => <div data-testid="visualizer-tool-issue" class={issue.severity === "error" ? "text-red-400" : "text-amber-300"}>{issue.message}</div>}</For>
              </div>
            )}</For>
            <For each={props.defaultToolModel !== undefined && props.tools === undefined ? [] : usedTools()}>{(c) => <div data-testid="visualizer-tool">{t("cam.visualizer.activeTool")}: <span class="text-white">{c.name} · Ø{c.diameter} · {c.fluteLength} mm flutes · {c.stickout} mm out{c.holder ? ` · holder Ø${c.holder.diameter}` : ""}</span></div>}</For>
          </div>
        </Show>
        <Show when={settingsOpen()}>
          <aside class="absolute right-14 top-16 z-40 w-64 max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl border border-slate-600 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur" aria-label={t("cam.visualizer.settings")}>
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold">{t("cam.visualizer.settings")}</h3>
              <button type="button" class="rounded p-1 hover:bg-white/10" aria-label={t("common.close")} onClick={() => setSettingsOpen(false)}><X size={16} /></button>
            </div>
            <div class="space-y-3">
              {toggle(t("cam.visualizer.showStats"), showStats, setShowStats)}
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.toolpathPoints")}</h4>
                {toggle(t("cam.visualizer.showPoints"), showPoints, setShowPoints)}
                <Show when={showPoints()}>
                  {toggle(t("cam.visualizer.showLabels"), showPointLabels, setShowPointLabels)}
                  <label class="block text-xs text-slate-200">{t("cam.visualizer.filter")}
                    <select class="mt-1 w-full rounded border border-slate-600 bg-slate-800 p-1.5" value={pointFilter()} onChange={(event) => setPointFilter(event.currentTarget.value as "all" | ToolpathPointKind)}>
                      <option value="all">{t("cam.visualizer.filterAll")}</option><option value="rapid">{t("cam.visualizer.filterRapid")}</option><option value="cut">{t("cam.visualizer.filterCut")}</option><option value="arc">{t("cam.visualizer.filterArc")}</option><option value="cycle">{t("cam.visualizer.filterCycle")}</option>
                    </select>
                  </label>
                  <label class="block text-xs text-slate-200">{t("cam.visualizer.pointSize")} <span class="float-right text-slate-400">{pointSize().toFixed(1)} mm</span>
                    <input class="mt-1 w-full accent-blue-500" type="range" min="0.2" max="3" step="0.1" value={pointSize()} onInput={(event) => setPointSize(Number(event.currentTarget.value))} />
                  </label>
                </Show>
              </section>
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.arcs")}</h4>
                {toggle(t("cam.visualizer.showArcCenters"), showArcCenters, setShowArcCenters)}
                {toggle(t("cam.visualizer.showArcRadii"), showArcRadii, setShowArcRadii)}
                <label class="block text-xs text-slate-200">{t("cam.visualizer.arcTolerance")} <span class="float-right text-slate-400">{arcTolerance().toFixed(2)} mm</span>
                  <input class="mt-1 w-full accent-blue-500" type="range" min="0.01" max="1" step="0.01" value={arcTolerance()} onInput={(event) => setArcTolerance(Number(event.currentTarget.value))} />
                </label>
              </section>
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.tool")}</h4>
                {toggle(t("cam.visualizer.showTool"), showTool, setShowTool)}
                <Show when={showTool()}>{toggle(t("cam.visualizer.showHolder"), showHolder, setShowHolder)}</Show>
              </section>
              <Show when={props.machine}>{(machine) => (
                <section class="space-y-2 border-t border-slate-700 pt-3">
                  <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.machine")}</h4>
                  {toggle(t("cam.visualizer.showWorkholding"), showWorkholding, setShowWorkholding)}
                  <Show when={machine().kind !== "3dprinter"}>{toggle(t("cam.visualizer.spin"), spin, setSpin)}</Show>
                  <Show when={rotary()}>{(r) => (
                    <label class="block text-xs text-slate-200" title={r().reasons.join("; ")}>{t("cam.visualizer.rotaryFrame")} <span class="text-slate-400">({r().layout}{r().assumed ? `, ${t("cam.visualizer.assumed")}` : ""})</span>
                      <select aria-label={t("cam.visualizer.rotaryFrame")} class="mt-1 w-full rounded border border-slate-600 bg-slate-800 p-1.5" value={frame()} onChange={(event) => setFrame(event.currentTarget.value as "part" | "machine")}>
                        <option value="part">{t("cam.visualizer.framePart")}</option><option value="machine">{t("cam.visualizer.frameMachine")}</option>
                      </select>
                    </label>
                  )}</Show>
                  <Show when={machine().kind === "3dprinter"}>
                    <label class="block text-xs text-slate-200">{t("cam.visualizer.deposit")}
                      <select class="mt-1 w-full rounded border border-slate-600 bg-slate-800 p-1.5" value={depositMode()} onChange={(event) => setDepositMode(event.currentTarget.value as "progressive" | "all")}>
                        <option value="progressive">{t("cam.visualizer.depositProgressive")}</option><option value="all">{t("cam.visualizer.depositAll")}</option>
                      </select>
                    </label>
                    <Show when={(machineInfo()?.layers.length ?? 0) > 1}>
                      <label class="block text-xs text-slate-200">{t("cam.visualizer.layer")} <span class="float-right text-slate-400">{layer() === undefined ? t("cam.visualizer.allLayers") : `${layer()! + 1} · Z${fmt(machineInfo()!.layers[layer()!] ?? 0)}`}</span>
                        <input aria-label={t("cam.visualizer.layer")} class="mt-1 w-full accent-blue-500" type="range" min="0" max={String(machineInfo()!.layers.length)} step="1" value={String(layer() ?? machineInfo()!.layers.length)} onInput={(event) => { const n = Number(event.currentTarget.value); setLayer(n >= machineInfo()!.layers.length ? undefined : n) }} />
                      </label>
                    </Show>
                  </Show>
                </section>
              )}</Show>
              <section class="space-y-2 border-t border-slate-700 pt-3">
                <h4 class="text-xs font-semibold text-blue-300">{t("cam.visualizer.workpiece")}</h4>
                {toggle(t("cam.visualizer.showWorkpiece"), stockVisible, setStockVisible)}
                <Show when={stockVisible()}><label class="block text-xs text-slate-200">{t("cam.visualizer.opacity")} <span class="float-right text-slate-400">{Math.round(stockOpacity() * 100)}%</span>
                  <input class="mt-1 w-full accent-blue-500" type="range" min="0.05" max="1" step="0.05" value={stockOpacity()} onInput={(event) => setStockOpacity(Number(event.currentTarget.value))} />
                </label></Show>
              </section>
            </div>
          </aside>
        </Show>
      </div>
    </Motion.div>
  )
}
