import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { Cpu } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact, CamKernelResult } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"
import { captureEditorOwner } from "../../../ai/lib/editor-sync.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useJob } from "../../hooks/useJob.ts"
import { kernelRequestOf } from "../../lib/job.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { useVerifyStore } from "../../store/verifyStore.ts"
import { INPUT, LABEL, NumberField, Section } from "./ui.tsx"

/** Additive whole-part planning: the existing operation generator remains alongside this kernel interface. */
export default function KernelSection(props: { readonly onGCodeGenerated: (code: string) => void }): JSX.Element {
  const app = useApp()
  const job = useJob()
  const gen = useGeneratorStore()
  const store = useCamStore()
  const api = makeToolpathGenerator(app.client)
  const settings = () => gen.kernelSettings
  const [result, setResult] = createSignal<CamKernelResult>()
  const [error, setError] = createSignal<string>()
  let controller: AbortController | undefined
  let disposed = false
  const request = createMemo(() => {
    try {
      return kernelRequestOf(job.sources(), { ...settings(), tolerance: gen.settings.tolerance, workOffset: gen.settings.workOffset })
    } catch { return undefined }
  })
  const artifact = createMemo<CamKernelArtifact | undefined>(() => {
    const value = result()
    if (value?.status === "ok" && value.value.release === "blocked") return value.value
    return store.kernelArtifact ?? (value?.status === "ok" ? value.value : undefined)
  })
  const stale = () => {
    const value = artifact(), current = request()
    if (!value) return false
    const source = store.kernelRequest, stock = current?.stock
    const stockChanged = stock !== undefined ? (
      Math.abs(stock.width - (value.stockBounds.max.x - value.stockBounds.min.x)) > 1e-9 ||
      Math.abs(stock.height - (value.stockBounds.max.y - value.stockBounds.min.y)) > 1e-9 ||
      Math.abs(stock.depth - (value.stockBounds.max.z - value.stockBounds.min.z)) > 1e-9 ||
      Math.abs(stock.x - (value.stockBounds.max.x + value.stockBounds.min.x) / 2) > 1e-9 ||
      Math.abs(stock.y - (value.stockBounds.max.y + value.stockBounds.min.y) / 2) > 1e-9
    ) : source?.stock !== undefined
    return !current || value.nc !== store.gcode || value.material.id !== current.material || value.machine.id !== current.machine ||
      stockChanged || value.program.workOffset !== (current.workOffset ?? "G54") ||
      source !== undefined && ((source.tolerance ?? 0.01) !== (current.tolerance ?? 0.01) || (source.origin ?? "stock-center") !== (current.origin ?? "stock-center") || source.finishAllowance !== current.finishAllowance || source.scallop !== current.scallop || source.resolution !== current.resolution) ||
      value.identity.part !== cam.kernel.digestOf("cam-kernel/part@1", { kind: "elements", elements: current.elements })
  }
  const requestId = createMemo(() => request()?.id)
  createEffect(() => {
    requestId()
    controller?.abort()
  })
  onCleanup(() => { disposed = true; controller?.abort(); if (controller) gen.setGenerating(false) })

  const generate = async (): Promise<void> => {
    const input = request()
    if (!input || gen.isGenerating) return
    const signal = new AbortController()
    controller = signal
    const owner = captureEditorOwner()
    const previousCode = store.gcode
    setError(undefined)
    gen.setGenerating(true)
    try {
      const value = await app.runtime.run(api.manufacture(input), { signal: signal.signal })
      if (disposed || signal.signal.aborted || !owner.current() || request()?.id !== input.id || store.gcode !== previousCode) return
      setResult(value)
      if (value.status !== "ok" || value.value.release === "blocked") return
      // Publish this exact program, retaining tool changes; old operation programs and verification belong to different NC.
      store.clearOperationResults()
      useVerifyStore.getState().reset()
      store.setKernelArtifact(value.value)
      store.setKernelRequest(input)
      gen.setResult(value.value.nc, [])
      store.setGcode(value.value.nc)
      store.setProgram(value.value.program)
      props.onGCodeGenerated(value.value.nc)
    } catch (cause) {
      if (!disposed && !signal.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (controller === signal) { controller = undefined; gen.setGenerating(false) }
    }
  }

  return (
    <Section id="kernel" delay={0.22} tone="indigo" icon={Cpu} title={t("cam.kernel.title")} testId="cam-kernel-section">
      <p class="text-xs text-gray-500">{t("cam.kernel.description")}</p>
      <label class={LABEL}>{t("cam.kernel.material")}
        <select class={INPUT} value={settings().material} onChange={(event) => gen.patchKernelSettings({ material: event.currentTarget.value })} data-testid="kernel-material">
          <For each={cam.kernel.MATERIALS}>{(item) => <option value={item.id}>{item.name} · ISO {item.iso}</option>}</For>
        </select>
      </label>
      <label class={LABEL}>{t("cam.kernel.machine")}
        <select class={INPUT} value={settings().machine} onChange={(event) => gen.patchKernelSettings({ machine: event.currentTarget.value })} data-testid="kernel-machine">
          <For each={cam.kernel.MACHINES}>{(item) => <option value={item.id}>{item.name} · {item.post}</option>}</For>
        </select>
      </label>
      <details class="border-t border-gray-200 dark:border-gray-700 pt-2" data-testid="kernel-settings">
        <summary class="cursor-pointer text-sm font-medium">{t("cam.kernel.settings")}</summary>
        <div class="space-y-3 pt-3">
          <label class={LABEL}>{t("cam.kernel.origin")}
            <select class={INPUT} value={settings().origin} onChange={(event) => gen.patchKernelSettings({ origin: event.currentTarget.value as "stock-center" | "stock-corner" })} data-testid="kernel-origin">
              <option value="stock-center">{t("cam.kernel.originCenter")}</option><option value="stock-corner">{t("cam.kernel.originCorner")}</option>
            </select>
          </label>
          <label class={LABEL}>{t("cam.kernel.workOffset")}
            <select class={INPUT} value={gen.settings.workOffset} onChange={(event) => gen.updateSettings("workOffset", event.currentTarget.value as ToolpathSettings["workOffset"])} data-testid="kernel-work-offset">
              <For each={["G54", "G55", "G56", "G57", "G58", "G59"]}>{(offset) => <option value={offset}>{offset}</option>}</For>
            </select>
          </label>
          <label class={LABEL}>{t("cam.kernel.tolerance")}<NumberField id="kernel-tolerance" min="0.001" step="0.001" value={gen.settings.tolerance} onValue={(value) => gen.updateSettings("tolerance", value)} /></label>
          <label class={LABEL}>{t("cam.kernel.finishAllowance")}<NumberField id="kernel-finish-allowance" min="0" max="5" step="0.01" value={settings().finishAllowance ?? cam.kernel.findMaterial(settings().material)?.finishAllowance ?? 0.2} accept={(value) => Number.isFinite(value) && value >= 0 && value <= 5} onValue={(value) => gen.patchKernelSettings({ finishAllowance: value })} /></label>
          <label class={LABEL}>{t("cam.kernel.scallop")}<NumberField id="kernel-scallop" min="0.001" max="1" step="0.001" value={settings().scallop ?? 0.01} accept={(value) => Number.isFinite(value) && value > 0 && value <= 1} onValue={(value) => gen.patchKernelSettings({ scallop: value })} /></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings().resolution === undefined} onChange={(event) => gen.patchKernelSettings({ resolution: event.currentTarget.checked ? undefined : 0.25 })} data-testid="kernel-auto-resolution" />{t("cam.kernel.autoResolution")}</label>
          <Show when={settings().resolution !== undefined}><label class={LABEL}>{t("cam.kernel.resolution")}<NumberField id="kernel-resolution" min="0.001" step="0.01" value={settings().resolution!} onValue={(value) => gen.patchKernelSettings({ resolution: value })} /></label></Show>
          <button type="button" class="ui-btn ui-btn-secondary" onClick={() => gen.patchKernelSettings({ finishAllowance: undefined, scallop: undefined, resolution: undefined })}>{t("cam.kernel.resetQuality")}</button>
          <p class="text-xs text-gray-500">{t("cam.kernel.qualityHint")}</p>
        </div>
      </details>
      <button type="button" class="ui-btn ui-btn-primary w-full justify-center" disabled={!request() || gen.isGenerating} onClick={() => void generate()} data-testid="kernel-generate">
        {t(gen.isGenerating && controller ? "cam.kernel.generating" : "cam.kernel.generate")}
      </button>
      <Show when={!request()}><p class="text-xs text-gray-500">{t("cam.kernel.select")}</p></Show>
      <Show when={error()}><p role="alert" class="text-xs text-red-600">{error()}</p></Show>
      <Show when={result()?.status === "failed" ? result() : undefined}>{(value) => <ul class="text-xs text-red-600" role="alert"><For each={value().status === "failed" ? (value() as Extract<CamKernelResult, { status: "failed" }>).issues : []}>{(issue) => <li>{issue.message}</li>}</For></ul>}</Show>
      <Show when={artifact()}>{(value) => (
        <div class="space-y-2 text-xs" data-testid="kernel-evidence">
          <div class="flex justify-between font-semibold"><span>{t("cam.kernel.release")}</span><span>{value().release}</span></div>
          <Show when={stale()}><p role="status" class="text-amber-600" data-testid="kernel-stale">{t("cam.kernel.stale")}</p></Show>
          <p>{t("cam.kernel.summary", { operations: value().operations.length, tools: value().tools.length, seconds: value().cycleTimeSeconds.toFixed(1) })}</p>
          <For each={value().operations}>{(operation) => <div class="border-t border-gray-200 dark:border-gray-700 pt-1"><span class="font-medium">{operation.name}</span><span class="block text-gray-500">{operation.strategy} · {operation.toolId}{operation.cutting ? ` · ${operation.cutting.rpm.toFixed(0)} rpm · ${operation.cutting.feed.toFixed(0)} mm/min` : ""}</span></div>}</For>
          <For each={value().claims}>{(claim) => <div class="flex justify-between gap-2" title={claim.detail}><span>{claim.id}</span><span>{claim.status}</span></div>}</For>
          <For each={value().issues}>{(issue) => <p class={issue.severity === "error" ? "text-red-600" : "text-amber-600"}>{issue.message}</p>}</For>
          <p class="text-gray-500">{t("cam.kernel.scope")}</p>
        </div>
      )}</Show>
    </Section>
  )
}
