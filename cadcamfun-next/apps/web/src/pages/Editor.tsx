import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { useParams } from "@solidjs/router"
import { AsyncResult } from "effect/reactivity"
import { Show, Suspense, createEffect, createSignal, lazy, on, onCleanup, type JSX } from "solid-js"
import type { Project } from "@cadcamfun/server"
import { CamPanel } from "../components/CamPanel"
import { Canvas2D } from "../components/Canvas2D"
import { ChatPanel } from "../components/ChatPanel"
import { PropertiesPanel } from "../components/PropertiesPanel"
import { Toolbar } from "../components/Toolbar"
import { EditorContext, createEditor, useEditor } from "../editor/store"
import { projectAtom, saveProjectAtom } from "../lib/atoms"

const Viewport3D = lazy(() => import("../components/Viewport3D"))

export default function Editor() {
  const params = useParams<{ id: string }>()
  const project = useAtomValue(() => projectAtom(params.id))
  return (
    <Show
      when={AsyncResult.isSuccess(project()) && (project() as AsyncResult.Success<Project, unknown>).value}
      keyed
      fallback={
        <p class="p-6 text-sm text-zinc-500">{AsyncResult.isFailure(project()) ? "Project not found." : "Loading…"}</p>
      }
    >
      {(p) => <Workspace project={p} />}
    </Show>
  )
}

function Workspace(props: { project: Project }) {
  const editor = createEditor(props.project)
  return (
    <EditorContext.Provider value={editor}>
      <Layout />
    </EditorContext.Provider>
  )
}

type Tab = "properties" | "cam" | "ai"

function Layout() {
  const ed = useEditor()
  const save = useAtomSet(() => saveProjectAtom, { mode: "promiseExit" })
  const [tab, setTab] = createSignal<Tab>("properties")
  const [saved, setSaved] = createSignal<"saved" | "saving" | "dirty">("saved")
  const [name, setName] = createSignal(ed.project.name)

  // Debounced autosave whenever the document, setup or name changes.
  let timer: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(
      [ed.doc, ed.setup, name],
      () => {
        setSaved("dirty")
        clearTimeout(timer)
        timer = setTimeout(async () => {
          setSaved("saving")
          await save({
            params: { id: ed.project.id },
            payload: { name: name(), document: ed.doc(), setup: ed.setup() },
            reactivityKeys: ["projects"],
          })
          setSaved("saved")
        }, 1200)
      },
      { defer: true },
    ),
  )
  onCleanup(() => clearTimeout(timer))

  const tabButton = (id: Tab, label: string): JSX.Element => (
    <button
      class="flex-1 border-b-2 py-2 text-xs font-medium"
      classList={{
        "border-[var(--accent)] text-zinc-100": tab() === id,
        "border-transparent text-zinc-500 hover:text-zinc-300": tab() !== id,
      }}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  )

  return (
    <div class="grid h-dvh grid-rows-[auto_auto_1fr] bg-zinc-950 text-zinc-200">
      <header class="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
        <a href="/" class="text-sm font-bold tracking-tight">
          CADCAM<span class="text-[var(--accent)]">FUN</span>
        </a>
        <input
          class="w-64 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-zinc-100 hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none"
          value={name()}
          onChange={(e) => setName(e.currentTarget.value.trim() || name())}
        />
        <span class="text-xs text-zinc-500">
          {saved() === "saved" ? "Saved" : saved() === "saving" ? "Saving…" : "Unsaved changes"}
        </span>
        <a href="/library" class="text-xs text-zinc-400 hover:text-[var(--accent)]">
          Library
        </a>
        <Show when={ed.notice()}>
          {(n) => (
            <span
              class="ml-auto rounded px-2 py-0.5 text-xs"
              classList={{
                "bg-red-500/20 text-red-300": n().kind === "error",
                "bg-zinc-800 text-zinc-300": n().kind === "info",
              }}
            >
              {n().text}
            </span>
          )}
        </Show>
      </header>
      <Toolbar />
      <div class="grid min-h-0 grid-cols-[1fr_340px]">
        <div class="min-h-0">
          <Show when={ed.view3d()} fallback={<Canvas2D />}>
            <Suspense fallback={<p class="p-4 text-xs text-zinc-500">Loading 3D…</p>}>
              <Viewport3D />
            </Suspense>
          </Show>
        </div>
        <aside class="flex min-h-0 flex-col border-l border-zinc-800 bg-zinc-950">
          <nav class="flex border-b border-zinc-800">
            {tabButton("properties", "Design")}
            {tabButton("cam", "CAM")}
            {tabButton("ai", "AI")}
          </nav>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <Show when={tab() === "properties"}>
              <PropertiesPanel />
            </Show>
            <Show when={tab() === "cam"}>
              <CamPanel />
            </Show>
            <div class="h-full" classList={{ hidden: tab() !== "ai" }}>
              <ChatPanel />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
