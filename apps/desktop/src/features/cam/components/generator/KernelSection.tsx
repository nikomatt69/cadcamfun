import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact, CamKernelResult } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"
import { captureEditorOwner } from "../../../ai/lib/editor-sync.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useJob } from "../../hooks/useJob.ts"
import { kernelRequestOf } from "../../lib/job.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { useVerifyStore } from "../../store/verifyStore.ts"

/** Additive whole-part planning: the existing operation generator remains alongside this kernel interface. */
export default function KernelSection(props: { readonly onGCodeGenerated: (code: string) => void }): JSX.Element {
  const app = useApp()
  const job = useJob()
  const gen = useGeneratorStore()
  const store = useCamStore()
  const api = makeToolpathGenerator(app.client)
  const [material, setMaterial] = createSignal(cam.kernel.findMaterial(gen.settings.material)?.id ?? cam.kernel.MATERIALS[0]!.id)
  const [machine, setMachine] = createSignal(cam.kernel.DEFAULT_MACHINE.id)
  const [result, setResult] = createSignal<CamKernelResult>()
  const [error, setError] = createSignal<string>()
  let controller: AbortController | undefined
  let disposed = false
  const request = createMemo(() => {
    try {
      return kernelRequestOf(job.sources(), { material: material(), machine: machine(), origin: "stock-center", tolerance: gen.settings.tolerance, workOffset: gen.settings.workOffset })
    } catch { return undefined }
  })
  const artifact = createMemo<CamKernelArtifact | undefined>(() => {
    const value = result()
    if (value?.status === "ok" && value.value.release === "blocked") return value.value
    return store.kernelArtifact ?? (value?.status === "ok" ? value.value : undefined)
  })
  const savedArtifact = createMemo(() => store.kernelArtifact)
  createEffect(() => {
    const saved = savedArtifact()
    if (saved) { setMaterial(saved.material.id); setMachine(saved.machine.id) }
  })
  const stale = () => {
    const value = artifact(), current = request()
    if (!value) return false
    return !current || value.nc !== store.gcode || value.material.id !== current.material || value.machine.id !== current.machine ||
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
    <section class="workstation-section border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3" data-testid="cam-kernel-section">
      <div><h3 class="text-sm font-semibold">{t("cam.kernel.title")}</h3><p class="text-xs text-gray-500 mt-1">{t("cam.kernel.description")}</p></div>
      <label class="block text-xs">{t("cam.kernel.material")}
        <select class="ui-input w-full mt-1" value={material()} onChange={(event) => setMaterial(event.currentTarget.value)} data-testid="kernel-material">
          <For each={cam.kernel.MATERIALS}>{(item) => <option value={item.id}>{item.name} · ISO {item.iso}</option>}</For>
        </select>
      </label>
      <label class="block text-xs">{t("cam.kernel.machine")}
        <select class="ui-input w-full mt-1" value={machine()} onChange={(event) => setMachine(event.currentTarget.value)} data-testid="kernel-machine">
          <For each={cam.kernel.MACHINES}>{(item) => <option value={item.id}>{item.name} · {item.post}</option>}</For>
        </select>
      </label>
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
    </section>
  )
}
