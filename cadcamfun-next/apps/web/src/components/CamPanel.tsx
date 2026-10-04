import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { Cause, Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { For, Show, createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Doc } from "@cadcamfun/core"
import type { Controller, Operation, OperationInput } from "@cadcamfun/cam"
import type { Library, ToolpathSummary } from "@cadcamfun/server"
import { createToolpathAtom, gcodeAtom, libraryAtom, projectToolpathsAtom } from "../lib/atoms"
import { download } from "../lib/download"
import { useEditor } from "../editor/store"
import { Button, Field, NumberInput, Section, Select } from "./ui"

const kinds = ["Profile", "Pocket", "Drill", "Engrave", "Facing"] as const
type Kind = (typeof kinds)[number]

export function CamPanel() {
  const library = useAtomValue(() => libraryAtom)
  return (
    <Show
      when={AsyncResult.isSuccess(library()) && (library() as AsyncResult.Success<Library, unknown>).value}
      fallback={
        <p class="p-3 text-xs text-zinc-500">
          {AsyncResult.isFailure(library()) ? "Cannot reach the server." : "Loading library…"}
        </p>
      }
    >
      {(lib) => <CamPanelLoaded library={lib()} />}
    </Show>
  )
}

function CamPanelLoaded(props: { library: Library }) {
  const ed = useEditor()
  const generate = useAtomSet(() => gcodeAtom, { mode: "promiseExit" })
  const createToolpath = useAtomSet(() => createToolpathAtom, { mode: "promiseExit" })
  const saved = useAtomValue(() => projectToolpathsAtom(ed.project.id))
  const navigate = useNavigate()
  const [busy, setBusy] = createSignal(false)
  const [controller, setController] = createSignal<Controller | "">("")

  const [kind, setKind] = createSignal<Kind>("Profile")
  const [toolId, setToolId] = createSignal(
    (props.library.tools.find((t) => t.kind === "flat-endmill") ?? props.library.tools[0]!).id,
  )
  const [depth, setDepth] = createSignal(3)
  const [stepDown, setStepDown] = createSignal(0)
  const [side, setSide] = createSignal<"outside" | "inside" | "on">("outside")
  const [stepOver, setStepOver] = createSignal(0.4)
  const [peck, setPeck] = createSignal(0)

  const machine = () => props.library.machines.find((m) => m.id === ed.setup().machineId)
  const toolName = (id: string) => props.library.tools.find((t) => t.id === id)?.name ?? id

  const addOperation = () => {
    const elementIds = [...ed.selection()] as Array<Operation["elementIds"][number]>
    if (elementIds.length === 0 && kind() !== "Facing") return ed.notify("error", "Select the shapes to machine first")
    const common = { toolId: toolId(), elementIds, depth: depth(), ...(stepDown() > 0 ? { stepDown: stepDown() } : {}) }
    const input: OperationInput =
      kind() === "Profile"
        ? { _tag: "Profile", ...common, side: side(), direction: "climb" }
        : kind() === "Pocket"
          ? { _tag: "Pocket", ...common, stepOver: stepOver(), direction: "climb" }
          : kind() === "Drill"
            ? { _tag: "Drill", ...common, peck: peck() }
            : kind() === "Engrave"
              ? { _tag: "Engrave", ...common }
              : { _tag: "Facing", ...common, stepOver: stepOver() }
    const op = { ...input, id: `op-${crypto.randomUUID().slice(0, 8)}` } as Operation
    ed.setSetup((s) => ({ ...s, operations: [...s.operations, op] }))
  }

  const run = async () => {
    setBusy(true)
    const exit = await generate({
      payload: {
        document: ed.doc(),
        setup: ed.setup(),
        ...(controller() ? { controller: controller() as Controller } : {}),
      },
    })
    setBusy(false)
    if (Exit.isSuccess(exit)) {
      ed.setOutput(exit.value)
      if (exit.value.outOfBounds > 0) ed.notify("error", `${exit.value.outOfBounds} moves leave the work area`)
    } else {
      const err = Cause.squash(exit.cause) as { message?: string }
      ed.notify("error", err?.message ?? "G-code generation failed")
    }
  }

  const saveToolpath = async () => {
    const out = ed.output()
    if (!out) return
    const name = prompt("Toolpath name", `${ed.doc().name || "Program"} · ${out.controller}`)?.trim()
    if (!name) return
    const exit = await createToolpath({
      params: { projectId: ed.project.id },
      payload: {
        name,
        controller: out.controller,
        gcode: out.gcode,
        program: out.program,
        setup: ed.setup(),
        stats: out.stats,
      },
      reactivityKeys: ["toolpaths"],
    })
    if (Exit.isSuccess(exit)) navigate(`/toolpaths/${exit.value.id}`)
    else ed.notify("error", "Could not save the toolpath (save the project first)")
  }

  const autoStock = () => {
    const b = Doc.bounds(ed.doc())
    if (!b) return ed.notify("error", "Draw something first")
    const m = 5
    ed.setSetup((s) => ({
      ...s,
      stock: {
        origin: { x: b.min.x - m, y: b.min.y - m },
        size: { x: b.max.x - b.min.x + 2 * m, y: b.max.y - b.min.y + 2 * m, z: s.stock?.size.z ?? 10 },
      },
    }))
  }

  return (
    <>
      <Section title="Setup">
        <Field label="Machine">
          <Select
            value={ed.setup().machineId}
            options={props.library.machines.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(machineId) => ed.setSetup((s) => ({ ...s, machineId }))}
          />
        </Field>
        <Field label="Material">
          <Select
            value={ed.setup().materialId}
            options={props.library.materials.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(materialId) => ed.setSetup((s) => ({ ...s, materialId }))}
          />
        </Field>
        <Field label="Safe Z">
          <NumberInput
            value={ed.setup().safeZ}
            min={0.5}
            onChange={(safeZ) => safeZ > 0 && ed.setSetup((s) => ({ ...s, safeZ }))}
          />
        </Field>
        <Field label="Stock">
          <div class="flex items-center gap-1">
            <Show when={ed.setup().stock}>
              {(st) => (
                <span class="font-mono text-[11px] text-zinc-500">
                  {st().size.x.toFixed(0)}×{st().size.y.toFixed(0)}×
                </span>
              )}
            </Show>
            <Show when={ed.setup().stock}>
              {(st) => (
                <NumberInput
                  value={st().size.z}
                  min={0.1}
                  onChange={(z) =>
                    z > 0 && ed.setSetup((s) => ({ ...s, stock: { ...st(), size: { ...st().size, z } } }))
                  }
                />
              )}
            </Show>
            <Button onClick={autoStock}>Fit</Button>
          </div>
        </Field>
      </Section>

      <Section title="New operation">
        <Field label="Type">
          <Select value={kind()} options={kinds.map((k) => ({ value: k, label: k }))} onChange={setKind} />
        </Field>
        <Field label="Tool">
          <Select
            value={toolId()}
            options={props.library.tools.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setToolId}
          />
        </Field>
        <Field label="Depth (mm)">
          <NumberInput value={depth()} min={0.01} onChange={setDepth} />
        </Field>
        <Field label="Step down (0 = auto)">
          <NumberInput value={stepDown()} min={0} onChange={setStepDown} />
        </Field>
        <Show when={kind() === "Profile"}>
          <Field label="Side">
            <Select
              value={side()}
              options={[
                { value: "outside", label: "Outside" },
                { value: "inside", label: "Inside" },
                { value: "on", label: "On line" },
              ]}
              onChange={setSide}
            />
          </Field>
        </Show>
        <Show when={kind() === "Pocket" || kind() === "Facing"}>
          <Field label="Step over (×D)">
            <NumberInput
              value={stepOver()}
              min={0.05}
              step={0.05}
              onChange={(v) => setStepOver(Math.min(1, Math.max(0.05, v)))}
            />
          </Field>
        </Show>
        <Show when={kind() === "Drill"}>
          <Field label="Peck (0 = off)">
            <NumberInput value={peck()} min={0} onChange={setPeck} />
          </Field>
        </Show>
        <Button variant="primary" onClick={addOperation}>
          Add on {ed.selection().size || "no"} selected
        </Button>
      </Section>

      <Section title={`Operations (${ed.setup().operations.length})`}>
        <For each={ed.setup().operations} fallback={<p class="text-xs text-zinc-500">No operations yet.</p>}>
          {(op, i) => (
            <div class="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-xs">
              <span class="font-mono text-zinc-500">{i() + 1}</span>
              <div class="flex-1">
                <div class="text-zinc-200">
                  {op._tag} · {op.depth} mm
                </div>
                <div class="text-[11px] text-zinc-500">
                  {toolName(op.toolId)} · {op.elementIds.length} shapes
                </div>
              </div>
              <button
                class="text-zinc-500 hover:text-zinc-200"
                title="Select shapes"
                onClick={() => ed.setSelection(new Set(op.elementIds))}
              >
                ◎
              </button>
              <button
                class="text-zinc-500 hover:text-red-400"
                onClick={() => ed.setSetup((s) => ({ ...s, operations: s.operations.filter((o) => o.id !== op.id) }))}
              >
                ✕
              </button>
            </div>
          )}
        </For>
        <div class="flex items-center gap-2">
          <Select
            value={controller()}
            options={[
              { value: "", label: `Machine default (${machine()?.controller ?? "?"})` },
              { value: "grbl", label: "GRBL" },
              { value: "fanuc", label: "Fanuc" },
              { value: "linuxcnc", label: "LinuxCNC" },
              { value: "heidenhain", label: "Heidenhain" },
              { value: "marlin", label: "Marlin" },
            ]}
            onChange={setController}
          />
          <Button
            variant="primary"
            class="flex-1"
            disabled={busy() || ed.setup().operations.length === 0}
            onClick={run}
          >
            {busy() ? "Generating…" : "Generate G-code"}
          </Button>
        </div>
      </Section>

      <Show when={ed.output()}>
        {(out) => (
          <Section
            title={`G-code · ${out().controller}`}
            actions={
              <span class="flex gap-3">
                <button class="text-xs text-[var(--accent)] hover:underline" onClick={saveToolpath}>
                  Save toolpath
                </button>
                <button
                  class="text-xs text-[var(--accent)] hover:underline"
                  onClick={() => download(`${ed.doc().name.replace(/\W+/g, "_") || "program"}.nc`, out().gcode)}
                >
                  Download
                </button>
              </span>
            }
          >
            <div class="grid grid-cols-2 gap-1 font-mono text-[11px] text-zinc-400">
              <span>time ≈ {(out().stats.estimatedSeconds / 60).toFixed(1)} min</span>
              <span>moves {out().stats.moves}</span>
              <span>cut {(out().stats.cutDistance / 1000).toFixed(2)} m</span>
              <span>rapid {(out().stats.rapidDistance / 1000).toFixed(2)} m</span>
            </div>
            <pre class="max-h-64 overflow-auto rounded bg-black/50 p-2 font-mono text-[11px] leading-4 text-emerald-300">
              {out().gcode.split("\n").slice(0, 400).join("\n")}
            </pre>
          </Section>
        )}
      </Show>

      <Show
        when={
          AsyncResult.isSuccess(saved()) &&
          (saved() as AsyncResult.Success<ReadonlyArray<ToolpathSummary>, unknown>).value
        }
      >
        {(items) => (
          <Section title={`Saved toolpaths (${items().length})`}>
            <For
              each={items()}
              fallback={<p class="text-xs text-zinc-500">None yet: generate, then "Save toolpath".</p>}
            >
              {(t) => (
                <a
                  href={`/toolpaths/${t.id}`}
                  class="flex items-center justify-between rounded bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                >
                  <span class="text-zinc-200">{t.name}</span>
                  <span class="font-mono text-[11px] text-zinc-500">
                    {t.controller} · v{t.versions + 1}
                  </span>
                </a>
              )}
            </For>
          </Section>
        )}
      </Show>
    </>
  )
}
