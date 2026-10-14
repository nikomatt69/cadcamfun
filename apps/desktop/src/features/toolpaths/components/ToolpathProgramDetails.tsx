import { For, Show, createMemo, type JSX } from "solid-js"
import { Schema } from "effect"
import { CamKernelArtifact, CamProgramDocument, type ToolpathRow } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { ResourceGeometryPreview, resourceElements } from "../../library/components/ResourceGeometryPreview.tsx"
import { t } from "../../../i18n/index.ts"

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const decode = <A,>(schema: Schema.Codec<A>, value: unknown): A | undefined => {
  const result = Schema.decodeUnknownOption(schema)(value)
  return result._tag === "Some" ? result.value : undefined
}

export function ToolpathProgramDetails(props: { readonly row: ToolpathRow; readonly drawing?: unknown }): JSX.Element {
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
  return <section class="space-y-5" data-testid="toolpath-program-details">
    <ResourceGeometryPreview elements={elements()} program={program()} origin={artifact()?.origin} />
    <Show when={!elements().length}><p class="text-sm text-gray-500">{t("cam.resource.noGeometry")}</p></Show>
    <dl class="grid grid-cols-2 gap-3 text-sm"><For each={summary()}>{(field) => <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><dt class="text-gray-500 dark:text-gray-400">{field.label}</dt><dd class="font-medium text-gray-900 dark:text-white">{String(field.value)}</dd></div>}</For></dl>
    <div>
      <h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">{t("cam.resource.operations", { count: operations().length })}</h3>
      <Show when={operations().length} fallback={<p class="text-sm text-gray-500">{t("cam.resource.noOperations")}</p>}>
        <ol class="space-y-3" data-testid="saved-operations"><For each={operations()}>{(operation, index) => <li class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="font-medium text-gray-900 dark:text-white">{index() + 1}. {operation.name}</h4>
          <dl class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
            <Show when={operation.strategy}><div><dt class="inline">{t("cam.resource.strategy")}: </dt><dd class="inline">{operation.strategy}</dd></div></Show>
            <div><dt class="inline">{t("cam.resource.tool")}: </dt><dd class="inline">{operation.tool}</dd></div>
            <div>{t("cam.resource.moves", { count: operation.moves })}</div>
          </dl>
          <Show when={Object.keys(operation.parameters).length}><details class="mt-3 text-sm"><summary class="cursor-pointer text-blue-600 dark:text-blue-400">{t("cam.resource.parameters")}</summary><pre class="mt-2 max-h-56 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(operation.parameters, null, 2)}</pre></details></Show>
          <Show when={operation.gcode}><details class="mt-2 text-sm"><summary class="cursor-pointer text-blue-600 dark:text-blue-400">{t("cam.resource.operationCode")}</summary><pre class="mt-2 max-h-56 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{operation.gcode}</pre></details></Show>
          <For each={operation.warnings}>{(warning) => <p class="mt-2 text-xs text-amber-600">{warning}</p>}</For>
        </li>}</For></ol>
      </Show>
    </div>
  </section>
}
