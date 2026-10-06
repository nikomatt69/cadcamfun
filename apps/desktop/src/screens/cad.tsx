import { For, Show, createEffect, createSignal, onMount, onCleanup } from "solid-js"
import { useParams, useSearchParams, A } from "@solidjs/router"
import { Schema } from "effect"
import { DrawingSchema, emptyDrawing } from "@cadcamfun/core"
import { Editor2D, View3D, type ViewPreset } from "../viewport/index.ts"
import { useApp } from "../state/context.ts"
import { t, type Key } from "../i18n/index.ts"
import { Menu, Save, Upload, Download, BookOpen, Undo2, Redo2, Wrench, Moon, Sun, Ruler, ChevronLeft, ChevronRight, ChevronDown, List, Layers, Settings, Puzzle, Bot, X, Magnet, Box, Aperture } from "lucide-solid"
import { CadButton, CadToolPalette } from "./cad-controls.tsx"
import { CadExplorer, CadLayers, CadProperties } from "./cad-panels.tsx"
import { CadFloatingToolbar } from "./cad-floating-toolbar.tsx"
import { CadViewSettings } from "./cad-view-settings.tsx"
import { Cad3DPrimitives } from "./cad-3d-primitives.tsx"
import { Cad3DViewportSettings, DEFAULT_VIEWPORT_SETTINGS, type ViewportSettings } from "./cad-3d-viewport.tsx"
import { CadSnapSettings, DEFAULT_SNAP_USER_SETTINGS, type SnapUserSettings } from "./cad-snap-settings.tsx"
import "./cad-workspace.css"

export function CadScreen() {
  const app = useApp()
  const params = useParams()
  const [search] = useSearchParams()
  const [drawingId, setDrawingId] = createSignal<string>()
  const [projectId, setProjectId] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [rightOpen, setRightOpen] = createSignal(true)
  const [leftTab, setLeftTab] = createSignal<"tools" | "explorer" | "layers" | "primitives">("explorer")
  const [rightTab, setRightTab] = createSignal<"properties" | "settings" | "viewport" | "snap" | "plugins">("properties")
  const [floating, setFloating] = createSignal(true)
  const [navigation, setNavigation] = createSignal(false)
  const [view, setView] = createSignal<"2d" | "3d">("3d")
  const [gridVisible, setGridVisible] = createSignal(true)
  const [axesVisible, setAxesVisible] = createSignal(true)
  const [origin, setOrigin] = createSignal({ x: 0, y: 0, z: 0 })
  const [stockSize, setStockSize] = createSignal({ x: 100, y: 200, z: 20 })
  const [stockVisible, setStockVisible] = createSignal(false)
  const [preset, setPreset] = createSignal<ViewPreset>("perspective")
  const [dialog, setDialog] = createSignal<"import" | "export">()
  const [source, setSource] = createSignal("")
  const [notice, setNotice] = createSignal<string>()
  const [viewport, setViewport] = createSignal<ViewportSettings>(DEFAULT_VIEWPORT_SETTINGS)
  const [snap, setSnap] = createSignal<SnapUserSettings>(DEFAULT_SNAP_USER_SETTINGS)
  let modal: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined
  const openDialog = (mode: "import" | "export") => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setSource(mode === "export" ? JSON.stringify(app.drawing(), null, 2) : "")
    setDialog(mode)
    queueMicrotask(() => modal?.querySelector<HTMLButtonElement>("button")?.focus())
  }
  const closeDialog = () => { setDialog(undefined); previousFocus?.focus() }
  const importDrawing = () => {
    try {
      const drawing = Schema.decodeUnknownSync(DrawingSchema)(JSON.parse(source()))
      app.editor.apply({ label: t("cad.importProject"), touched: drawing.entities.map(entity => entity.id), apply: () => ({ ...drawing, id: app.drawing().id }) })
      setNotice(t("cad.imported")); setError(undefined); closeDialog()
    } catch { setError(t("cad.invalidDrawing")) }
  }
  const exportDrawing = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(app.drawing(), null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${app.drawing().name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    closeDialog()
  }
  let generation = 0
  createEffect(() => {
    const project = params.id && !location.pathname.startsWith("/drawings") ? params.id : typeof search.projectId === "string" ? search.projectId : app.recents()[0]?.id
    const direct = location.pathname.startsWith("/drawings") ? params.id : undefined
    const current = ++generation
    setProjectId(project); setDrawingId(undefined); setError(undefined)
    if (!project && !direct) { setBusy(false); return }
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
      setNotice(t("cad.saved"))
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }
  onMount(() => {
    const key = (event: KeyboardEvent) => {
      if (dialog()) {
        if (event.key === "Escape") { event.preventDefault(); closeDialog() }
        if (event.key === "Tab" && modal) {
          const controls = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select,a[href]")]
          const first = controls[0], last = controls.at(-1)
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        return
      }
      if (event.target instanceof HTMLElement && (event.target.matches("input,textarea,select") || event.target.isContentEditable)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save() }
    }
    window.addEventListener("keydown", key)
    onCleanup(() => { generation++; window.removeEventListener("keydown", key) })
  })
  return <section class="cad-workspace" aria-label={t("cad.title")} style={{ position: "relative" }}>
    <header class="cad-toolbar cad-surface">
      <div class="cad-toolbar-group">
        <CadButton label={t("cad.toggleSidebar")} active={sidebarOpen()} onClick={() => setSidebarOpen(value => !value)}><Menu size={20} /></CadButton>
        <CadButton label={t("cad.saveProject")} disabled={!projectId() || busy()} onClick={() => void save()}><Save size={16} /></CadButton>
        <CadButton label={t("cad.importProject")} onClick={() => openDialog("import")}><Upload size={16} /></CadButton>
        <CadButton label={t("cad.exportProject")} onClick={() => openDialog("export")}><Download size={16} /></CadButton>
        <A class="cad-button" href="/library" title={t("cad.unifiedLibrary")} aria-label={t("cad.unifiedLibrary")}><BookOpen size={16} /></A>
        <span class="cad-divider" />
        <CadButton label={t("cad.undo")} disabled={!app.editor.canUndo()} onClick={() => app.editor.undo()}><Undo2 size={18} /></CadButton>
        <CadButton label={t("cad.redo")} disabled={!app.editor.canRedo()} onClick={() => app.editor.redo()}><Redo2 size={18} /></CadButton>
        <span class="cad-divider" />
        <CadButton label={t("cad.dimension")} active={app.tool() === "dimension"} onClick={() => app.setTool("dimension")}><Ruler size={16} /></CadButton>
        <CadButton label={t("cad.floatingToolbar")} active={floating()} onClick={() => setFloating(value => !value)}><Wrench size={16} /></CadButton>
        <CadButton label={t("cad.toggleTheme")} onClick={() => app.settings.update({ theme: app.settings.settings().theme === "dark" ? "light" : "dark" })}>{app.settings.settings().theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</CadButton>
        <A class="cad-button cad-cam-link" href={`/cam${projectId() ? `?projectId=${projectId()}` : ""}`} title={t("cad.switchCam")}><Wrench size={16} />{t("cad.cam")}</A>
      </div>
      <h1 class="cad-toolbar-title text-sm font-medium truncate">{app.drawing().name}</h1>
      <CadButton label={t("cad.elements", { count: app.drawing().entities.length })} onClick={() => { setSidebarOpen(true); setLeftTab("explorer") }}><span>{t("cad.elements", { count: app.drawing().entities.length })}</span><ChevronDown size={14} /></CadButton>
    </header>
    <Show when={!projectId()}><p class="cad-notice" role="status">{t("cad.chooseProject")}</p></Show>
    <Show when={error()}><p class="cad-error" role="alert">{error()}</p></Show>
    <div class="cad-body">
      <aside class="cad-sidebar cad-surface" classList={{ collapsed: !sidebarOpen() }} aria-label={t("cad.tools")}>
        <div class="cad-tabs" role="tablist" aria-label={t("cad.workspacePanels")}>
          <For each={["tools", "explorer", "layers", "primitives"] as const}>{tab => <button role="tab" title={t(`cad.${tab}`)} aria-label={t(`cad.${tab}`)} aria-selected={leftTab() === tab} onClick={() => setLeftTab(tab)}>{tab === "tools" ? <Wrench size={16} /> : tab === "explorer" ? <List size={16} /> : tab === "primitives" ? <Box size={16} /> : <Layers size={16} />}<Show when={sidebarOpen()}>{t(`cad.${tab}`)}</Show></button>}</For>
        </div>
        <div class="cad-sidebar-content" role="tabpanel">
          <Show when={sidebarOpen()} fallback={<div class="cad-empty"><button class="cad-button" onClick={() => setSidebarOpen(true)}><ChevronRight size={18} /></button><p>{t("cad.openSidebar")}</p></div>}>
            <Show when={leftTab() === "tools"}><div class="cad-card"><h3>{t("cad.drawingTools")}</h3><CadToolPalette /><h3 class="mt-5">{t("cad.modifyTools")}</h3><CadToolPalette modify /><div class="cad-divider" /><h3 class="mt-5">{t("cad.transform")}</h3><CadToolPalette transform /></div></Show>
            <Show when={leftTab() === "layers"}><CadLayers /></Show>
            <Show when={leftTab() === "explorer"}><CadExplorer /></Show>
            <Show when={leftTab() === "primitives"}><Cad3DPrimitives /></Show>
          </Show>
        </div>
        <div class="cad-sidebar-footer"><CadButton label={t("cad.quickNavigation")} onClick={() => { setNavigation(value => !value); setSidebarOpen(true) }}><Show when={sidebarOpen()}>{t("cad.quickNavigation")}</Show><ChevronDown size={14} /></CadButton><Show when={navigation() && sidebarOpen()}><nav class="cad-navigation"><A href="/projects">{t("cad.projects")}</A><A href="/cam">{t("cam.title")}</A><A href="/library">{t("cad.library")}</A><A href="/settings">{t("cad.settings")}</A></nav></Show></div>
        <div class="cad-sidebar-footer"><CadButton label={sidebarOpen() ? t("cad.collapse") : t("cad.expand")} onClick={() => setSidebarOpen(value => !value)}>{sidebarOpen() ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</CadButton></div>
      </aside>
      <div class="cad-canvas cad-surface">
         <div class="cad-viewport"><Show when={view() === "2d"} fallback={<View3D drawing={app.drawing()} solids={app.editor.solids()} preset={preset()} onPresetChange={setPreset} gridVisible={gridVisible()} axesVisible={axesVisible()} origin={origin()} stock={stockVisible() ? { origin: origin(), size: stockSize() } : undefined} lighting={{ ambient: viewport().ambient, directional: viewport().directional, hemisphere: viewport().hemisphere }} material={viewport().material} section={viewport().section} />}><Editor2D drawing={app.drawing()} selectedTool={app.tool()} onChange={drawing => app.editor.apply({ label: t("cad.edit"), touched: drawing.entities.map(entity => entity.id), apply: () => drawing })} /></Show></div>
        <div class="cad-view-switch"><CadButton label={t("cad.view2d")} active={view() === "2d"} onClick={() => setView("2d")}>{t("cad.2d")}</CadButton><CadButton label={t("cad.view3d")} active={view() === "3d"} onClick={() => setView("3d")}>{t("cad.3d")}</CadButton></div>
        <Show when={floating()}><CadFloatingToolbar onClose={() => setFloating(false)} /></Show>
        <CadButton class="cad-assistant" label={t("cad.openAssistant")} active={app.panelOpen()} onClick={() => app.setPanelOpen(!app.panelOpen())}><Bot size={20} /></CadButton>
      </div>
      <Show when={rightOpen()}><aside class="cad-right cad-surface" aria-label={t("cad.properties")}>
        <div class="cad-tabs" role="tablist" aria-label={t("cad.properties")}><For each={["properties", "settings", "viewport", "snap", "plugins"] as const}>{tab => <button role="tab" title={t(`cad.${tab}`)} aria-label={t(`cad.${tab}`)} aria-selected={rightTab() === tab} onClick={() => setRightTab(tab)}>{tab === "properties" ? <Wrench size={16} /> : tab === "settings" ? <Settings size={16} /> : tab === "viewport" ? <Aperture size={16} /> : tab === "snap" ? <Magnet size={16} /> : <Puzzle size={16} />}<Show when={tab !== "plugins"}>{t(`cad.${tab}`)}</Show></button>}</For></div>
        <div class="p-2" role="tabpanel"><Show when={rightTab() === "properties"}><CadProperties /></Show>
           <Show when={rightTab() === "settings"}><CadViewSettings view={view()} onView={setView} grid={gridVisible()} onGrid={() => setGridVisible(value => !value)} axes={axesVisible()} onAxes={() => setAxesVisible(value => !value)} origin={origin()} onOrigin={setOrigin} stock={stockSize()} onStock={setStockSize} stockVisible={stockVisible()} onStockVisible={() => setStockVisible(value => !value)} /></Show>
          <Show when={rightTab() === "viewport"}><Cad3DViewportSettings settings={viewport()} onSettings={setViewport} /></Show>
          <Show when={rightTab() === "snap"}><CadSnapSettings settings={snap()} onSettings={setSnap} /></Show>
          <Show when={rightTab() === "plugins"}><div class="cad-empty"><Puzzle size={28} /><p>{t("cad.pluginSidebarGap")}</p><A class="cad-button" href="/plugins">{t("cad.managePlugins")}</A></div></Show>
        </div>
      </aside></Show>
      <CadButton class="cad-right-toggle" label={t("cad.toggleProperties")} onClick={() => setRightOpen(value => !value)}>{rightOpen() ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</CadButton>
    </div>
    <footer class="cad-status"><div class="cad-status-group"><span>{t("cad.mode")} <span class="cad-badge">{view() === "2d" ? t("cad.xy") : t("cad.3d")}</span></span><span>{t("cad.toolLabel")} {t(`cad.${app.tool()}` as Key)}</span><span>{t("cad.units")} <span class="text-orange-300">{app.settings.settings().units}</span></span></div><div class="cad-status-group"><span>{t("cad.elements", { count: app.drawing().entities.length })}</span><span>{t("cad.selected", { count: app.editor.selection().length })}</span><span role="status" aria-live="polite">{busy() ? t("cad.loading") : notice() ?? t("cad.ready")}</span></div></footer>
    <Show when={dialog()}><div class="cad-modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeDialog() }}><div ref={modal} role="dialog" aria-modal="true" aria-label={dialog() === "import" ? t("cad.importProject") : t("cad.exportProject")} class="cad-modal cad-surface"><div class="cad-panel-heading"><h2>{dialog() === "import" ? t("cad.importProject") : t("cad.exportProject")}</h2><CadButton label={t("common.close")} onClick={closeDialog}><X size={18} /></CadButton></div><p class="cad-hint">{t("cad.jsonFormat")}</p><Show when={dialog() === "import"}><label class="cad-field"><span>{t("cad.chooseFile")}</span><input type="file" accept=".json,application/json" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void file.text().then(setSource).catch(cause => setError(String(cause))) }} /></label></Show><textarea aria-label={t("cad.drawingData")} value={source()} readOnly={dialog() === "export"} onInput={event => setSource(event.currentTarget.value)} /><div class="cad-actions mt-4"><button class="cad-primary" disabled={dialog() === "import" && !source().trim()} onClick={() => dialog() === "import" ? importDrawing() : exportDrawing()}>{dialog() === "import" ? t("cad.importProject") : t("cad.download")}</button><button class="cad-button" onClick={closeDialog}>{t("common.cancel")}</button></div><Show when={error()}><p class="cad-error" role="alert">{error()}</p></Show></div></div></Show>
  </section>
}
