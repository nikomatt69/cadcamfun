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
import { AssistantPanel } from "../features/ai/index.ts"
import { useApp } from "../shared/state/context.ts"
import { projectSession } from "../features/projects/lib/project-session.ts"
import { SaveSeg } from "../shared/components/workspace-strip.tsx"
import { UpdatePrompt } from "./UpdatePrompt.tsx"
import { checkForUpdates, openReleaseNotes } from "./updates.ts"
import { listenToMenu, openLogsFolder, projectOfRecentId } from "./menu-events.ts"
import { activeActivity, routeOf, type ActivityId } from "./layout.ts"
import { COMMANDS, groupKeyOf, labelKeyOf, liveScopes, menuCommand } from "../shared/keybindings/catalog.ts"
import { displayChord } from "../shared/keybindings/chord.ts"
import { syncNativeMenu } from "./native-menu.ts"
import { ShortcutsDialog } from "../shared/keybindings/shortcuts-dialog.tsx"

import { listenForOpenedFiles, openDelivered, readDelivered } from "./open-file.ts"
import { listenForSidecarNotices } from "./sidecar.ts"
import { useElementsStore } from "../features/cad/store/elementsStore.ts"
import { openProgramInEditor } from "./open-program.ts"
import { useLayerStore } from "../features/cad/store/layerStore.ts"
import { toast } from "../shared/ui/toast.tsx"

export interface ShellProps {
  /** The routed screen. */
  readonly children: JSX.Element
}

/** Destinations without a keyboard command of their own; the rest of the navigation comes from the keymap. */
const PLAIN_DESTINATIONS = ["manuals", "costs", "plugins"] as const

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

  // The shell answers the commands that belong to no page; a page that registers the same id (save, undo, redo)
  // answers first and falls back to these.
  onMount(() => {
    const off = app.keys.register({
      "app.palette": () => { app.setPaletteOpen(!app.paletteOpen()) },
      "app.go.projects": () => { go("/") },
      "app.go.cad": () => { go("/cad") },
      "app.go.cam": () => { go("/cam") },
      "app.go.library": () => { go("/library") },
      "app.go.settings": () => { go("/settings") },
      "app.toggleAi": () => { app.setPanelOpen(!app.panelOpen()) },
      "app.shortcuts": () => { app.keys.setHelpOpen(!app.keys.helpOpen()) },
      "file.save": () => { void projectSession(app).flush().catch(() => undefined) },
      "edit.undo": () => { app.editor.undo() },
      "edit.redo": () => { app.editor.redo() }
    })
    const stop = app.keys.attach()
    onCleanup(() => { stop(); off() })
  })

  // The native menu bar shows and takes the user's chords, not the ones Rust shipped with.
  createEffect(() => { void syncNativeMenu(app.keys.keymap()).catch(() => undefined) })

  // The sidecar keeps the keymap for the user: once it answers, take its copy if it is newer, or publish ours.
  createEffect(() => { if (app.sidecar() === "ready") void app.keys.reconcile() })

  // The palette lists every command that can run on this screen, with the user's own chord, and the plain destinations.
  const commands = (): ReadonlyArray<PaletteCommand> => {
    const live = liveScopes(app.activity())
    const keymap = app.keys.keymap()
    const fromKeymap: ReadonlyArray<PaletteCommand> = COMMANDS
      .filter((command) => live.includes(command.scope) && app.keys.available(command.id))
      .map((command) => {
        const chord = keymap.entry(command.id)?.chords[0]
        return {
          id: command.id,
          label: t(labelKeyOf(command.id) as Key),
          group: t(groupKeyOf(command.group) as Key),
          ...(chord === undefined ? {} : { keys: displayChord(chord, app.keys.platform) }),
          run: () => { app.keys.run(command.id) }
        }
      })
    const destinations: ReadonlyArray<PaletteCommand> = PLAIN_DESTINATIONS.flatMap((id) => {
      const route = routeOf(id)
      if (route === undefined) return []
      return [{ id: `go-${id}`, label: t(`activity.${id}` as Key), group: t("keys.group.navigation"), run: () => selectActivity(id) }]
    })
    return [...fromKeymap, ...destinations]
  }

  // A menu id from the in-window fallback maps to the same actions as a shortcut.
  const onMenu = (id: string): void => {
    // Menu items that are keyboard commands run the same handler as their keys (the open page answers first).
    const command = menuCommand(id)
    if (command !== undefined) {
      app.keys.run(command)
      return
    }
    switch (id) {
      case "file.new":
        go("/projects/create")
        return
      case "file.open":
        go("/projects")
        return
      case "help.open_logs":
        void openLogsFolder().catch(() => undefined)
        return
      case "view.toggle_right_panel":
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

  onMount(() => {
    let gone = false
    let off: (() => void) | undefined
    void listenForOpenedFiles(async (paths) => {
      for (const path of paths) {
        if (gone) break
        const outcome = await openDelivered(path, {
          read: readDelivered,
          addElements: (elements, selected) => {
            if (gone) return
            const store = useElementsStore.getState()
            store.addElements(elements.map((element) => ({ ...element, layerId: useLayerStore.getState().activeLayer })))
            if (selected) store.selectElement(selected)
          },
          setProgram: (text) => openProgramInEditor(app, text, () => !gone),
          go: (route) => { if (!gone) go(route) }
        })
        if (!gone && outcome.kind === "failed") toast.error(t("shell.open.failed", { name: outcome.name, reason: t(`shell.open.${outcome.reason}`) }))
      }
    }).then((stop) => { if (gone) stop(); else off = stop }).catch(() => { if (!gone) toast.error(t("shell.open.listenFailed")) })
    onCleanup(() => { gone = true; off?.() })
  })

  // The shell restarts a sidecar that crashed or stopped answering; the requests that were in flight are not repeated.
  onMount(() => {
    let gone = false
    let off: (() => void) | undefined
    void listenForSidecarNotices((notice) => {
      if (gone) return
      if (notice === "recovered") toast.success(t("shell.engine.recovered"))
      else if (notice === "restarting") toast.warn(t("shell.engine.restarting"))
      else toast.error(t("shell.engine.failed"))
    }).then((stop) => { if (gone) stop(); else off = stop }).catch(() => undefined)
    onCleanup(() => { gone = true; off?.() })
  })

  onMount(() => {
    resize()
    window.addEventListener("resize", resize)
  })
  onCleanup(() => {
    window.removeEventListener("resize", resize)
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
          <Show when={showScrollTop() && layout() === "page"}><button type="button" class="reference-scroll-top" aria-label={t("shell.scrollTop")} onClick={() => main?.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? t("cam.kernel.fromData") : "smooth" })}><ChevronUp size={20} /></button></Show>
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

      <ShortcutsDialog />

      <Show when={app.paletteOpen()}>
        <CommandPalette commands={commands()} onClose={() => app.setPaletteOpen(false)} />
      </Show>
    </div>
  )
}
