/**
 * The "Verify" tab of the CAM sidebar: replays the current G-code on the stock (sidecar
 * `toolpathGenerator.verify`) and shows what the simulation found.
 *
 * The panel owns no simulation logic. It describes the job (the generator's own settings and stock) plus
 * the holder the user fills in, and draws the verdict: errors first, the numbers, and the remaining stock
 * as a height map with gouges in red. Nothing is checked that was not modelled, and the panel says so.
 */
import { VerifyPreview } from "../../../shared/ui/stageshow/scenes-cam.tsx"
import { For, Show, createEffect, type JSX } from "solid-js"
import { AlertTriangle, Check, MessageCircle } from "lucide-solid"
import { cam as camCore } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"
import { fixVerificationPrompt } from "../../ai/lib/ask.ts"
import { useAskAi } from "../../ai/hooks/use-ask-ai.ts"
import { useApp } from "../../../shared/state/context.ts"
import { makeToolpathGenerator, type VerifyResponse } from "../api/generator.ts"
import { geometryOf } from "../lib/job.ts"
import { useJob } from "../hooks/useJob.ts"
import { buildVerifyRequest, heightColour, sortedIssues } from "../lib/verifyJob.ts"
import { useCamStore } from "../store/camStore.ts"
import { useGeneratorStore } from "../store/generatorStore.ts"
import { useVerifyStore } from "../store/verifyStore.ts"
import { INPUT, LABEL, NumberField, PanelCard } from "../../../shared/components/panel/ui.tsx"

const SCALE = 5

/** Draws the downsampled remaining stock; guarded because a canvas may have no 2D context (tests, blocked GPU). */
export const drawMap = (canvas: HTMLCanvasElement, preview: VerifyResponse["preview"]): void => {
  if (preview.nx === 0 || preview.ny === 0) return
  canvas.width = preview.nx * SCALE
  canvas.height = preview.ny * SCALE
  const ctx = canvas.getContext("2d")
  if (ctx === null || ctx === undefined) return
  for (let j = 0; j < preview.ny; j++) {
    for (let i = 0; i < preview.nx; i++) {
      const k = j * preview.nx + i
      ctx.fillStyle = preview.gouge[k] === 1 ? "rgb(220,38,38)" : heightColour(preview.heights[k]!, preview.minZ, preview.maxZ)
      // Y grows upwards in the part, downwards on the canvas.
      ctx.fillRect(i * SCALE, (preview.ny - 1 - j) * SCALE, SCALE, SCALE)
    }
  }
}

const mm3 = (n: number): string => `${Math.round(n).toLocaleString("en-US")} mm³`

export default function VerifyPanel(): JSX.Element {
  const app = useApp()
  const gen = useGeneratorStore()
  const cam = useCamStore()
  const job = useJob()
  const verify = useVerifyStore()
  const ask = useAskAi()
  const generator = makeToolpathGenerator(app.client)
  let canvas: HTMLCanvasElement | undefined

  const run = async (): Promise<void> => {
    const gcode = cam.gcode
    const built = buildVerifyRequest(
      { settings: gen.settings, geometry: geometryOf(gen, job.sources()), printer: gen.printer } as camCore.generator.GenerateRequest,
      gcode,
      verify.holder
    )
    if (!built.ok) { verify.fail(built.error); return }
    verify.start()
    try {
      verify.finish(await app.runtime.run(generator.verify(built.request)), gcode)
    } catch (cause) {
      verify.fail(cause instanceof Error ? cause.message : String(cause))
    }
  }

  createEffect(() => {
    const report = verify.report
    if (report !== null && canvas !== undefined) drawMap(canvas, report.preview)
  })

  const errors = (): number => verify.report?.issues.filter((issue) => issue.severity === "error").length ?? 0
  const stale = (): boolean => verify.report !== null && verify.verifiedGcode !== cam.gcode
  const field = (label: string, key: "cuttingLength" | "stickout" | "holderDiameter" | "holderLength" | "tolerance", step: string): JSX.Element => (
    <div class="panel-field">
      <label class={LABEL} for={`verify-${key}`}>{label}</label>
      <NumberField id={`verify-${key}`} min="0" step={step} value={verify.holder[key]} accept={(value) => value >= 0} onValue={(value) => verify.setHolder({ [key]: value })} />
    </div>
  )

  return (
    <PanelCard title={t("cam.verify.title")} testId="verify-panel">
      <p class="panel-hint">{t("cam.verify.hint")}</p>

      <div class="grid grid-cols-2 gap-3">
        {field(t("cam.verify.cuttingLength"), "cuttingLength", "0.5")}
        {field(t("cam.verify.stickout"), "stickout", "0.5")}
        {field(t("cam.verify.holderDiameter"), "holderDiameter", "1")}
        {field(t("cam.verify.holderLength"), "holderLength", "1")}
        {field(t("cam.verify.tolerance"), "tolerance", "0.01")}
      </div>

      <button
        type="button"
        class="panel-btn panel-btn--primary panel-btn--block"
        disabled={verify.running || cam.gcode.trim().length === 0}
        onClick={() => void run()}
      >
        {verify.running ? t("cam.verify.running") : t("cam.verify.run")}
      </button>
      <Show when={cam.gcode.trim().length === 0}>
        <div class="overflow-hidden rounded-[5px] border border-[color:var(--panel-border)]" aria-hidden="true"><VerifyPreview /></div>
        <p class="panel-hint">{t("cam.verify.empty")}</p>
      </Show>

      <Show when={verify.error}>
        <div class="flex items-start rounded-[5px] bg-[color:var(--panel-bad-soft)] text-[color:var(--panel-bad)] p-3" role="alert">
          <AlertTriangle class="mr-2 mt-0.5 flex-shrink-0" size={14} />
          <p class="text-xs">{verify.error}</p>
        </div>
      </Show>

      <Show when={verify.report}>
        {(report) => (
          <div class="space-y-3" data-testid="verify-report">
            <Show when={stale()}><p class="rounded-[5px] bg-[color:var(--panel-warn-soft)] text-[color:var(--panel-warn)] p-2 text-xs" role="status" data-testid="verify-stale">{t("cam.verify.stale")}</p></Show>
            <div
              class={`flex items-center rounded-[5px] p-3 ${stale() ? "bg-[color:var(--panel-bg-subtle)] text-[color:var(--panel-text-muted)]" : report().ok ? "bg-[color:var(--panel-ok-soft)] text-[color:var(--panel-ok)]" : "bg-[color:var(--panel-bad-soft)] text-[color:var(--panel-bad)]"}`}
              role="status"
              data-ok={report().ok}
            >
              <Show when={report().ok} fallback={<AlertTriangle size={14} class="mr-2" />}><Check size={14} class="mr-2" /></Show>
              <span class="text-xs font-medium">{report().ok ? t("cam.verify.passed") : t("cam.verify.failed", { count: errors() })}</span>
            </div>
            <Show when={errors() > 0}>
              <button type="button" class="panel-btn panel-btn--block" onClick={() => ask(fixVerificationPrompt(report().issues))} data-testid="verify-ask-ai">
                <MessageCircle size={16} aria-hidden="true" />{t("cam.verify.askAssistant")}
              </button>
            </Show>

            <ul class="space-y-1" data-testid="verify-issues">
              <For each={sortedIssues(report().issues)}>
                {(issue) => (
                  <li class={`text-[11px] p-2 rounded-[4px] ${issue.severity === "error" ? "bg-[color:var(--panel-bad-soft)] text-[color:var(--panel-bad)]" : issue.severity === "warning" ? "bg-[color:var(--panel-warn-soft)] text-[color:var(--panel-warn)]" : "bg-[color:var(--panel-bg-subtle)] text-[color:var(--panel-text-muted)]"}`} data-code={issue.code}>
                    <span class="font-semibold">{issue.code}</span>
                    <Show when={issue.line !== undefined}><span class="ml-1 opacity-70">({t("cam.verify.line", { line: issue.line! })})</span></Show>
                    <Show when={issue.count > 1}><span class="ml-1 opacity-70">×{issue.count}</span></Show>
                    <div>{issue.message}</div>
                  </li>
                )}
              </For>
            </ul>

            <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]" data-testid="verify-stats">
              <dt class="text-[color:var(--panel-text-muted)]">{t("cam.verify.removed")}</dt><dd class="tabular-nums">{mm3(report().stats.removedVolume)}</dd>
              <dt class="text-[color:var(--panel-text-muted)]">{t("cam.verify.remaining")}</dt><dd class="tabular-nums">{mm3(report().stats.remainingVolume)}</dd>
              <dt class="text-[color:var(--panel-text-muted)]">{t("cam.verify.airCut")}</dt><dd class="tabular-nums">{report().stats.airCutLength.toFixed(1)} {t("cad.millimeters")}</dd>
              <dt class="text-[color:var(--panel-text-muted)]">{t("cam.verify.resolution")}</dt><dd class="tabular-nums">{report().stats.cellSize.toFixed(2)} {t("cad.millimeters")}</dd>
            </dl>

            <div>
              <p class="panel-hint mb-1">{t("cam.verify.map")}</p>
              <canvas ref={canvas} role="img" aria-label={t("cam.verify.map")} class="w-full rounded-[4px] border border-[color:var(--panel-border-strong)]" style={{ "image-rendering": "pixelated" }} data-testid="verify-map" />
            </div>
            <p class="panel-hint">{t("cam.verify.caveat")}</p>
          </div>
        )}
      </Show>
    </PanelCard>
  )
}
