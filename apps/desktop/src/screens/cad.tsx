import { For, Show, createEffect, createSignal } from "solid-js"
import { useParams, useSearchParams, A } from "@solidjs/router"
import { Schema } from "effect"
import { DrawingSchema, emptyDrawing } from "@cadcamfun/core"
import { Editor2D, AVAILABLE_TOOLS } from "../viewport/index.ts"
import { useApp } from "../state/context.ts"
import { t, type Key } from "../i18n/index.ts"

export function CadScreen() {
  const app = useApp()
  const params = useParams()
  const [search] = useSearchParams()
  const [drawingId, setDrawingId] = createSignal<string>()
  const [projectId, setProjectId] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  let generation = 0
  createEffect(() => {
    const project = params.id && !location.pathname.startsWith("/drawings") ? params.id : typeof search.projectId === "string" ? search.projectId : app.recents()[0]?.id
    const direct = location.pathname.startsWith("/drawings") ? params.id : undefined
    const current = ++generation
    setProjectId(project); setDrawingId(undefined); setError(undefined)
    if (!project && !direct) return
    setBusy(true)
    void (async () => {
      const row = direct ? await app.runtime.run(app.client.drawings.get({ params: { id: direct } })) : (await app.runtime.run(app.client.drawings.listForProject({ params: { id: project ?? "" } })))[0]
      if (current !== generation) return
      if (row) {
        setProjectId(row.projectId); setDrawingId(row.id)
        const drawing = row.data === null ? emptyDrawing(row.id, row.name) : Schema.decodeUnknownSync(DrawingSchema)(row.data)
        app.editor.load(drawing)
      } else app.editor.load(emptyDrawing(crypto.randomUUID(), t("cad.title")))
    })().catch((cause) => { if (current === generation) setError(String(cause)) }).finally(() => { if (current === generation) setBusy(false) })
  })
  const save = async () => {
    const project = projectId()
    if (!project || busy()) return
    setBusy(true); setError(undefined)
    const drawing = app.drawing()
    try {
      const id = drawingId()
      const row = await app.runtime.run(id
        ? app.client.drawings.update({ params: { id }, payload: { name: drawing.name, data: drawing } })
        : app.client.drawings.createForProject({ params: { id: project }, payload: { name: drawing.name, data: drawing } }))
      setDrawingId(row.id)
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }
  return <section class="flex h-full flex-col">
    <header class="flex flex-wrap items-center gap-2 border-b p-3">
      <h1 class="mr-auto font-semibold">{app.drawing().name}</h1>
      <button class="btn btn-outline" disabled={!app.editor.canUndo()} onClick={() => app.editor.undo()}>{t("cad.undo")}</button>
      <button class="btn btn-outline" disabled={!app.editor.canRedo()} onClick={() => app.editor.redo()}>{t("cad.redo")}</button>
      <button class="btn btn-primary" disabled={!projectId() || busy()} onClick={() => void save()}>{t("common.save")}</button>
      <A class="btn btn-outline" href={`/cam${projectId() ? `?projectId=${projectId()}` : ""}`}>{t("cam.title")}</A>
    </header>
    <Show when={!projectId()}><p class="p-3" role="status">{t("cad.chooseProject")}</p></Show>
    <Show when={error()}><p class="p-3 text-red-600" role="alert">{error()}</p></Show>
    <div class="flex min-h-0 flex-1">
      <aside class="flex w-36 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2" aria-label={t("cad.tools")}>
        <For each={AVAILABLE_TOOLS}>{(tool) => <button class="btn btn-outline text-left" aria-pressed={app.tool() === tool} onClick={() => app.setTool(tool as ReturnType<typeof app.tool>)}>{t(`cad.${tool}` as Key)}</button>}</For>
      </aside>
      <div class="min-w-0 flex-1"><Editor2D drawing={app.drawing()} selectedTool={app.tool()} onChange={(drawing) => app.editor.apply({ label: t("cad.edit"), touched: drawing.entities.map((entity) => entity.id), apply: () => drawing })} /></div>
      <aside class="hidden w-44 border-l p-3 lg:block"><h2>{t("cad.layers")}</h2><For each={app.drawing().layers}>{(layer) => <p class="py-2 text-sm">{layer.name}</p>}</For><p>{t("cad.entities", { count: app.drawing().entities.length })}</p></aside>
    </div>
  </section>
}
