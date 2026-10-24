import { Show, createMemo, type JSX } from "solid-js"
import { cam as camCore } from "@cadcamfun/core"
import { Seg, Sep, ShellSegs, Strip, type Tone } from "../../../shared/components/workspace-strip.tsx"
import { t } from "../../../i18n/index.ts"
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

const TAB_LABEL = { editor: "cam.editor", toolpath: "cam.toolpath", post: "cam.postTab" } as const

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
    if (verify.running) return { text: t("cam.status.verifyRunning"), tone: "amber" }
    if (verify.report === null) return { text: t("cam.status.verifyNotRun"), tone: "muted" }
    if (verify.verifiedGcode !== cam.gcode) return { text: t("cam.status.verifyStale"), tone: "amber" }
    const errors = verify.report.issues.filter((issue) => issue.severity === "error").length
    if (errors === 0) return { text: t("cam.status.verifyOk"), tone: "green" }
    return { text: errors === 1 ? t("cam.status.verifyError") : t("cam.status.verifyErrors", { count: errors }), tone: "red" }
  }

  return (
    <Strip
      label={t("cam.status.label")}
      testId="cam-status-bar"
      left={
        <>
          <Seg label={t("cam.status.view")} value={t(TAB_LABEL[cam.activeTab])} tone="blue" />
          <Seg label={t("cam.status.lines")} value={lines()} testId="status-lines" />
          <Seg label={t("cam.status.moves")} value={totals().moves} hideBelow="md" />
          <Seg label={t("cam.status.cut")} value={`${totals().length.toFixed(1)} mm`} tone="cyan" hideBelow="lg" title={t("cam.status.feedLength")} />
          <Seg label={t("cam.status.time")} value={clock(totals().seconds)} tone="green" title={t("cam.status.timeEstimate", { rate: RAPID_RATE })} hideBelow="md" />
          <Show when={totals().minZ !== undefined}><Seg label={t("cam.status.minZ")} value={totals().minZ!.toFixed(2)} tone="amber" hideBelow="lg" /></Show>
          <Sep />
          <Seg label={t("cam.status.tool")} value={`${gen.settings.toolType} Ø${gen.settings.toolDiameter}`} hideBelow="md" title={t("cam.status.toolTitle")} />
          <Seg label={t("cam.status.spindle")} value={gen.settings.rpm} hideBelow="xl" title={t("cam.status.spindleTitle")} />
          <Seg label={t("cam.status.feed")} value={gen.settings.feedrate} hideBelow="xl" title={t("cam.status.feedTitle")} />
          <Seg label={t("cam.material")} value={<span class="capitalize">{gen.settings.material}</span>} tone="green" hideBelow="lg" />
          <Show when={stock()}>
            {(s) => <Seg label={t("cam.status.stock")} value={`${s().width.toFixed(1)} × ${s().height.toFixed(1)} × ${s().depth.toFixed(1)}`} tone="cyan" hideBelow="lg" title={t("cam.status.stockTitle")} />}
          </Show>
          <Sep />
          <Seg label={t("cam.status.post")} value={cam.controller.toUpperCase()} hideBelow="lg" />
          <Seg label={t("cam.status.wcs")} value={cam.program.workOffset} hideBelow="xl" title={t("cam.status.wcsTitle")} />
        </>
      }
      right={
        <>
          <Show when={selection.selectedElementIds.length > 0}><Seg value={t("cam.selected", { count: selection.selectedElementIds.length })} tone="amber" /></Show>
          <Show when={cam.selectedOperationId}><Seg label={t("cam.status.op")} value={cam.selectedOperationId!} hideBelow="xl" /></Show>
          <Seg label={t("cam.verify")} value={verdict().text} tone={verdict().tone} title={t("cam.status.verifyTitle")} testId="status-verify" />
          <Show when={cam.playing || cam.playbackTime > 0}>
            <Seg label={t("cam.status.sim")} value={`${clock(cam.playbackTime)} / ${clock(totals().seconds)}`} tone="purple" />
          </Show>
          <Sep />
          <ShellSegs />
        </>
      }
    />
  )
}
