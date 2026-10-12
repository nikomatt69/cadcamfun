import { Show, createMemo, type JSX } from "solid-js"
import { cam as camCore } from "@cadcamfun/core"
import { Seg, Sep, ShellSegs, Strip, type Tone } from "../../../shared/components/workspace-strip.tsx"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"
import { useJob } from "../hooks/useJob.ts"
import { useCamStore } from "../store/camStore.ts"
import { useGeneratorStore } from "../store/generatorStore.ts"
import { useVerifyStore } from "../store/verifyStore.ts"

const RAPID_RATE = 5000

const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

const TAB_LABEL = { preview: "Preview", editor: "Editor", toolpath: "Toolpath", post: "Post" } as const

/**
 * The CAM workspace's information strip, the same thin one-row component as the CAD editor's: the program
 * (lines, moves, cut length, time, depth), tool and material, stock, controller and work offset, the last
 * verification verdict and the simulation clock.
 */
export default function CamStatusBar(): JSX.Element {
  const cam = useCamStore()
  const gen = useGeneratorStore()
  const verify = useVerifyStore()
  const selection = useSelectionStore()
  const job = useJob()

  const totals = createMemo(() => {
    let moves = 0
    let length = 0
    let seconds = 0
    let minZ = Infinity
    for (const toolpath of cam.program.toolpaths) {
      moves += toolpath.moves.length
      length += camCore.toolpathLength(toolpath)
      seconds += camCore.estimateTime(toolpath, RAPID_RATE)
      minZ = Math.min(minZ, camCore.toolpathMinZ(toolpath))
    }
    return { moves, length, seconds, minZ: Number.isFinite(minZ) ? minZ : undefined }
  })
  const lines = (): number => (cam.gcode.trim() === "" ? 0 : cam.gcode.split(/\r?\n/).filter((line) => line.trim() !== "").length)
  const stock = () => job.stock()

  const verdict = (): { readonly text: string; readonly tone: Tone } => {
    if (verify.running) return { text: "running…", tone: "amber" }
    if (verify.report === null) return { text: "not run", tone: "muted" }
    if (verify.verifiedGcode !== cam.gcode) return { text: "stale", tone: "amber" }
    const errors = verify.report.issues.filter((issue) => issue.severity === "error").length
    return errors === 0 ? { text: "OK", tone: "green" } : { text: `${errors} error${errors === 1 ? "" : "s"}`, tone: "red" }
  }

  return (
    <Strip
      label="CAM status"
      testId="cam-status-bar"
      left={
        <>
          <Seg label="View" value={TAB_LABEL[cam.activeTab]} tone="blue" />
          <Seg label="Lines" value={lines()} testId="status-lines" />
          <Seg label="Moves" value={totals().moves} hideBelow="md" />
          <Seg label="Cut" value={`${totals().length.toFixed(1)} mm`} tone="cyan" hideBelow="lg" title="Feed length" />
          <Seg label="Time" value={clock(totals().seconds)} tone="green" title={`Estimated, rapids at ${RAPID_RATE} mm/min`} hideBelow="md" />
          <Show when={totals().minZ !== undefined}><Seg label="Min Z" value={totals().minZ!.toFixed(2)} tone="amber" hideBelow="lg" /></Show>
          <Sep />
          <Seg label="Tool" value={`${gen.settings.toolType} Ø${gen.settings.toolDiameter}`} hideBelow="md" title="Tool of the generator" />
          <Seg label="S" value={gen.settings.rpm} hideBelow="xl" title="Spindle rpm" />
          <Seg label="F" value={gen.settings.feedrate} hideBelow="xl" title="Feed, mm/min" />
          <Seg label="Material" value={<span class="capitalize">{gen.settings.material}</span>} tone="green" hideBelow="lg" />
          <Show when={stock()}>
            {(s) => <Seg label="Stock" value={`${s().width.toFixed(1)} × ${s().height.toFixed(1)} × ${s().depth.toFixed(1)}`} tone="cyan" hideBelow="lg" title="Raw piece, mm" />}
          </Show>
          <Sep />
          <Seg label="Post" value={cam.controller.toUpperCase()} hideBelow="lg" />
          <Seg label="WCS" value={cam.program.workOffset} hideBelow="xl" title="Work offset" />
        </>
      }
      right={
        <>
          <Show when={selection.selectedElementIds.length > 0}><Seg value={`${selection.selectedElementIds.length} selected`} tone="amber" /></Show>
          <Show when={cam.selectedOperationId}><Seg label="Op" value={cam.selectedOperationId!} hideBelow="xl" /></Show>
          <Seg label="Verify" value={verdict().text} tone={verdict().tone} title="Last toolpath verification" testId="status-verify" />
          <Show when={cam.playing || cam.playbackTime > 0}>
            <Seg label="Sim" value={`${clock(cam.playbackTime)} / ${clock(totals().seconds)}`} tone="purple" />
          </Show>
          <Sep />
          <ShellSegs />
        </>
      }
    />
  )
}
