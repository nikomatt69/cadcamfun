/**
 * The shell: title bar, activity bar, main area, docked AI panel, palette, status bar
 * (spec 06-desktop-ui.md §1).
 *
 * The Shell owns the chrome and the keyboard handling, and takes the routed screen as a
 * `children` slot. That keeps routing in `app/App.tsx` and this file free of the router,
 * so the whole layout can be rendered in a component test without a router.
 */
import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { t, type Key } from "../i18n/index.ts"
import { ActivityBar, StatusBar } from "../components/status-bar.tsx"
import { TitleBar } from "../components/title-bar.tsx"
import { CommandPalette, type PaletteCommand } from "../components/command-palette.tsx"
import { AiPanel, type AiMessage } from "../components/ai-panel.tsx"
import { useApp } from "../state/context.ts"
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
  const [messages, setMessages] = createSignal<ReadonlyArray<AiMessage>>([])

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

  // The palette lists the shortcuts plus the eight destinations, so `Cmd/Ctrl+K` is a
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
        go("/")
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
      default:
        return
    }
  }

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
    window.addEventListener("keydown", onKeyDown)
  })
  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown)
  })

  /**
   * WP8 has not landed, so the panel streams a canned reply. The signature is the one an
   * SSE endpoint will have, so replacing this function is the only change needed then.
   */
  const streamReply = async function* (prompt: string, signal: AbortSignal): AsyncIterable<string> {
    const reply = `I can see the project with ${app.drawing().entities.length} entities. Ask me about toolpaths.`
    for (const word of reply.split(" ")) {
      if (signal.aborted) return
      await Promise.resolve()
      yield `${word} `
    }
    void prompt
  }

  const settings = (): ReturnType<typeof app.settings.settings> => app.settings.settings()
  const toolLabel = (): string | undefined => {
    const tool = app.tool()
    return t(`cad.${tool}` as Key)
  }

  return (
    <div class="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <TitleBar onMenu={onMenu} onOpenPalette={() => app.setPaletteOpen(true)} />

      <div class="flex min-h-0 flex-1">
        <ActivityBar active={app.activity()} onSelect={selectActivity} />

        <main class="flex min-w-0 flex-1 flex-col" id="main-content">
          <div class="min-h-0 flex-1 overflow-y-auto">
            {props.children}
          </div>
        </main>

        <AiPanel
          open={app.panelOpen()}
          messages={messages()}
          streaming={false}
          onSend={streamReply}
          onClose={() => app.setPanelOpen(false)}
          onClear={() => setMessages([])}
        />
      </div>

      <StatusBar
        units={settings().units}
        snapEnabled={settings().snapEnabled}
        cursor={app.cursor()}
        sidecar={app.sidecar()}
        decimals={settings().decimals}
        toolLabel={toolLabel()}
      />

      <Show when={app.paletteOpen()}>
        <CommandPalette commands={commands()} onClose={() => app.setPaletteOpen(false)} />
      </Show>
    </div>
  )
}
