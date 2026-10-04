import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { useNavigate } from "@solidjs/router"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { For, Show, createSignal } from "solid-js"
import type { ProjectSummary } from "@cadcamfun/server"
import { Button } from "../components/ui"
import { createProjectAtom, projectsAtom, removeProjectAtom } from "../lib/atoms"

export default function Projects() {
  const projects = useAtomValue(() => projectsAtom)
  const create = useAtomSet(() => createProjectAtom, { mode: "promiseExit" })
  const remove = useAtomSet(() => removeProjectAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const [name, setName] = createSignal("")

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const exit = await create({ payload: { name: name().trim() || "Untitled part" }, reactivityKeys: ["projects"] })
    if (Exit.isSuccess(exit)) navigate(`/p/${exit.value.id}`)
  }

  const list = () => {
    const r = projects()
    return AsyncResult.isSuccess(r) ? (r.value as ReadonlyArray<ProjectSummary>) : undefined
  }

  return (
    <main class="mx-auto max-w-3xl p-6">
      <header class="mb-8 flex items-baseline justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-zinc-100">
          CADCAM<span class="text-[var(--accent)]">FUN</span>
        </h1>
        <nav class="flex items-baseline gap-4 text-xs">
          <a href="/library" class="text-zinc-300 hover:text-[var(--accent)]">
            Library
          </a>
          <span class="text-zinc-500">CAD · CAM · AI for CNC</span>
        </nav>
      </header>
      <form class="mb-6 flex gap-2" onSubmit={submit}>
        <input
          class="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--accent)]"
          placeholder="New part name"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Button variant="primary" type="submit">
          New project
        </Button>
      </form>
      <Show
        when={list()}
        fallback={
          <p class="text-sm text-zinc-500">
            {AsyncResult.isFailure(projects()) ? "Cannot reach the server." : "Loading…"}
          </p>
        }
      >
        {(items) => (
          <ul class="divide-y divide-zinc-800 rounded-md border border-zinc-800">
            <For each={items()} fallback={<li class="p-4 text-sm text-zinc-500">No projects yet.</li>}>
              {(p) => (
                <li class="flex items-center gap-3 p-3 hover:bg-zinc-900">
                  <a href={`/p/${p.id}`} class="flex-1">
                    <div class="text-sm text-zinc-100">{p.name}</div>
                    <div class="text-xs text-zinc-500">
                      {p.elements} shapes · {p.operations} operations · {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </a>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      confirm(`Delete "${p.name}"?`) && remove({ params: { id: p.id }, reactivityKeys: ["projects"] })
                    }
                  >
                    Delete
                  </Button>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </main>
  )
}
