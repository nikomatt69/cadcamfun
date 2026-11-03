import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Schema } from "effect"
import { CamKernelArtifact, CamProgramDocument, type ToolpathRow } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { ResourceGeometryPreview, resourceElements } from "../../library/components/ResourceGeometryPreview.tsx"
import { StatGrid, type StatItem } from "../../library/components/ResourceStats.tsx"
import { buildPlayback, playbackSegments } from "../../../viewport/view3d/playback.ts"
import { t } from "../../../i18n/index.ts"
import { diffLines, programStatusText, type DiffLike } from "../../cam/lib/model-change.ts"
import { useApp } from "../../../shared/state/context.ts"
import { toast } from "../../../shared/ui/feedback.tsx"

const minutes = (seconds: number): string => {
  const rounded = Math.round(seconds)
  return rounded < 60 ? `${rounded} s` : `${Math.floor(rounded / 60)} min ${rounded % 60} s`
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const decode = <A,>(schema: Schema.Codec<A>, value: unknown): A | undefined => {
  const result = Schema.decodeUnknownOption(schema)(value)
  return result._tag === "Some" ? result.value : undefined
}

export function ToolpathProgramDetails(props: { readonly row: ToolpathRow; readonly drawing?: unknown; /** Called after a regeneration replaced the stored program, so the screen reads it again. */ readonly onChanged?: () => void }): JSX.Element {
  const app = useApp()
  const document = createMemo(() => decode(CamProgramDocument, props.row.data))
  const artifact = createMemo(() => {
    const value = decode(CamKernelArtifact, record(props.row.data)["kernelArtifact"])
    return value?.nc === props.row.gcode && value.identity.nc === cam.kernel.sha256(value.nc) ? value : undefined
  })
  const elements = createMemo(() => {
    const data = record(props.row.data), request = record(data["kernelRequest"])
    return resourceElements(request["elements"] ? request : document()?.drawing ?? props.drawing ?? data)
  })
  const program = createMemo(() => artifact()?.program ?? (document()?.gcode === props.row.gcode ? document()?.program : undefined) ?? cam.generator.analyseGcode(props.row.gcode ?? "").program)
  const operations = createMemo(() => {
    const native = artifact()
    if (native) return native.operations.map((operation) => ({
      id: operation.id, name: operation.name, strategy: operation.strategy,
      tool: native.tools.find((tool) => tool.id === operation.toolId)?.name ?? operation.toolId,
      parameters: operation.parameters, warnings: operation.warnings, gcode: undefined as string | undefined,
      moves: native.program.toolpaths.filter((path) => path.id === operation.id).reduce((sum, path) => sum + path.moves.length, 0)
    }))
    if (document()?.gcode === props.row.gcode && document()?.operations?.length) return document()!.operations!.map((operation) => ({
      id: operation.id, name: operation.name, strategy: operation.settings?.operationType ?? "",
      tool: operation.tool ?? [...new Set(operation.program.toolpaths.map((path) => path.toolId))].join(", "),
      parameters: operation.settings ?? {}, warnings: [] as readonly string[], gcode: operation.gcode,
      moves: operation.program.toolpaths.reduce((sum, path) => sum + path.moves.length, 0)
    }))
    return []
  })
  const summary = createMemo(() => {
    const native = artifact(), saved = document(), settings = saved?.settings ?? record(record(props.row.data)["request"])["settings"]
    const params = record(settings), stock = saved?.stock
    return [
      { label: t("cam.resource.material"), value: native?.material.name ?? params["material"] },
      { label: t("cam.resource.machine"), value: native?.machine.name ?? props.row.type },
      { label: t("cam.resource.stock"), value: stock ? `${stock.width} × ${stock.height} × ${stock.depth} mm` : undefined },
      { label: t("cam.resource.feed"), value: params["feedrate"] === undefined ? undefined : `${params["feedrate"]} mm/min` },
      { label: t("cam.resource.rpm"), value: params["rpm"] },
      { label: t("cam.resource.depth"), value: params["depth"] === undefined ? undefined : `${params["depth"]} mm` }
    ].filter((field) => field.value !== undefined && field.value !== null)
  })
  /** What the program does in the preview: the length cut and rapided, the moves and the time they take. */
  const motion = createMemo((): ReadonlyArray<StatItem> => {
    const current = program()
    if (!current) return []
    try {
      const playback = buildPlayback(current)
      let cut = 0, rapid = 0, moves = 0
      for (const segment of playbackSegments(playback)) {
        const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y, segment.to.z - segment.from.z)
        if (segment.rapid) rapid += length; else cut += length
        moves += 1
      }
      return [
        { get label() { return t("pages.cutting.length") }, value: `${(cut / 1000).toFixed(2)} m` }, { get label() { return t("pages.rapid.length") }, value: `${(rapid / 1000).toFixed(2)} m` },
        { get label() { return t("pages.segments") }, value: String(moves) }, { get label() { return t("cam.post.panel.time") }, value: minutes(playback.duration) }
      ]
    } catch { return [] }
  })
  // Whether the drawing still matches the model a native program was made from (spec 59 A2); the drawing arrives a moment after the row.
  const modelStatus = createMemo(() => {
    const data = record(props.row.data)
    if (data["kernelRequest"] === undefined || props.drawing === undefined) return undefined
    const list = record(props.drawing)["elements"]
    const current = Array.isArray(list) ? list.filter((e): e is Record<string, unknown> => e !== null && typeof e === "object") : []
    return programStatusText(cam.kernel.programStatus({ request: data["kernelRequest"] }, { elements: current }))
  })
  // Regenerating a stored native program (spec 59 A3, A4): a preview with the diff, then an accept that keeps the old program as a version.
  // A program saved as a CAM page document is regenerated from the CAM page, which rebuilds the whole document.
  const regenerable = createMemo(() => {
    const data = record(props.row.data)
    return data["kernelRequest"] !== undefined && data["kernelArtifact"] !== undefined && data["format"] !== "cadcamfun-cam" && props.row.drawingId != null
  })
  const [regen, setRegen] = createSignal<{ readonly state: "idle" } | { readonly state: "busy" } | { readonly state: "error"; readonly message: string } | { readonly state: "preview"; readonly diff: DiffLike; readonly failed?: string } | { readonly state: "accepted" } | { readonly state: "refused"; readonly reason: string; readonly diff: DiffLike }>({ state: "idle" })
  const regenerate = async (accept: boolean): Promise<void> => {
    setRegen({ state: "busy" })
    try {
      const result = await app.runtime.run(app.client.toolpaths.regenerate({ params: { id: props.row.id }, payload: { accept } }))
      if (result.outcome.status === "failed") { setRegen({ state: "error", message: result.outcome.issues.map((i) => i.message).join("; ") }); return }
      const diff = result.outcome.diff
      // The screen reads the replaced program again (and so remounts this section): the notice is a toast, which outlives it.
      if (accept && result.accepted) { setRegen({ state: "accepted" }); toast.success(t("cam.kernel.regenerate.accepted")); props.onChanged?.(); return }
      if (accept) { setRegen({ state: "refused", reason: result.refusal ?? "", diff }); return }
      setRegen({ state: "preview", diff })
    } catch (cause) {
      setRegen({ state: "error", message: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return <section class="space-y-4" data-testid="toolpath-program-details">
    <Show when={regenerable()}>
      <div class="space-y-2 text-xs" data-testid="toolpath-regenerate">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="panel-btn" data-testid="toolpath-regenerate-preview" disabled={regen().state === "busy"} onClick={() => void regenerate(false)}>
            {t(regen().state === "busy" ? "cam.kernel.regenerate.busy" : "cam.kernel.regenerate.preview")}
          </button>
          <Show when={regen().state === "preview" || regen().state === "refused"}>
            <button type="button" class="panel-btn panel-btn--primary" data-testid="toolpath-regenerate-accept" onClick={() => void regenerate(true)}>{t("cam.kernel.regenerate.accept")}</button>
          </Show>
        </div>
        <Show when={regen()}>{(state) => (
          <div class="space-y-1" role="status" data-testid="toolpath-regenerate-result" data-state={state().state}>
            <Show when={state().state === "error"}><p class="text-[color:var(--ent-warn)]">{t("cam.kernel.regenerate.failed", { message: (state() as { message: string }).message })}</p></Show>
            <Show when={state().state === "accepted"}><p>{t("cam.kernel.regenerate.accepted")}</p></Show>
            <Show when={state().state === "refused"}><p class="text-[color:var(--ent-warn)]">{t("cam.kernel.regenerate.refused", { reason: (state() as { reason: string }).reason })}</p></Show>
            <For each={state().state === "preview" || state().state === "refused" ? diffLines((state() as { diff: DiffLike }).diff) : []}>{(line) => <p>{line}</p>}</For>
          </div>
        )}</Show>
      </div>
    </Show>
    <Show when={modelStatus()}>{(status) => (
      <p class={`text-xs ${status().tone === "warn" ? "text-[color:var(--ent-warn)]" : "text-[color:var(--ent-text-muted)]"}`} title={status().detail} data-testid="toolpath-model-status" data-tone={status().tone}>{status().text}</p>
    )}</Show>
    <ResourceGeometryPreview elements={elements()} program={program()} origin={artifact()?.origin} />
    <Show when={!elements().length}><p class="text-xs text-[color:var(--ent-text-muted)]">{t("cam.resource.noGeometry")}</p></Show>
    <StatGrid columns={3} items={[...summary().map((field) => ({ label: field.label, value: String(field.value) })), ...motion()]} />
    <div>
      <h3 class="mb-2 text-[13px] font-semibold text-[color:var(--ent-text)]">{t("cam.resource.operations", { count: operations().length })}</h3>
      <Show when={operations().length} fallback={<p class="text-xs text-[color:var(--ent-text-muted)]">{t("cam.resource.noOperations")}</p>}>
        <ol class="space-y-2" data-testid="saved-operations"><For each={operations()}>{(operation, index) => <li class="rounded-[5px] border border-[color:var(--ent-line)] p-3">
          <h4 class="text-xs font-semibold text-[color:var(--ent-text)]">{index() + 1}. {operation.name}</h4>
          <dl class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[color:var(--ent-text-muted)]">
            <Show when={operation.strategy}><div><dt class="inline">{t("cam.resource.strategy")}: </dt><dd class="inline">{operation.strategy}</dd></div></Show>
            <div><dt class="inline">{t("cam.resource.tool")}: </dt><dd class="inline">{operation.tool}</dd></div>
            <div>{t("cam.resource.moves", { count: operation.moves })}</div>
          </dl>
          <Show when={Object.keys(operation.parameters).length}><details class="mt-2 text-xs"><summary class="cursor-pointer text-[color:var(--ent-accent)]">{t("cam.resource.parameters")}</summary><pre class="mt-2 max-h-56 overflow-auto rounded-[5px] border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] p-3 font-mono text-[11px] text-[color:var(--ent-text)]">{JSON.stringify(operation.parameters, null, 2)}</pre></details></Show>
          <Show when={operation.gcode}><details class="mt-2 text-xs"><summary class="cursor-pointer text-[color:var(--ent-accent)]">{t("cam.resource.operationCode")}</summary><pre class="mt-2 max-h-56 overflow-auto rounded-[5px] border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] p-3 font-mono text-[11px] text-[color:var(--ent-text)]">{operation.gcode}</pre></details></Show>
          <For each={operation.warnings}>{(warning) => <p class="mt-2 text-[11px] text-[color:var(--ent-warn)]">{warning}</p>}</For>
        </li>}</For></ol>
      </Show>
    </div>
  </section>
}
