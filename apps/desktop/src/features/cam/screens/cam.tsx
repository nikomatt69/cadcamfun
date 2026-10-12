import { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js"
import { A, useSearchParams } from "@solidjs/router"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { SchemaForm } from "../../../shared/components/schema-form.tsx"
import { defaultsOf } from "../../../shared/components/schema-form.ts"
import { View3D } from "../../../viewport/index.ts"
import { buildPlayback } from "../../../viewport/view3d/playback.ts"
import { programUnitsOf } from "../../../viewport/units.ts"
import { t, type Key } from "../../../i18n/index.ts"
import { CadButton } from "../../cad/screens/cad-controls.tsx"
import {
  Menu,
  Save,
  Upload,
  Download,
  Box,
  Settings,
  List,
  Wrench,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  Eye,
  Code,
  Wrench as Tool,
  BookOpen,
  DollarSign,
  Zap,
  Brain,
  X
} from "lucide-solid"
import "../../cad/styles/cad-workspace.css"

type LeftTab = "workpiece" | "operations" | "explorer" | "settings"
type RightTab = "generator" | "cycles"
type MainTab = "preview" | "editor" | "toolpath" | "postTab"

const LEFT_TABS: readonly LeftTab[] = ["workpiece", "operations", "explorer", "settings"]
const RIGHT_TABS: readonly RightTab[] = ["generator", "cycles"]
const MAIN_TABS: readonly MainTab[] = ["preview", "editor", "toolpath", "postTab"]

export function CamScreen() {
  const app = useApp()
  const [search] = useSearchParams()
  const projectId = () =>
    typeof search.projectId === "string" ? search.projectId : app.recents()[0]?.id
  const tools = useRead((client) => client.tools.list({ query: {} }))
  const operations = useRead((client) =>
    client.toolpaths.list({ query: { projectId: projectId() } })
  )
  const materials = useRead((client) => client.materials.list({ query: {} }))

  // Toolbar / chrome state
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [rightOpen, setRightOpen] = createSignal(true)
  const [navigation, setNavigation] = createSignal(false)
  const [leftTab, setLeftTab] = createSignal<LeftTab>("workpiece")
  const [rightTab, setRightTab] = createSignal<RightTab>("generator")

  // Toolpath state (preserved)
  const [toolId, setToolId] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const [gcode, setGcode] = createSignal("")
  const [program, setProgram] = createSignal<cam.Program>()
  const [playing, setPlaying] = createSignal(false)
  const [time, setTime] = createSignal(0)
  const [tab, setTab] = createSignal<MainTab>("editor")
  const [operation, setOperation] = createSignal<"profile" | "pocket" | "engrave">("profile")
  const [selected, setSelected] = createSignal<string>()
  const [deleting, setDeleting] = createSignal(false)
  const [notice, setNotice] = createSignal<string>()
  const [stock, setStock] = createSignal({ x: 300, y: 180, z: 10 })
  const [material, setMaterial] = createSignal("")
  const [postId, setPostId] = createSignal(app.settings.settings().postProcessor)

  const duration = createMemo(() => {
    const next = program()
    return next ? buildPlayback(next).duration : 0
  })
  const defaults = defaultsOf(new cam.ProfileParams({ totalDepth: 3, stepdown: 1 }), cam.ProfileParams)
  const selectedTool = createMemo(
    () => tools.data()?.find((tool) => tool.id === toolId()) ?? tools.data()?.[0]
  )

  createEffect(() => {
    projectId()
    void operations.refetch()
  })
  createEffect(() => {
    if (duration() > 0 && time() >= duration()) setPlaying(false)
  })

  const generate = async (
    params: cam.ProfileParams | cam.PocketParams | cam.EngraveParams
  ) => {
    if (pending()) return
    setError(undefined)
    setPending(true)
    try {
      const project = projectId()
      if (!project) throw new Error(t("cam.noProject"))
      if (!app.drawing().entities.length) throw new Error(t("cam.noGeometry"))
      const row = selectedTool()
      if (!row) throw new Error(t("library.empty.tools"))
      const tool = Schema.decodeUnknownSync(cam.ToolSchema)({
        id: row.id,
        name: row.name,
        kind: row.type,
        diameter: row.diameter,
        flutes: row.numberOfFlutes ?? 2,
        maxRpm: row.maxRPM ?? 18000
      })
      if (
        Object.values(stock()).some((value) => !Number.isFinite(value) || value <= 0) ||
        params.totalDepth > stock().z
      )
        throw new Error(t("cam.stockInvalid"))
      const workpiece = { ...stock(), origin: { x: 0, y: 0, z: 0 }, material: material() }
      const path =
        operation() === "pocket"
          ? cam.generatePocket(
              Schema.decodeUnknownSync(cam.PocketParams)(params),
              app.drawing().entities,
              tool,
              workpiece
            )
          : operation() === "engrave"
            ? cam.generateEngrave(
                Schema.decodeUnknownSync(cam.EngraveParams)(params),
                app.drawing().entities,
                tool,
                workpiece
              )
            : cam.generateProfile(
                Schema.decodeUnknownSync(cam.ProfileParams)(params),
                app.drawing().entities,
                tool,
                workpiece
              )
      if (!path.moves.some((move) => move._tag === "Linear" || move._tag === "Arc"))
        throw new Error(t("cam.noGeometry"))
      const next = cam.makeProgram(params.name, [path], { units: programUnitsOf(app.settings.settings().units) })
      const controller = postId()
      const post =
        controller === "gcode"
          ? cam.getPost("generic")
          : controller === "grbl" || controller === "fanuc"
            ? cam.getPost(controller)
            : undefined
      if (!post) throw new Error(t("cam.postUnavailable"))
      const code = post.emit(next, { decimals: app.settings.settings().decimals })
      const saved = await app.runtime.run(
        app.client.toolpaths.create({
          payload: {
            name: params.name,
            projectId: project,
            operationType: operation(),
            type: "mill",
            toolId: row.id,
            data: next,
            gcode: code
          }
        })
      )
      setSelected(saved.id)
      setProgram(next)
      setGcode(code)
      setTime(0)
      setPlaying(false)
      setNotice(t("cam.saved"))
      setTab("toolpath")
      await operations.refetch()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setPending(false)
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([gcode()], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "toolpath.nc"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const process = () => {
    const next = program()
    if (!next) return
    try {
      const controller = postId()
      const post =
        controller === "gcode"
          ? cam.getPost("generic")
          : controller === "grbl" || controller === "fanuc"
            ? cam.getPost(controller)
            : undefined
      if (!post) throw new Error(t("cam.postUnavailable"))
      setGcode(post.emit(next, { decimals: app.settings.settings().decimals }))
      setError(undefined)
    } catch (cause) {
      setError(String(cause))
    }
  }

  const saveCode = async () => {
    const id = selected()
    if (!id || pending()) return
    setPending(true)
    setError(undefined)
    try {
      await app.runtime.run(
        app.client.toolpaths.update({ params: { id }, payload: { gcode: gcode() } })
      )
      await operations.refetch()
      setNotice(t("cam.saved"))
    } catch (cause) {
      setError(String(cause))
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    const id = selected()
    if (!id || pending()) return
    setPending(true)
    setError(undefined)
    try {
      await app.runtime.run(app.client.toolpaths.remove({ params: { id } }))
      setSelected(undefined)
      setProgram(undefined)
      setGcode("")
      setPlaying(false)
      setDeleting(false)
      await operations.refetch()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setPending(false)
    }
  }

  const importCode = async (file: File | undefined) => {
    if (!file) return
    try {
      setGcode(await file.text())
      setProgram(undefined)
      setSelected(undefined)
      setPlaying(false)
      setTime(0)
      setTab("editor")
      setError(undefined)
      setNotice(t("cam.importHint"))
    } catch (cause) {
      setError(String(cause))
    }
  }

  const selectOperation = (row: { id: string; gcode?: string | null; name: string; operationType: string | null; data: unknown }) => {
    setSelected(row.id)
    setGcode(row.gcode ?? "")
    setError(undefined)
    setNotice("")
    setPlaying(false)
    setTime(0)
    try {
      setProgram(Schema.decodeUnknownSync(cam.ProgramSchema)(row.data))
    } catch {
      setProgram(undefined)
      setNotice(t("cam.importHint"))
    }
  }

  onMount(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches("input,textarea,select") || event.target.isContentEditable)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void saveCode()
      }
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => window.removeEventListener("keydown", handler))
  })

  const showPreview = () => tab() === "preview" || tab() === "toolpath"

  return (
    <section class="cad-workspace cam-workspace" aria-label={t("cam.title")} style={{ position: "relative" }}>
      <header class="cad-toolbar cad-surface">
        <div class="cad-toolbar-group">
          <CadButton
            label={t("cam.toggleSidebar")}
            active={sidebarOpen()}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <Menu size={20} />
          </CadButton>
          <CadButton
            label={t("cam.saveProject")}
            disabled={!selected() || pending()}
            onClick={() => void saveCode()}
          >
            <Save size={16} />
          </CadButton>
          <CadButton
            label={t("cam.export")}
            disabled={!gcode()}
            onClick={download}
          >
            <Download size={16} />
          </CadButton>
          <label class="cad-button" title={t("cam.import")} aria-label={t("cam.import")}>
            <Upload size={16} />
            <input
              type="file"
              class="sr-only"
              accept=".nc,.gcode,.cnc,.txt"
              onChange={(e) => {
                void importCode(e.currentTarget.files?.[0])
                e.currentTarget.value = ""
              }}
            />
          </label>
          <CadButton
            label={playing() ? t("cam.pause") : t("cam.play")}
            active={playing()}
            disabled={!program()}
            onClick={() => {
              if (!playing() && time() >= duration()) setTime(0)
              setPlaying(!playing())
              setTab("toolpath")
            }}
          >
            <Show when={playing()} fallback={<Play size={16} />}>
              <Pause size={16} />
            </Show>
          </CadButton>
          <A
            class="cad-button cad-cam-link"
            href={`/cad${projectId() ? `?projectId=${encodeURIComponent(projectId()!)}` : ""}`}
            title={t("cam.switchCad")}
            aria-label={t("cam.switchCad")}
          >
            <Wrench size={16} />{t("cam.edit")}
          </A>
          <A class="cad-button" href="/library" title={t("library.title")} aria-label={t("library.title")}>
            <BookOpen size={16} />
          </A>
          <A class="cad-button" href="/costs" title={t("costs.title")} aria-label={t("costs.title")}>
            <DollarSign size={16} />
          </A>
          {/* The reference CAM toolbar's "Toggle AI Copilot": opens the docked AI panel. */}
          <button
            type="button"
            class="cad-button"
            aria-label={t("ai.copilot.toggle")}
            title={app.panelOpen() ? t("ai.copilot.disable") : t("ai.copilot.enable")}
            aria-pressed={app.panelOpen()}
            onClick={() => app.setPanelOpen(!app.panelOpen())}
          >
            <Show when={app.panelOpen()} fallback={<Zap size={16} />}>
              <Brain size={16} />
            </Show>
          </button>
          <span class="cad-divider" />
          <CadButton label={t("cam.toggleTheme")} onClick={() => app.settings.update({ theme: app.settings.settings().theme === "dark" ? "light" : "dark" })}>
            <Show when={app.settings.settings().theme === "dark"} fallback={<Moon size={16} />}>
              <Sun size={16} />
            </Show>
          </CadButton>
        </div>
        <h1 class="cad-toolbar-title text-sm font-medium truncate">{app.drawing().name}</h1>
        <CadButton
          label={t("cam.title")}
          onClick={() => {
            setSidebarOpen(true)
            setLeftTab("operations")
          }}
        >
          <span>{t("cam.title")}</span>
          <ChevronDown size={14} />
        </CadButton>
      </header>

      <Show when={!projectId()}>
        <p class="cad-notice" role="status">{t("cam.noProject")}</p>
      </Show>
      <Show when={error()}>
        <p class="cad-error" role="alert">{error()}</p>
      </Show>

      <div class="cad-body">
        <aside
          class="cad-sidebar cad-surface"
          classList={{ collapsed: !sidebarOpen() }}
          aria-label={t("cam.workspacePanels")}
        >
          <div class="cad-tabs" role="tablist" aria-label={t("cam.workspacePanels")}>
            <For each={LEFT_TABS}>
              {(tabKey) => (
                <button
                  role="tab"
                  title={t(`cam.${tabKey}` as Key)}
                  aria-label={t(`cam.${tabKey}` as Key)}
                  aria-selected={leftTab() === tabKey}
                  onClick={() => setLeftTab(tabKey)}
                >
                  {tabKey === "workpiece" ? <Box size={16} /> : tabKey === "operations" ? <Tool size={16} /> : tabKey === "explorer" ? <List size={16} /> : <Settings size={16} />}
                  <Show when={sidebarOpen()}>{t(`cam.${tabKey}` as Key)}</Show>
                </button>
              )}
            </For>
          </div>
          <div class="cad-sidebar-content" role="tabpanel">
            <Show
              when={sidebarOpen()}
              fallback={
                <div class="cad-empty">
                  <button class="cad-button" aria-label={t("cam.expand")} onClick={() => setSidebarOpen(true)}>
                    <ChevronRight size={18} />
                  </button>
                  <p>{t("cam.expand")}</p>
                </div>
              }
            >
              <Show when={leftTab() === "workpiece"}>
                <div class="cad-card">
                  <h3>{t("cam.workpiece")}</h3>
                  <div class="cad-field-row">
                    <For each={["x", "y", "z"] as const}>
                      {(axis) => (
                        <label class="cad-field">
                          <span>{t(axis === "x" ? "cam.stockX" : axis === "y" ? "cam.stockY" : "cam.stockZ")}</span>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={stock()[axis]}
                            onInput={(e) => setStock({ ...stock(), [axis]: e.currentTarget.valueAsNumber })}
                          />
                        </label>
                      )}
                    </For>
                  </div>
                  <label class="cad-field">
                    <span>{t("cam.material")}</span>
                    <select class="form-select" value={material()} onChange={(e) => setMaterial(e.currentTarget.value)}>
                      <option value="">{t("common.none")}</option>
                      <For each={materials.data()}>
                        {(row) => <option value={row.name}>{row.name}</option>}
                      </For>
                    </select>
                  </label>
                  <p class="cad-hint">{t("cam.unitsNotice")}</p>
                </div>
              </Show>
              <Show when={leftTab() === "operations"}>
                <div class="cad-card">
                  <h3>{t("cam.operationsPanel")}</h3>
                  <Show when={operations.loading()}>
                    <p role="status">{t("common.loading")}</p>
                  </Show>
                  <Show when={!operations.loading() && !operations.data()?.length}>
                    <p class="text-sm text-gray-500">{t("cam.emptyOperations")}</p>
                  </Show>
                  <ul class="cad-solid-list">
                    <For each={operations.data()}>
                      {(row) => (
                        <li
                          class="cad-solid-row"
                          classList={{ selected: selected() === row.id }}
                        >
                          <button
                            type="button"
                            class="cad-solid-name"
                            onClick={() => selectOperation(row)}
                            aria-pressed={selected() === row.id}
                          >
                            <Tool size={14} />
                            <span>{row.name}</span>
                            <small>{row.operationType}</small>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <button
                    class="cad-primary"
                    disabled={!selected() || pending()}
                    onClick={() => setDeleting(true)}
                  >
                    {t("cam.deleteOperation")}
                  </button>
                </div>
              </Show>
              <Show when={leftTab() === "explorer"}>
                <div class="cad-card">
                  <h3>{t("cam.explorer")}</h3>
                  <ul class="cad-solid-list">
                    <For each={app.drawing().entities}>
                      {(entity) => (
                        <li class="cad-solid-row" classList={{ selected: app.editor.selection().includes(entity.id) }}>
                          <button
                            type="button"
                            class="cad-solid-name"
                            aria-pressed={app.editor.selection().includes(entity.id)}
                            onClick={() => app.editor.setSelection([entity.id])}
                          >
                            <Box size={14} />
                            <span>{entity._tag}</span>
                            <small>{entity.id.slice(0, 6)}</small>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>
              <Show when={leftTab() === "settings"}>
                <div class="cad-card">
                  <h3>{t("cam.settings")}</h3>
                  <label class="cad-field">
                    <span>{t("cam.controller")}</span>
                    <select
                      class="form-select"
                      value={postId()}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        if (value === "grbl" || value === "fanuc" || value === "gcode") setPostId(value)
                      }}
                    >
                      <option value="grbl">GRBL</option>
                      <option value="fanuc">Fanuc</option>
                      <option value="gcode">{t("settings.generic")}</option>
                    </select>
                  </label>
                  <label class="cad-field">
                    <span>{t("cam.operation")}</span>
                    <select
                      class="form-select"
                      value={operation()}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        if (value === "profile" || value === "pocket" || value === "engrave") setOperation(value)
                      }}
                    >
                      <For each={["profile", "pocket", "engrave"] as const}>
                        {(item) => <option value={item}>{t(`cam.${item}`)}</option>}
                      </For>
                    </select>
                  </label>
                </div>
              </Show>
            </Show>
          </div>
          <div class="cad-sidebar-footer">
            <CadButton
              label={t("cad.quickNavigation")}
              onClick={() => {
                setNavigation((value) => !value)
                setSidebarOpen(true)
              }}
            >
              <Show when={sidebarOpen()}>{t("cad.quickNavigation")}</Show>
              <ChevronDown size={14} />
            </CadButton>
            <Show when={navigation() && sidebarOpen()}>
              <nav class="cad-navigation">
                <A href="/projects">{t("cad.projects")}</A>
                <A href="/cad">{t("cad.title")}</A>
                <A href="/library">{t("cad.library")}</A>
                <A href="/settings">{t("cad.settings")}</A>
              </nav>
            </Show>
          </div>
          <div class="cad-sidebar-footer">
            <CadButton
              label={sidebarOpen() ? t("cam.collapse") : t("cam.expand")}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              <Show when={sidebarOpen()} fallback={<ChevronRight size={20} />}>
                <ChevronLeft size={20} />
              </Show>
            </CadButton>
          </div>
        </aside>

        <div class="cad-canvas cad-surface">
          <div class="cad-viewport">
            <Show
              when={showPreview()}
              fallback={
                <div class="cam-gcode-area">
                  <Show when={tab() === "postTab"}>
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#F8FBFF] p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h2 class="text-lg font-medium">{t("cam.postTab")}</h2>
                      <button class="btn btn-primary" disabled={!program()} onClick={process}>
                        {t("cam.process")}
                      </button>
                    </div>
                  </Show>
                  <div class="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
                    <h2 class="font-medium">{t("cam.editor")}</h2>
                    <span class="text-xs text-gray-500">
                      {t("cam.lines", { count: gcode() ? gcode().split("\n").length : 0 })}
                    </span>
                  </div>
                  <textarea
                    aria-label={t("cam.editor")}
                    class="cam-gcode-textarea"
                    spellcheck={false}
                    value={gcode()}
                    onInput={(e) => {
                      setGcode(e.currentTarget.value)
                      setProgram(undefined)
                      setPlaying(false)
                      setNotice(t("cam.importHint"))
                    }}
                  />
                  <div class="cam-gcode-actions">
                    <button class="cad-primary" disabled={!selected() || pending()} onClick={() => void saveCode()}>
                      {t("cam.saveCode")}
                    </button>
                    <button class="cad-button" disabled={!gcode()} onClick={download}>
                      {t("cam.export")}
                    </button>
                  </div>
                </div>
              }
            >
              <View3D
                drawing={app.drawing()}
                stock={{ origin: { x: 0, y: 0, z: -stock().z }, size: stock() }}
                preset={tab() === "preview" ? "top" : "perspective"}
                program={program()}
                playing={playing()}
                playbackTime={time()}
                onPlaybackTimeChange={setTime}
              />
              <Show when={!program()}>
                <p class="cad-empty">{t("cam.previewEmpty")}</p>
              </Show>
              <div class="cad-scrub">
                <CadButton label={t("cam.reset")} disabled={!program()} onClick={() => { setTime(0); setPlaying(false) }}>
                  <ChevronLeft size={14} />
                </CadButton>
                <input
                  class="cad-scrub-range"
                  type="range"
                  min="0"
                  max={duration()}
                  step="0.01"
                  disabled={!program()}
                  value={time()}
                  aria-label={t("cam.scrub")}
                  onInput={(e) => {
                    setPlaying(false)
                    setTime(e.currentTarget.valueAsNumber)
                  }}
                />
                <span class="text-xs tabular-nums">
                  {time().toFixed(1)} / {duration().toFixed(1)} s
                </span>
              </div>
            </Show>
          </div>
          <nav class="cad-tabs cad-main-tabs" role="tablist" aria-label={t("cam.title")}>
            <For each={MAIN_TABS}>
              {(item) => (
                <button
                  role="tab"
                  title={t(`cam.${item}`)}
                  aria-label={t(`cam.${item}`)}
                  aria-selected={tab() === item}
                  onClick={() => setTab(item)}
                >
                  {item === "preview" ? <Eye size={14} /> : item === "editor" ? <Code size={14} /> : item === "toolpath" ? <Tool size={14} /> : <Settings size={14} />}
                  {t(`cam.${item}`)}
                </button>
              )}
            </For>
          </nav>
        </div>

        <Show when={rightOpen()}>
          <aside class="cad-right cad-surface" aria-label={t("cam.generator")}>
            <div class="cad-tabs" role="tablist" aria-label={t("cam.generator")}>
              <For each={RIGHT_TABS}>
                {(tabKey) => (
                  <button
                    role="tab"
                    title={t(`cam.${tabKey}` as Key)}
                    aria-label={t(`cam.${tabKey}` as Key)}
                    aria-selected={rightTab() === tabKey}
                    onClick={() => setRightTab(tabKey)}
                  >
                    {tabKey === "generator" ? <Wrench size={16} /> : <Settings size={16} />}
                    {t(`cam.${tabKey}` as Key)}
                  </button>
                )}
              </For>
            </div>
            <div class="cad-sidebar-content" role="tabpanel">
              <Show when={rightTab() === "generator"}>
                <div class="cad-card">
                  <h3>{t("cam.generator")}</h3>
                  <label class="cad-field">
                    <span>{t("library.tab.tools")}</span>
                    <select
                      class="form-select"
                      value={selectedTool()?.id ?? ""}
                      onChange={(e) => setToolId(e.currentTarget.value)}
                    >
                      <For each={tools.data()}>
                        {(tool) => <option value={tool.id}>{tool.name}</option>}
                      </For>
                    </select>
                  </label>
                  <fieldset disabled={pending()}>
                    <Show when={operation() === "profile"}>
                      <SchemaForm
                        schema={cam.ProfileParams}
                        values={defaults}
                        onSubmit={(params) => void generate(params)}
                        submitLabel={t("cam.generate")}
                      />
                    </Show>
                    <Show when={operation() === "pocket"}>
                      <SchemaForm
                        schema={cam.PocketParams}
                        values={defaultsOf(new cam.PocketParams({ totalDepth: 3, stepdown: 1 }), cam.PocketParams)}
                        onSubmit={(params) => void generate(params)}
                        submitLabel={t("cam.generate")}
                      />
                    </Show>
                    <Show when={operation() === "engrave"}>
                      <SchemaForm
                        schema={cam.EngraveParams}
                        values={defaultsOf(new cam.EngraveParams({ totalDepth: 1, stepdown: 1 }), cam.EngraveParams)}
                        onSubmit={(params) => void generate(params)}
                        submitLabel={t("cam.generate")}
                      />
                    </Show>
                  </fieldset>
                </div>
              </Show>
              <Show when={rightTab() === "cycles"}>
                <div class="cad-card">
                  <h3>{t("cam.cycles")}</h3>
                  <p class="cad-hint">{t("cam.controller")}</p>
                </div>
              </Show>
            </div>
          </aside>
        </Show>
        <CadButton class="cad-right-toggle" label={t("cam.toggleProperties")} onClick={() => setRightOpen((value) => !value)}>
          <Show when={rightOpen()} fallback={<ChevronLeft size={20} />}>
            <ChevronRight size={20} />
          </Show>
        </CadButton>
      </div>

      <footer class="cad-status">
        <div class="cad-status-group">
          <span>{t("cam.mode")} <span class="cad-badge">{tab().toUpperCase()}</span></span>
          <span>{t("cam.toolLabel")} <span class="cad-badge">{operation()}</span></span>
          <span>{t("cam.units")} <span class="text-orange-300">{app.settings.settings().units}</span></span>
        </div>
        <div class="cad-status-group">
          <span>{t("cam.lines", { count: gcode() ? gcode().split("\n").length : 0 })}</span>
          <span>{t("cam.duration", { seconds: duration().toFixed(1) })}</span>
          <span role="status" aria-live="polite">{pending() ? t("cam.loading") : notice() ?? t("cam.ready")}</span>
        </div>
      </footer>

      <Show when={deleting()}>
        <div role="alertdialog" aria-label={t("cam.confirmDelete")} class="cad-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDeleting(false) }}>
          <div class="cad-modal cad-surface">
            <div class="cad-panel-heading">
              <h2>{t("cam.confirmDelete")}</h2>
              <CadButton label={t("common.close")} onClick={() => setDeleting(false)}>
                <X size={18} />
              </CadButton>
            </div>
            <div class="cad-actions">
              <button class="cad-primary" disabled={pending()} onClick={() => void remove()}>{t("common.delete")}</button>
              <button class="cad-button" onClick={() => setDeleting(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  )
}
