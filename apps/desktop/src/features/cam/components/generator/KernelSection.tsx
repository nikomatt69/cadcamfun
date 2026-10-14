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
import { ToolSilhouette } from "../ToolSilhouette.tsx"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { useVerifyStore } from "../../store/verifyStore.ts"
import { INPUT, LABEL, NumberField, Section } from "./ui.tsx"

type Operation = cam.kernel.OperationSpec
type Cutter = cam.kernel.Cutter

/** Cutter kinds an operation can run with (the kernel rejects the others). */
const KINDS: Readonly<Record<Operation["strategy"], ReadonlyArray<Cutter["kind"]>>> = {
  face: ["facemill", "flat", "bull"], adaptive: ["flat", "bull", "ball"], pocket: ["flat", "bull", "ball"], profile: ["flat", "bull", "ball"],
  bore: ["flat", "bull"], drill: ["drill", "spot", "chamfer"], thread: ["threadmill"], engrave: ["engraver", "chamfer", "spot", "ball"],
  chamfer: ["chamfer", "spot", "engraver"], surface: ["flat", "bull", "ball"]
}
const OVERRIDES = ["rpm", "feed", "stepdown", "stepover"] as const

/** A number field whose empty value means "not set". */
function OptionalNumber(props: { readonly value: number | undefined; readonly placeholder: string; readonly testId?: string; readonly onValue: (value: number | undefined) => void }): JSX.Element {
  return (
    <input
      type="number" class="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" placeholder={props.placeholder} value={props.value ?? ""} data-testid={props.testId}
      onChange={(event) => { const raw = event.currentTarget.value.trim(); const v = Number(raw); props.onValue(raw === "" || !Number.isFinite(v) || v <= 0 ? undefined : v) }}
    />
  )
}

/** Additive whole-part planning: the existing operation generator remains alongside this kernel interface. */
export default function KernelSection(props: { readonly onGCodeGenerated: (code: string) => void }): JSX.Element {
  const app = useApp()
  const job = useJob()
  const gen = useGeneratorStore()
  const store = useCamStore()
  const api = makeToolpathGenerator(app.client)
  const settings = () => gen.kernelSettings
  const library = (): ReadonlyArray<Cutter> => settings().tools ?? cam.kernel.DEFAULT_CUTTERS
  const [planNotes, setPlanNotes] = createSignal<ReadonlyArray<string>>([])
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
    return !current || value.nc !== store.gcode || value.material.id !== (cam.kernel.findMaterial(current.material)?.id ?? current.material) || value.machine.id !== current.machine ||
      stockChanged || value.program.workOffset !== (current.workOffset ?? "G54") ||
      source !== undefined && ((source.tolerance ?? 0.01) !== (current.tolerance ?? 0.01) || (source.origin ?? "stock-center") !== (current.origin ?? "stock-center") || source.finishAllowance !== current.finishAllowance || source.scallop !== current.scallop || source.resolution !== current.resolution) ||
      value.identity.part !== cam.kernel.digestOf("cam-kernel/part@1", { kind: "elements", elements: current.elements }) ||
      source !== undefined && cam.kernel.canonicalJson([source.operations ?? null, source.tools ?? null, source.deburr ?? null]) !== cam.kernel.canonicalJson([current.operations ?? null, current.tools ?? null, current.deburr ?? null])
  }
  const requestId = createMemo(() => request()?.id)
  createEffect(() => {
    requestId()
    controller?.abort()
  })
  onCleanup(() => { disposed = true; controller?.abort(); if (controller) gen.setGenerating(false) })

  /** The kernel's plan for the current part, into the editable list. */
  const plan = (): void => {
    const input = request()
    if (!input) return
    setError(undefined)
    try {
      const { operations: _ignored, ...rest } = input
      const job = cam.kernel.jobOfSnapshot(rest)
      if (job.status === "failed") { setError(job.issues.map((i) => i.message).join("; ")); return }
      const planned = cam.kernel.planOnly(job.value)
      if (planned.status === "failed") { setError(planned.issues.map((i) => i.message).join("; ")); return }
      setPlanNotes([...planned.value.unmachined, ...planned.value.notes])
      gen.patchKernelSettings({ operations: [...planned.value.operations] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const operations = (): ReadonlyArray<Operation> => settings().operations ?? []
  const setOperations = (next: ReadonlyArray<Operation>): void => gen.patchKernelSettings({ operations: [...next] })
  const patchOperation = (index: number, patch: Readonly<Record<string, unknown>>): void => {
    const next = operations().map((op, i) => {
      if (i !== index) return op
      const merged: Record<string, unknown> = { ...op, ...patch }
      for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
      return merged as Operation
    })
    setOperations(next)
  }
  const moveOperation = (index: number, by: number): void => {
    const next = [...operations()], to = index + by
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    setOperations(next)
  }
  /** Cutters the edited plan (or the last program) uses: the ones worth describing. */
  const usedCutters = createMemo((): ReadonlyArray<Cutter> => {
    const ids = new Set([...operations().map((op) => op.tool), ...(artifact()?.tools.map((t) => t.id) ?? [])])
    return library().filter((c) => ids.has(c.id))
  })
  const patchCutter = (id: string, patch: Partial<Cutter> & { readonly holder?: Cutter["holder"] | null }): void => {
    gen.patchKernelSettings({
      tools: library().map((c) => {
        if (c.id !== id) return c
        const { holder, ...rest } = patch
        const next: Record<string, unknown> = { ...c, ...rest }
        if (holder === null) delete next["holder"]
        else if (holder !== undefined) next["holder"] = holder
        return next as Cutter
      })
    })
  }

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
          <label class={LABEL}>{t("cam.kernel.deburr")}<NumberField id="kernel-deburr" min="0" max="5" step="0.05" value={settings().deburr ?? 0} accept={(value) => Number.isFinite(value) && value >= 0 && value <= 5} onValue={(value) => gen.patchKernelSettings({ deburr: value > 0 ? value : undefined })} /></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings().resolution === undefined} onChange={(event) => gen.patchKernelSettings({ resolution: event.currentTarget.checked ? undefined : 0.25 })} data-testid="kernel-auto-resolution" />{t("cam.kernel.autoResolution")}</label>
          <Show when={settings().resolution !== undefined}><label class={LABEL}>{t("cam.kernel.resolution")}<NumberField id="kernel-resolution" min="0.001" step="0.01" value={settings().resolution!} onValue={(value) => gen.patchKernelSettings({ resolution: value })} /></label></Show>
          <button type="button" class="ui-btn ui-btn-secondary" onClick={() => gen.patchKernelSettings({ finishAllowance: undefined, scallop: undefined, resolution: undefined })}>{t("cam.kernel.resetQuality")}</button>
          <p class="text-xs text-gray-500">{t("cam.kernel.qualityHint")}</p>
        </div>
      </details>
      <details class="border-t border-gray-200 dark:border-gray-700 pt-2" data-testid="kernel-plan" open={operations().length > 0}>
        <summary class="cursor-pointer text-sm font-medium">{t("cam.kernel.operations")}{operations().length > 0 ? ` (${operations().length})` : ""}</summary>
        <div class="space-y-2 pt-2">
          <p class="text-xs text-gray-500">{t("cam.kernel.planHint")}</p>
          <div class="flex gap-2">
            <button type="button" class="ui-btn ui-btn-secondary" disabled={!request()} onClick={plan} data-testid="kernel-plan-button">{t("cam.kernel.plan")}</button>
            <Show when={settings().operations !== undefined}>
              <button type="button" class="ui-btn ui-btn-secondary" onClick={() => { gen.patchKernelSettings({ operations: undefined }); setPlanNotes([]) }} data-testid="kernel-plan-reset">{t("cam.kernel.planReset")}</button>
            </Show>
          </div>
          <For each={planNotes()}>{(note) => <p class="text-[11px] text-amber-700">{note}</p>}</For>
          <For each={operations()}>
            {(op, index) => {
              const cutter = () => library().find((c) => c.id === op.tool)
              const own = op as unknown as Readonly<Record<string, number | undefined>>
              return (
                <div class="rounded border border-gray-200 dark:border-gray-700 p-1.5 text-xs space-y-1" data-testid="kernel-plan-operation">
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-medium truncate" title={op.name ?? op.id}>{index() + 1}. {op.name ?? op.id}</span>
                    <span class="flex gap-0.5">
                      <button type="button" class="px-1 rounded hover:bg-gray-100" aria-label="Move up" onClick={() => moveOperation(index(), -1)}>↑</button>
                      <button type="button" class="px-1 rounded hover:bg-gray-100" aria-label="Move down" onClick={() => moveOperation(index(), 1)}>↓</button>
                      <button type="button" class="px-1 rounded text-red-600 hover:bg-red-50" aria-label="Remove" data-testid="kernel-plan-remove" onClick={() => setOperations(operations().filter((_, i) => i !== index()))}>✕</button>
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <Show when={cutter()}>{(c) => <ToolSilhouette cutter={c()} height={36} />}</Show>
                    <select class="flex-1 rounded border border-gray-300 px-1 py-0.5 text-xs" value={op.tool} onChange={(event) => patchOperation(index(), { tool: event.currentTarget.value })} data-testid="kernel-plan-tool">
                      <For each={library().filter((c) => KINDS[op.strategy].includes(c.kind) || c.id === op.tool)}>{(c) => <option value={c.id}>{c.name}</option>}</For>
                    </select>
                    <span class="text-gray-500">{op.strategy}</span>
                  </div>
                  <div class="grid grid-cols-4 gap-1">
                    <For each={OVERRIDES}>{(key) => <label class="text-[10px] text-gray-500">{key}<OptionalNumber value={own[key]} placeholder={t("cam.kernel.fromData")} testId={`kernel-plan-${key}`} onValue={(value) => patchOperation(index(), { [key]: value })} /></label>}</For>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </details>
      <details class="border-t border-gray-200 dark:border-gray-700 pt-2" data-testid="kernel-cutters">
        <summary class="cursor-pointer text-sm font-medium">{t("cam.kernel.cutters")} ({usedCutters().length})</summary>
        <div class="space-y-2 pt-2">
          <p class="text-xs text-gray-500">{t("cam.kernel.cuttersHint")}</p>
          <Show when={settings().tools !== undefined}>
            <button type="button" class="ui-btn ui-btn-secondary" onClick={() => gen.patchKernelSettings({ tools: undefined })}>{t("cam.kernel.cuttersReset")}</button>
          </Show>
          <For each={usedCutters()}>
            {(c) => (
              <div class="flex gap-2 rounded border border-gray-200 dark:border-gray-700 p-1.5 text-xs" data-testid="kernel-cutter">
                <ToolSilhouette cutter={c} height={90} />
                <div class="flex-1 space-y-1">
                  <div class="font-medium">{c.name}</div>
                  <div class="grid grid-cols-2 gap-1">
                    <label class="text-[10px] text-gray-500">flutes mm<OptionalNumber value={c.fluteLength} placeholder="" onValue={(v) => v !== undefined && patchCutter(c.id, { fluteLength: v })} /></label>
                    <label class="text-[10px] text-gray-500">stickout mm<OptionalNumber value={c.stickout} placeholder="" testId="kernel-cutter-stickout" onValue={(v) => v !== undefined && patchCutter(c.id, { stickout: Math.max(v, c.fluteLength) })} /></label>
                    <label class="text-[10px] text-gray-500">holder Ø<OptionalNumber value={c.holder?.diameter} placeholder={t("cam.kernel.holderNone")} testId="kernel-cutter-holder" onValue={(v) => patchCutter(c.id, { holder: v === undefined ? null : { diameter: v, length: c.holder?.length ?? 40 } })} /></label>
                    <label class="text-[10px] text-gray-500">holder length<OptionalNumber value={c.holder?.length} placeholder="" onValue={(v) => v !== undefined && c.holder !== undefined && patchCutter(c.id, { holder: { diameter: c.holder.diameter, length: v } })} /></label>
                  </div>
                </div>
              </div>
            )}
          </For>
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
          <div class="flex flex-wrap gap-2" data-testid="kernel-tools">
            <For each={value().tools}>
              {(tool) => (
                <div class="flex items-center gap-1 rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] text-gray-700" title={`${tool.name}: Ø${tool.diameter}, ${tool.fluteLength} mm flutes, ${tool.stickout} mm stickout${tool.holder ? `, holder Ø${tool.holder.diameter} x ${tool.holder.length}` : ""}`}>
                  <ToolSilhouette cutter={tool as cam.kernel.Cutter} height={48} />
                  <span>T{tool.number}<br />Ø{tool.diameter}</span>
                </div>
              )}
            </For>
          </div>
          <For each={value().operations}>{(operation) => <div class="border-t border-gray-200 dark:border-gray-700 pt-1"><span class="font-medium">{operation.name}</span><span class="block text-gray-500">{operation.strategy} · {operation.toolId}{operation.cutting ? ` · ${operation.cutting.rpm.toFixed(0)} rpm · ${operation.cutting.feed.toFixed(0)} mm/min` : ""}</span></div>}</For>
          <For each={value().claims}>{(claim) => <div class="flex justify-between gap-2" title={claim.detail}><span>{claim.id}</span><span>{claim.status}</span></div>}</For>
          <For each={value().issues}>{(issue) => <p class={issue.severity === "error" ? "text-red-600" : "text-amber-600"}>{issue.message}</p>}</For>
          <p class="text-gray-500">{t("cam.kernel.scope")}</p>
        </div>
      )}</Show>
    </Section>
  )
}
