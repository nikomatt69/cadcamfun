/**
 * Reference-aligned library detail pages (`src/pages/{tools,materials,machine}/[id].tsx`).
 * Renders the same view/edit/delete flow as `.reference` for tools, materials and
 * machine configs using the typed API client.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { ArrowLeft, Cpu, Layers, Package, Trash2 } from "lucide-solid"
import { Effect } from "effect"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { ErrorState, LoadingState, ScreenHeader, Toast } from "./screen-parts.tsx"
import { t, type Key } from "../i18n/index.ts"

type Kind = "tools" | "materials" | "machines"

interface DetailProps {
  readonly kind: Kind
  readonly icon: typeof Package
}

const headerText = (kind: Kind): { readonly titleKey: Key; readonly subtitleKey: Key } => {
  if (kind === "tools") return { titleKey: "library.detail.tool.title", subtitleKey: "library.detail.tool.subtitle" }
  if (kind === "materials") return { titleKey: "library.detail.material.title", subtitleKey: "library.detail.material.subtitle" }
  return { titleKey: "library.detail.machine.title", subtitleKey: "library.detail.machine.subtitle" }
}

const fieldLabels: Record<string, Key> = {
  name: "library.field.name",
  type: "library.field.type",
  material: "library.field.material",
  diameter: "library.field.diameter",
  numberOfFlutes: "library.field.flutes",
  maxRPM: "library.field.maxRpm",
  density: "library.field.density",
  costPerUnit: "library.field.cost",
  workVolume: "library.field.workVolume",
  controller: "library.field.controller"
}

const renderRow = (key: string, value: unknown): JSX.Element | null => {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "object") {
    return <div class="library-detail-row">
      <dt>{fieldLabels[key] ? t(fieldLabels[key]!) : key}</dt>
      <dd><pre class="library-detail-json">{JSON.stringify(value, null, 2)}</pre></dd>
    </div>
  }
  return <div class="library-detail-row">
    <dt>{fieldLabels[key] ? t(fieldLabels[key]!) : key}</dt>
    <dd>{String(value)}</dd>
  </div>
}

export function LibraryDetailScreen(props: DetailProps): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [pending, setPending] = createSignal(false)
  const [notice, setNotice] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [confirming, setConfirming] = createSignal(false)
  const data = useRead((c) => {
  const effect = props.kind === "tools"
    ? c.tools.get({ params: { id: params.id } })
    : props.kind === "materials"
      ? c.materials.get({ params: { id: params.id } })
      : c.machineConfigs.get({ params: { id: params.id } })
  return effect as unknown as Effect.Effect<unknown, unknown>
})
  const text = () => {
    const row = data.data()
    if (!row) return ""
    return JSON.stringify(row, null, 2)
  }
  const remove = async () => {
    if (pending() || !params.id) return
    setPending(true); setError(undefined)
    try {
      if (props.kind === "tools") await app.runtime.run(Effect.asVoid(app.client.tools.remove({ params: { id: params.id } })))
      else if (props.kind === "materials") await app.runtime.run(Effect.asVoid(app.client.materials.remove({ params: { id: params.id } })))
      else await app.runtime.run(Effect.asVoid(app.client.machineConfigs.remove({ params: { id: params.id } })))
      setNotice(t("library.detail.removed"))
      navigate(props.kind === "tools" ? "/tools" : props.kind === "materials" ? "/materials" : "/machine")
    } catch (cause) { setError(String(cause)) }
    finally { setPending(false); setConfirming(false) }
  }
  const labels = headerText(props.kind)
  const Icon = props.icon
  return <section>
    <ScreenHeader title={t(labels.titleKey)} subtitle={t(labels.subtitleKey)} actions={
      <A class="btn btn-outline" href={props.kind === "tools" ? "/tools" : props.kind === "materials" ? "/materials" : "/machine"}>
        <ArrowLeft size={16} aria-hidden="true" />{t("common.back")}
      </A>
    } />
    <div class="grid gap-4 p-5">
      <Toast message={notice()} />
      <Show when={data.loading() && !data.data()}><LoadingState label={t("common.loading")} /></Show>
      <Show when={data.error()}><ErrorState label={t("common.error")} detail={data.error() as unknown as string} /></Show>
      <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
      <Show when={data.data()}>{(row) => {
          const item = row() as Record<string, unknown>
          return <article class="card grid gap-4 p-5">
            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300"><Icon size={20} aria-hidden="true" /><span class="font-mono text-xs">{String(item["id"] ?? "")}</span></div>
            <h2 class="text-xl font-semibold">{String(item["name"] ?? t("library.unnamed"))}</h2>
            <dl class="library-detail">
              <For each={Object.entries(item)}>{([key, value]) => renderRow(key, value)}</For>
            </dl>
            <div class="flex flex-wrap gap-2">
              <button class="btn btn-outline" type="button" disabled={pending()} onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />{t("common.delete")}
              </button>
            </div>
            <details class="library-detail-raw">
              <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-300">{t("library.detail.raw")}</summary>
              <pre class="library-detail-json mt-2">{text()}</pre>
            </details>
          </article>
        }}
      </Show>
      <Show when={confirming()}>
        <div role="alertdialog" aria-label={t("library.detail.confirmDelete")} class="card p-4">
          <p>{t("library.detail.confirmDelete")}</p>
          <button class="btn btn-danger" disabled={pending()} onClick={() => void remove()}>{t("common.delete")}</button>
          <button class="btn btn-outline" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
        </div>
      </Show>
    </div>
  </section>
}

export function ToolDetailScreen(): JSX.Element { return <LibraryDetailScreen kind="tools" icon={Package} /> }
export function MaterialDetailScreen(): JSX.Element { return <LibraryDetailScreen kind="materials" icon={Layers} /> }
export function MachineDetailScreen(): JSX.Element { return <LibraryDetailScreen kind="machines" icon={Cpu} /> }