/**
 * The shell: title bar, activity bar, main area, docked AI panel, palette, status bar
 * (spec 06-desktop-ui.md §1).
 *
 * The Shell owns the chrome and the keyboard handling, and takes the routed screen as a
 * `children` slot. That keeps routing in `app/App.tsx` and this file free of the router,
 * so the whole layout can be rendered in a component test without a router.
 */
import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { t, type Key } from "../i18n/index.ts"
import { StatusBar } from "../shared/components/status-bar.tsx"
import { ReferenceNavbar, ReferenceSidebar } from "../shared/components/reference-navigation.tsx"
import { ReferenceBreadcrumbs, ReferenceFooter, referenceLayout } from "../shared/components/reference-page.tsx"
import ChevronUp from "lucide-solid/icons/chevron-up"
import "../styles/panel.css"
import "../styles/reference-shell.css"
import "../styles/page-consistency.css"
import "../styles/enterprise.css"
import { TitleBar } from "../shared/components/title-bar.tsx"
import { CommandPalette, type PaletteCommand } from "../shared/components/command-palette.tsx"
import { AssistantPanel } from "../features/ai/components/AssistantPanel.tsx"
import { useApp } from "../shared/state/context.ts"
import { projectSession } from "../features/projects/lib/project-session.ts"
import { SaveSeg } from "../shared/components/workspace-strip.tsx"
import { UpdatePrompt } from "./UpdatePrompt.tsx"
import { checkForUpdates, openReleaseNotes } from "./updates.ts"
import { listenToMenu, openLogsFolder, projectOfRecentId } from "./menu-events.ts"
import { activeActivity, routeOf, type ActivityId } from "./layout.ts"
import { findShortcut, shortcuts } from "./shortcuts.ts"

export interface ShellProps {
  /** The routed screen. */
  readonly children: JSX.Element
}

/** Groups the palette by shortcut group, using already-translated headings. */
const groupKey = (group: "navigation" | "edit" | "view" | "ai"): Key =>
  group === "navigation" ? "palette.group.navigation" : `palette.group.${group}`

export function Shell(props: ShellProps): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const layout = () => referenceLayout(location.pathname)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [mobile, setMobile] = createSignal(false)
  const [showScrollTop, setShowScrollTop] = createSignal(false)
  let main: HTMLElement | undefined
  const resize = () => {
    const next = window.innerWidth < 768
    if (next !== mobile()) { setMobile(next); setSidebarOpen(!next) }
  }
  createEffect(() => {
    const activity = activeActivity(location.pathname)
    app.setActivity(activity)
    setShowScrollTop(false)
    main?.scrollTo?.({ top: 0 })
  })

  // The open project's save session lives as long as the shell: autosave, the status read-out and the window guards.
  onMount(() => onCleanup(projectSession(app).start()))

  const go = (route: string): void => {
    navigate(route)
  }

  const selectActivity = (id: ActivityId): void => {
    app.setActivity(id)
    if (id === "ai") {
      app.setPanelOpen(!app.panelOpen())
      return
    }
    const route = routeOf(id)
    if (route !== undefined) go(route)
  }

  // The palette lists shortcuts and destinations, so `Cmd/Ctrl+K` is a
  // complete keyboard interface on its own.
  const commands = (): ReadonlyArray<PaletteCommand> => {
    const context = {
      activity: app.activity(),
      go,
      togglePanel: () => app.setPanelOpen(!app.panelOpen()),
      openPalette: () => app.setPaletteOpen(true),
      newProject: () => go("/"),
      undo: () => app.editor.undo(),
      redo: () => app.editor.redo(),
      zoomFit: () => {},
      zoomIn: () => {},
      zoomOut: () => {}
    }
    const fromShortcuts: ReadonlyArray<PaletteCommand> = shortcuts(context).map((shortcut) => ({
      id: shortcut.id,
      label: t(shortcut.labelKey as Key),
      group: t(groupKey(shortcut.group)),
      keys: shortcut.keys,
      run: () => shortcut.run(context)
    }))
    const fromActivities: ReadonlyArray<PaletteCommand> = [
      "projects",
      "cad",
      "cam",
      "library",
      "manuals",
      "costs",
      "settings",
      "plugins"
    ].flatMap((id) => {
      const route = routeOf(id as ActivityId)
      if (route === undefined) return []
      return [
        {
          id: `go-${id}`,
          label: t(`activity.${id}` as Key),
          group: t("palette.group.navigation"),
          run: () => selectActivity(id as ActivityId)
        }
      ]
    })
    return [...fromActivities, ...fromShortcuts]
  }

  // A menu id from the in-window fallback maps to the same actions as a shortcut.
  const onMenu = (id: string): void => {
    switch (id) {
      case "file.new":
        go("/projects/create")
        return
      case "file.open":
        go("/projects")
        return
      case "file.save":
        void projectSession(app).flush().catch(() => undefined)
        return
      case "help.open_logs":
        void openLogsFolder().catch(() => undefined)
        return
      case "edit.undo":
        app.editor.undo()
        return
      case "edit.redo":
        app.editor.redo()
        return
      case "view.toggle_right_panel":
      case "view.toggle_console":
        app.setPanelOpen(!app.panelOpen())
        return
      case "view.toggle_left_panel":
        setSidebarOpen(!sidebarOpen())
        return
      // The shell owns the updater: these two reach it as commands (the native menu bar of macOS handles them in Rust).
      case "help.check_updates":
        void checkForUpdates().catch(() => undefined)
        return
      case "help.release_notes":
        void openReleaseNotes().catch(() => undefined)
        return
      default: {
        // A recent project of the tray menu opens its page.
        const project = projectOfRecentId(id)
        if (project !== undefined) go(`/projects/${encodeURIComponent(project)}`)
        return
      }
    }
  }

  // The native menu bar and the tray reach the same actions as the in-window menus.
  onMount(() => {
    let off: (() => void) | undefined
    let gone = false
    void listenToMenu(onMenu).then((stop) => { if (gone) stop(); else off = stop }).catch(() => undefined)
    onCleanup(() => { gone = true; off?.() })
  })

  const onKeyDown = (event: KeyboardEvent): void => {
    const found = findShortcut(event, shortcuts({
      activity: app.activity(),
      go,
      togglePanel: () => app.setPanelOpen(!app.panelOpen()),
      openPalette: () => app.setPaletteOpen(true),
      newProject: () => go("/"),
      undo: () => app.editor.undo(),
      redo: () => app.editor.redo(),
      zoomFit: () => {},
      zoomIn: () => {},
      zoomOut: () => {}
    }))
    if (found === undefined) return
    event.preventDefault()
    found.run({
      activity: app.activity(),
      go,
      togglePanel: () => app.setPanelOpen(!app.panelOpen()),
      openPalette: () => app.setPaletteOpen(true),
      newProject: () => go("/"),
      undo: () => app.editor.undo(),
      redo: () => app.editor.redo(),
      zoomFit: () => {},
      zoomIn: () => {},
      zoomOut: () => {}
    })
  }

  onMount(() => {
    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("keydown", onKeyDown)
  })
  onCleanup(() => {
    window.removeEventListener("resize", resize)
    window.removeEventListener("keydown", onKeyDown)
  })

  const settings = (): ReturnType<typeof app.settings.settings> => app.settings.settings()
  const toolLabel = (): string | undefined => {
    const tool = app.tool()
    return t(`cad.${tool}` as Key)
  }

  return (
    <div class="reference-shell">
      <TitleBar minimal={layout() !== "workspace"} onMenu={onMenu} onOpenPalette={() => app.setPaletteOpen(true)} />
      <Show when={layout() !== "workspace"}>
        <ReferenceNavbar sidebarOpen={sidebarOpen()} onToggleSidebar={() => setSidebarOpen(!sidebarOpen())} />
      </Show>

      <div class="reference-shell-body" classList={{ "is-workspace": layout() === "workspace", "is-standalone": layout() === "standalone" }}>
        <Show when={layout() === "page"}>
          <ReferenceSidebar open={sidebarOpen()} mobile={mobile()} onOpenChange={setSidebarOpen} />
        </Show>

        <div class="reference-page-column">
          <Show when={layout() === "page"}><ReferenceBreadcrumbs pathname={location.pathname} /></Show>
          <main ref={main} class="reference-page-scroll" id="main-content" onScroll={(event) => setShowScrollTop(event.currentTarget.scrollTop > 300)}>
            <div class={layout() === "workspace" ? "reference-workspace-container" : layout() === "standalone" ? "reference-standalone-container" : "reference-page-container"}>
              {props.children}
            </div>
          </main>
          <Show when={layout() === "page"}><ReferenceFooter /></Show>
          <Show when={showScrollTop() && layout() === "page"}><button type="button" class="reference-scroll-top" aria-label={t("shell.scrollTop")} onClick={() => main?.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}><ChevronUp size={20} /></button></Show>
        </div>

        <AssistantPanel open={app.panelOpen()} onClose={() => app.setPanelOpen(false)} />
      </div>

      {/* The CAD and CAM pages carry these facts in their own strip: one bar, not two. */}
      <Show when={layout() !== "workspace"}>
        <StatusBar
          units={settings().units}
          snapEnabled={settings().snapEnabled}
          cursor={app.cursor()}
          sidecar={app.sidecar()}
          decimals={settings().decimals}
          toolLabel={toolLabel()}
          saveSlot={<SaveSeg light />}
        />
      </Show>

      <UpdatePrompt />

      <Show when={app.paletteOpen()}>
        <CommandPalette commands={commands()} onClose={() => app.setPaletteOpen(false)} />
      </Show>
    </div>
  )
}
