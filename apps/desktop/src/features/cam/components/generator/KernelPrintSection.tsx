/**
 * The verified print: the part is sliced by the CAM kernel for a printer of the catalogue (or one the person saved), and the
 * program comes back with claims about that exact G-code (plate, heating, layers, walls, first and last layer, stray beads,
 * filament) and a release level, like a milled program does. The quick generator above stays; this is the one to take to the printer.
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Cpu } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact, CamKernelResult, CamMachineConfig } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { captureEditorOwner } from "../../../ai/lib/editor-sync.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { useJob } from "../../hooks/useJob.ts"
import { kernelRequestOf } from "../../lib/job.ts"
import { kernelMachineConfigsOf, machinesFromResponse } from "../../lib/machines.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { useVerifyStore } from "../../store/verifyStore.ts"
import { formatDuration } from "./PrintResultSection.tsx"
import { Badge, Field, INPUT, Note, Section, Stat } from "./ui.tsx"

const CLAIM_LABEL: Readonly<Record<string, string>> = {
  "operations-complete": "Layers complete", "machine-limits": "Within the printer's limits", "bed-fit": "On the plate", "heated-start": "Heated before extruding",
  "layers-rise": "Layers only rise", "wall-coverage": "Walls complete", "skin-coverage": "First and last layer covered", "no-spill": "No stray beads",
  filament: "Filament matches the beads", "nc-replay": "G-code replayed independently"
}

const RELEASE_TONE = { "verified-program": "ok", preview: "warn", blocked: "bad" } as const
const RELEASE_LABEL = { "verified-program": "Verified", preview: "Preview", blocked: "Blocked" } as const

export default function KernelPrintSection(props: { readonly onGCodeGenerated: (code: string) => void }): JSX.Element {
  const app = useApp()
  const job = useJob()
  const gen = useGeneratorStore()
  const store = useCamStore()
  const api = makeToolpathGenerator(app.client)
  const [result, setResult] = createSignal<CamKernelResult>()
  const [error, setError] = createSignal<string>()
  const [saved, setSaved] = createSignal<ReadonlyArray<CamMachineConfig>>([])
  const [printer, setPrinter] = createSignal<string>(cam.kernel.PRINTERS[0]!.id)
  let controller: AbortController | undefined
  let disposed = false

  onMount(() => {
    void app.runtime.run(app.client.machineConfigs.list({ query: {} }))
      .then((value) => setSaved(kernelMachineConfigsOf(machinesFromResponse(value)).filter((row) => cam.kernel.kernelMachineOfConfig(row)?.kind === "printer")))
      .catch(() => setSaved([]))
  })
  onCleanup(() => { disposed = true; controller?.abort() })

  const request = createMemo(() => {
    try {
      const config = saved().find((row) => `config:${row.id}` === printer())
      return kernelRequestOf(job.sources(), {
        material: cam.print.FILAMENTS.find((f) => f.id === gen.printer.filament)?.name ?? "PLA",
        ...(config !== undefined ? { machineConfig: config } : { machine: printer() }),
        print: cam.generator.printRequirementOf(gen.settings, gen.printer)
      })
    } catch { return undefined }
  })
  const artifact = createMemo<CamKernelArtifact | undefined>(() => {
    const value = result()
    return value?.status === "ok" ? value.value : undefined
  })

  const generate = async (): Promise<void> => {
    const input = request()
    if (!input || gen.isGenerating) return
    const signal = new AbortController()
    controller = signal
    const owner = captureEditorOwner()
    const previous = store.gcode
    setError(undefined)
    gen.setGenerating(true)
    try {
      const value = await app.runtime.run(api.manufacture(input), { signal: signal.signal })
      if (disposed || signal.signal.aborted || !owner.current() || store.gcode !== previous) return
      setResult(value)
      if (value.status !== "ok" || value.value.release === "blocked") return
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

  const chosen = () => cam.kernel.findPrinter(printer())
  return (
    <Show when={gen.settings.machineType === "3dprinter"}>
      <Section id="kernelPrint" icon={Cpu} title="Verified print" summary={artifact() ? RELEASE_LABEL[artifact()!.release] : undefined} testId="cam-kernel-print-section">
        <Note>The kernel slices the part for a printer and checks the program it wrote: the plate, the heating, the layers, the walls and the first and last layer.</Note>
        <div class="panel-group">
          <Field label="Printer">
            <select class={INPUT} value={printer()} onChange={(event) => setPrinter(event.currentTarget.value)} data-testid="kernel-printer">
              <optgroup label="Built-in printers">
                <For each={cam.kernel.PRINTERS}>{(item) => <option value={item.id}>{item.name}</option>}</For>
              </optgroup>
              <Show when={saved().length > 0}>
                <optgroup label="Your printers">
                  <For each={saved()}>{(item) => <option value={`config:${item.id}`}>{item.name}</option>}</For>
                </optgroup>
              </Show>
            </select>
          </Field>
          <Field label="Filament" hint="Set in the Material section">
            <input class={INPUT} readOnly value={cam.print.FILAMENTS.find((f) => f.id === gen.printer.filament)?.name ?? "PLA"} data-testid="kernel-filament" />
          </Field>
        </div>
        <Show when={chosen()}>
          {(machine) => (
            <dl class="panel-kv">
              <dt>Plate</dt><dd>{machine().printer!.bed.width} x {machine().printer!.bed.depth} x {machine().printer!.buildHeight} mm</dd>
              <dt>Nozzle</dt><dd>{machine().printer!.nozzle.diameter} mm, up to {machine().printer!.nozzle.maxTemperature} deg C</dd>
              <dt>Firmware</dt><dd>{machine().printer!.flavor}</dd>
            </dl>
          )}
        </Show>
        <button type="button" class="panel-btn panel-btn--primary panel-btn--block" disabled={!request() || gen.isGenerating} onClick={() => void generate()} data-testid="kernel-print-generate">
          {gen.isGenerating && controller ? "Slicing" : "Slice and verify"}
        </button>
        <Show when={!request()}><p class="panel-hint">Select a solid in the CAD or in the explorer.</p></Show>
        <Show when={error()}><Note kind="bad" role="alert">{error()}</Note></Show>
        <Show when={result()?.status === "failed" ? result() : undefined}>
          {(value) => <For each={(value() as Extract<CamKernelResult, { status: "failed" }>).issues}>{(issue) => <Note kind="bad" role="alert">{issue.message}</Note>}</For>}
        </Show>
        <Show when={artifact()}>
          {(value) => (
            <div class="panel-group" data-testid="kernel-print-evidence">
              <div class="panel-label"><span>Release</span><Badge tone={RELEASE_TONE[value().release]}>{RELEASE_LABEL[value().release]}</Badge></div>
              <Show when={value().print}>
                {(report) => (
                  <div class="panel-stats">
                    <Stat label="Print time" value={formatDuration(report().timeSeconds)} />
                    <Stat label="Filament" value={`${report().filamentGrams.toFixed(1)} g`} sub={`${(report().filamentMm / 1000).toFixed(2)} m`} />
                    <Stat label="Layers" value={String(report().layers)} sub={`${report().layerHeight} mm`} />
                    <Stat label="Size" value={`${report().size.x.toFixed(1)} x ${report().size.y.toFixed(1)} x ${report().size.z.toFixed(1)}`} sub="mm" />
                  </div>
                )}
              </Show>
              <ul class="panel-checks">
                <For each={value().claims}>
                  {(claim) => (
                    <li title={claim.detail} data-testid={`kernel-claim-${claim.id}`}>
                      <Badge tone={claim.status === "passed" ? "ok" : claim.status === "failed" ? "bad" : "warn"}>{claim.status === "passed" ? "OK" : claim.status === "failed" ? "NO" : "?"}</Badge>
                      <span>{CLAIM_LABEL[claim.id] ?? claim.id}<span class="panel-hint">: {claim.detail}</span></span>
                    </li>
                  )}
                </For>
              </ul>
              <For each={value().issues}>{(issue) => <Note kind={issue.severity === "error" ? "bad" : "warn"}>{issue.message}</Note>}</For>
              <p class="panel-mono">NC sha256 {value().identity.nc}</p>
            </div>
          )}
        </Show>
      </Section>
    </Show>
  )
}
