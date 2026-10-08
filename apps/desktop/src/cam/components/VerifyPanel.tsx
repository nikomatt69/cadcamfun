/**
 * The "Verify" tab of the CAM sidebar: replays the current G-code on the stock (sidecar
 * `toolpathGenerator.verify`) and shows what the simulation found.
 *
 * The panel owns no simulation logic. It describes the job (the generator's own settings and stock) plus
 * the holder the user fills in, and draws the verdict: errors first, the numbers, and the remaining stock
 * as a height map with gouges in red. Nothing is checked that was not modelled, and the panel says so.
 */
import { For, Show, createEffect, type JSX } from "solid-js"
import { AlertTriangle, Check, ShieldCheck, Sparkles } from "lucide-solid"
import { cam as camCore } from "@cadcamfun/core"
import { t } from "../../i18n/index.ts"
import { fixVerificationPrompt, useAskAi } from "../../ai/ask.ts"
import { useApp } from "../../state/context.ts"
import { makeToolpathGenerator, type VerifyResponse } from "../api/generator.ts"
import { geometryOf } from "../lib/job.ts"
import { useJob } from "../lib/useJob.ts"
import { buildVerifyRequest, heightColour, sortedIssues } from "../lib/verifyJob.ts"
import { useCamStore } from "../store/camStore.ts"
import { useGeneratorStore } from "../store/generatorStore.ts"
import { useVerifyStore } from "../store/verifyStore.ts"
import { INPUT, LABEL, NumberField } from "./generator/ui.tsx"

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
    <div>
      <label class={LABEL} for={`verify-${key}`}>{label}</label>
      <NumberField id={`verify-${key}`} min="0" step={step} value={verify.holder[key]} accept={(value) => value >= 0} onValue={(value) => verify.setHolder({ [key]: value })} />
    </div>
  )

  return (
    <div class="p-4 space-y-4" data-testid="verify-panel">
      <div class="flex items-center space-x-2">
        <ShieldCheck size={20} class="text-blue-600" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{t("cam.verify.title")}</h3>
      </div>
      <p class="text-xs text-gray-600 dark:text-gray-400">{t("cam.verify.hint")}</p>

      <div class="grid grid-cols-2 gap-3">
        {field(t("cam.verify.cuttingLength"), "cuttingLength", "0.5")}
        {field(t("cam.verify.stickout"), "stickout", "0.5")}
        {field(t("cam.verify.holderDiameter"), "holderDiameter", "1")}
        {field(t("cam.verify.holderLength"), "holderLength", "1")}
        {field(t("cam.verify.tolerance"), "tolerance", "0.01")}
      </div>

      <button
        type="button"
        class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={verify.running || cam.gcode.trim().length === 0}
        onClick={() => void run()}
      >
        {verify.running ? t("cam.verify.running") : t("cam.verify.run")}
      </button>
      <Show when={cam.gcode.trim().length === 0}><p class="text-xs text-gray-500">{t("cam.verify.empty")}</p></Show>

      <Show when={verify.error}>
        <div class="p-3 bg-red-50 rounded-md flex items-start" role="alert">
          <AlertTriangle class="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
          <p class="text-sm text-red-800">{verify.error}</p>
        </div>
      </Show>

      <Show when={verify.report}>
        {(report) => (
          <div class="space-y-3" data-testid="verify-report">
            <div
              class={`p-3 rounded-md flex items-center ${report().ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
              role="status"
              data-ok={report().ok}
            >
              <Show when={report().ok} fallback={<AlertTriangle size={18} class="mr-2" />}><Check size={18} class="mr-2" /></Show>
              <span class="text-sm font-medium">{report().ok ? t("cam.verify.passed") : t("cam.verify.failed", { count: errors() })}</span>
            </div>
            <Show when={errors() > 0}>
              <button type="button" class="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm" onClick={() => ask(fixVerificationPrompt(report().issues))} data-testid="verify-ask-ai">
                <Sparkles size={16} />{t("cam.verify.askAssistant")}
              </button>
            </Show>
            <Show when={stale()}><p class="text-xs text-yellow-700" data-testid="verify-stale">{t("cam.verify.stale")}</p></Show>

            <ul class="space-y-1" data-testid="verify-issues">
              <For each={sortedIssues(report().issues)}>
                {(issue) => (
                  <li class={`text-xs p-2 rounded ${issue.severity === "error" ? "bg-red-50 text-red-800" : issue.severity === "warning" ? "bg-yellow-50 text-yellow-800" : "bg-gray-50 text-gray-700"}`} data-code={issue.code}>
                    <span class="font-semibold">{issue.code}</span>
                    <Show when={issue.line !== undefined}><span class="ml-1 opacity-70">({t("cam.verify.line", { line: issue.line! })})</span></Show>
                    <Show when={issue.count > 1}><span class="ml-1 opacity-70">×{issue.count}</span></Show>
                    <div>{issue.message}</div>
                  </li>
                )}
              </For>
            </ul>

            <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="verify-stats">
              <dt class="text-gray-500">{t("cam.verify.removed")}</dt><dd>{mm3(report().stats.removedVolume)}</dd>
              <dt class="text-gray-500">{t("cam.verify.remaining")}</dt><dd>{mm3(report().stats.remainingVolume)}</dd>
              <dt class="text-gray-500">{t("cam.verify.airCut")}</dt><dd>{report().stats.airCutLength.toFixed(1)} mm</dd>
              <dt class="text-gray-500">{t("cam.verify.resolution")}</dt><dd>{report().stats.cellSize.toFixed(2)} mm</dd>
            </dl>

            <div>
              <p class="text-xs text-gray-500 mb-1">{t("cam.verify.map")}</p>
              <canvas ref={canvas} class="w-full border border-gray-300 rounded" style={{ "image-rendering": "pixelated" }} data-testid="verify-map" />
            </div>
            <p class="text-xs text-gray-500">{t("cam.verify.caveat")}</p>
          </div>
        )}
      </Show>
    </div>
  )
}
