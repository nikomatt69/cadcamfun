import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { useNavigate, useParams } from "@solidjs/router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js"
import { Analyze, Gcode } from "@cadcamfun/cam"
import type { SavedToolpath, ToolpathComment, ToolpathVersion } from "@cadcamfun/server"
import { GcodeSimulator } from "../components/GcodeSimulator"
import { Button, Section } from "../components/ui"
import {
  addCommentAtom,
  libraryAtom,
  removeCommentAtom,
  removeToolpathAtom,
  restoreToolpathAtom,
  toolpathAtom,
  toolpathCommentsAtom,
  toolpathVersionsAtom,
  updateToolpathAtom,
} from "../lib/atoms"
import { download } from "../lib/download"

const success = <A,>(r: AsyncResult.AsyncResult<A, unknown>): A | undefined =>
  AsyncResult.isSuccess(r) ? r.value : undefined

export default function ToolpathPage() {
  const params = useParams<{ id: string }>()
  const toolpath = useAtomValue(() => toolpathAtom(params.id))
  return (
    <Show
      when={success(toolpath())}
      keyed
      fallback={
        <p class="p-6 text-sm text-zinc-500">
          {AsyncResult.isFailure(toolpath()) ? "Toolpath not found." : "Loading…"}
        </p>
      }
    >
      {(t) => <ToolpathView toolpath={t} />}
    </Show>
  )
}

const LINE_HEIGHT = 16

function ToolpathView(props: { toolpath: SavedToolpath }) {
  const t = props.toolpath
  const key = `toolpath:${t.id}`
  const navigate = useNavigate()
  const library = useAtomValue(() => libraryAtom)
  const versions = useAtomValue(() => toolpathVersionsAtom(t.id))
  const comments = useAtomValue(() => toolpathCommentsAtom(t.id))
  const update = useAtomSet(() => updateToolpathAtom, { mode: "promiseExit" })
  const restore = useAtomSet(() => restoreToolpathAtom, { mode: "promiseExit" })
  const remove = useAtomSet(() => removeToolpathAtom, { mode: "promiseExit" })
  const addComment = useAtomSet(() => addCommentAtom, { mode: "promiseExit" })
  const removeComment = useAtomSet(() => removeCommentAtom, { mode: "promiseExit" })

  const [code, setCode] = createSignal(t.gcode)
  const [parsedSource, setParsedSource] = createSignal(t.gcode)
  const [currentLine, setCurrentLine] = createSignal(-1)
  const [seekMove, setSeekMove] = createSignal<number>()
  const [comment, setComment] = createSignal("")
  const [notice, setNotice] = createSignal<string>()
  const dirty = () => code() !== t.gcode

  // Re-parse shortly after typing stops; parsing large programs on every keystroke is wasteful.
  let timer: ReturnType<typeof setTimeout> | undefined
  const edit = (value: string) => {
    setCode(value)
    clearTimeout(timer)
    timer = setTimeout(() => setParsedSource(value), 300)
  }
  onCleanup(() => clearTimeout(timer))

  const parsed = createMemo(() => Gcode.parse(parsedSource()))
  const machine = () => success(library())?.machines.find((m) => m.id === t.setup?.machineId)
  const rapidFeed = () => machine()?.rapidFeed ?? 5000
  const stats = createMemo(() => {
    const { bounds: _, ...s } = Analyze.analyzeMoves(parsed().moves, rapidFeed())
    return s
  })

  let editor!: HTMLTextAreaElement
  let gutter!: HTMLDivElement
  const lineCount = () => code().split("\n").length
  const followLine = (line: number) => {
    setCurrentLine(line)
    const top = line * LINE_HEIGHT
    if (top < editor.scrollTop || top > editor.scrollTop + editor.clientHeight - LINE_HEIGHT * 2)
      editor.scrollTop = Math.max(0, top - editor.clientHeight / 3)
  }
  const seekLine = (line: number) => {
    const i = parsed().lines.findIndex((l) => l >= line)
    if (i >= 0) setSeekMove(i)
  }

  const save = async () => {
    const message = prompt("Describe this change (optional)") ?? undefined
    setParsedSource(code())
    const exit = await update({
      params: { id: t.id },
      payload: { gcode: code(), stats: stats(), ...(message ? { message } : {}) },
      reactivityKeys: [key, "toolpaths"],
    })
    setNotice(Exit.isSuccess(exit) ? "Saved as a new version" : "Save failed")
  }

  const doRestore = async (v: ToolpathVersion) => {
    if (
      !confirm(
        `Restore the version from ${new Date(v.createdAt).toLocaleString()}? The current one is kept in history.`,
      )
    )
      return
    const exit = await restore({ params: { id: t.id, versionId: v.id }, reactivityKeys: [key, "toolpaths"] })
    setNotice(Exit.isSuccess(exit) ? "Version restored" : "Restore failed")
  }

  const doRemove = async () => {
    if (!confirm(`Delete "${t.name}" and its history?`)) return
    const exit = await remove({ params: { id: t.id }, reactivityKeys: ["toolpaths"] })
    if (Exit.isSuccess(exit)) navigate(`/p/${t.projectId}`)
  }

  const submitComment = async (e: SubmitEvent) => {
    e.preventDefault()
    const content = comment().trim()
    if (!content) return
    const exit = await addComment({
      params: { id: t.id },
      payload: { content },
      reactivityKeys: [`${key}:comments`],
    })
    if (Exit.isSuccess(exit)) setComment("")
  }

  return (
    <div class="grid h-dvh grid-rows-[auto_1fr] bg-zinc-950 text-zinc-200">
      <header class="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
        <a href="/" class="text-sm font-bold tracking-tight">
          CADCAM<span class="text-[var(--accent)]">FUN</span>
        </a>
        <a href={`/p/${t.projectId}`} class="text-xs text-zinc-400 hover:text-[var(--accent)]">
          ← Project
        </a>
        <h1 class="text-sm text-zinc-100">{t.name}</h1>
        <span class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">{t.controller}</span>
        <span class="text-xs text-zinc-500">{dirty() ? "Unsaved changes" : (notice() ?? `v${t.versions + 1}`)}</span>
        <div class="ml-auto flex gap-2">
          <Button variant="primary" disabled={!dirty()} onClick={save}>
            Save version
          </Button>
          <Button onClick={() => download(`${t.name.replace(/\W+/g, "_") || "program"}.nc`, code())}>Download</Button>
          <Button variant="ghost" onClick={doRemove}>
            Delete
          </Button>
        </div>
      </header>
      <div class="grid min-h-0 grid-cols-[minmax(320px,38%)_1fr_300px]">
        {/* Editor */}
        <div class="flex min-h-0 border-r border-zinc-800 font-mono text-[12px]">
          <div
            ref={gutter}
            class="w-12 shrink-0 overflow-hidden bg-zinc-900/60 py-2 text-right text-zinc-600 select-none"
          >
            <For each={Array.from({ length: lineCount() }, (_, i) => i)}>
              {(i) => (
                <div
                  class="cursor-pointer pr-2 hover:text-zinc-300"
                  style={{ height: `${LINE_HEIGHT}px`, "line-height": `${LINE_HEIGHT}px` }}
                  classList={{ "bg-[var(--accent)]/25 text-zinc-100": i === currentLine() }}
                  onClick={() => seekLine(i)}
                >
                  {i + 1}
                </div>
              )}
            </For>
          </div>
          <textarea
            ref={editor}
            spellcheck={false}
            data-testid="gcode-editor"
            class="min-h-0 flex-1 resize-none bg-transparent px-2 py-2 whitespace-pre text-emerald-300 outline-none"
            style={{ "line-height": `${LINE_HEIGHT}px` }}
            value={code()}
            onInput={(e) => edit(e.currentTarget.value)}
            onScroll={(e) => (gutter.scrollTop = e.currentTarget.scrollTop)}
          />
        </div>

        {/* Simulator */}
        <div class="flex min-h-0 flex-col">
          <GcodeSimulator
            moves={parsed().moves}
            lines={parsed().lines}
            rapidFeed={rapidFeed()}
            onLine={followLine}
            seekMove={seekMove()}
          />
        </div>

        {/* Side panel */}
        <aside class="min-h-0 overflow-y-auto border-l border-zinc-800">
          <Section title="Analysis">
            <div class="grid grid-cols-2 gap-1 font-mono text-[11px] text-zinc-400">
              <span>time ≈ {(stats().estimatedSeconds / 60).toFixed(1)} min</span>
              <span>moves {stats().moves}</span>
              <span>cut {(stats().cutDistance / 1000).toFixed(2)} m</span>
              <span>rapid {(stats().rapidDistance / 1000).toFixed(2)} m</span>
              <span>units {parsed().units}</span>
              <span>rapid F{rapidFeed()}</span>
            </div>
            <For each={parsed().warnings.slice(0, 5)}>{(w) => <p class="text-[11px] text-amber-400">{w}</p>}</For>
          </Section>

          <Section title={`Versions (${(success(versions()) ?? []).length + 1})`}>
            <div class="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200">
              Current · {new Date(t.updatedAt).toLocaleString()}
            </div>
            <For each={success(versions()) ?? []}>
              {(v) => (
                <div class="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-900">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-zinc-300">{v.message ?? "Edit"}</div>
                    <div class="text-[11px] text-zinc-500">{new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                  <button class="text-[11px] text-[var(--accent)] hover:underline" onClick={() => doRestore(v)}>
                    Restore
                  </button>
                </div>
              )}
            </For>
          </Section>

          <Section title={`Comments (${(success(comments()) ?? []).length})`}>
            <For each={success(comments()) ?? []}>
              {(c: ToolpathComment) => (
                <div class="group rounded bg-zinc-900 px-2 py-1.5 text-xs">
                  <div class="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      {c.author} · {new Date(c.createdAt).toLocaleString()}
                    </span>
                    <button
                      class="invisible text-zinc-500 group-hover:visible hover:text-red-400"
                      onClick={() =>
                        removeComment({ params: { id: t.id, commentId: c.id }, reactivityKeys: [`${key}:comments`] })
                      }
                    >
                      ✕
                    </button>
                  </div>
                  <p class="mt-0.5 whitespace-pre-wrap text-zinc-200">{c.content}</p>
                </div>
              )}
            </For>
            <form class="flex flex-col gap-1" onSubmit={submitComment}>
              <textarea
                class="h-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 outline-none focus:border-[var(--accent)]"
                placeholder="Add a comment"
                value={comment()}
                onInput={(e) => setComment(e.currentTarget.value)}
              />
              <Button type="submit" disabled={!comment().trim()}>
                Comment
              </Button>
            </form>
          </Section>
        </aside>
      </div>
    </div>
  )
}
