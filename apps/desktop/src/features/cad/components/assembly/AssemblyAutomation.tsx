import { downloadFile } from "../../../../shared/lib/save-file.ts"
import { PanelCard } from "../../../../shared/components/panel/ui.tsx"
/**
 * Component automations of the assembly workspace, on the exact model: insert the fasteners the parts' shared holes need, join
 * the parts on their shared hole axes (assembly joints), check every pair of parts for interference, and list the bill of
 * materials (with a CSV export).
 * The kernel work runs after the busy state has painted; results are snapshots that a change of the drawing clears.
 */
import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"
import type { BomRow } from "@cadcamfun/core"
import { t } from "../../../../i18n/index.ts"
import { useElementsStore } from "../../store/elementsStore.ts"
import { applyJoints, bomCsv, fastenScene, sceneBom, sceneClearance, sceneInterference, sceneJoints, type FastenResult, type JointTarget, type SceneInterference } from "../../lib/component-automation.ts"
import { useAssemblyStore } from "../../store/assemblyStore.ts"

type Skipped = ReadonlyArray<{ readonly id: string; readonly name: string; readonly reason: string }>

const fmt = (x: number, d = 2) => x.toLocaleString(undefined, { maximumFractionDigits: d })
const grid = "grid grid-cols-[1.5rem_1fr_2.5rem_4.5rem] gap-x-2"
const button = "panel-btn"

export default function AssemblyAutomation(): JSX.Element {
  const store = useElementsStore()
  const [busy, setBusy] = createSignal<"fasten" | "joints" | "interference" | "clearance" | "bom" | undefined>(undefined)
  const [jointed, setJointed] = createSignal<{ added: number; existing: number; joints: string[]; skipped: Skipped } | undefined>(undefined)
  const [fastened, setFastened] = createSignal<FastenResult | undefined>(undefined)
  const [clashes, setClashes] = createSignal<SceneInterference | undefined>(undefined)
  const [gaps, setGaps] = createSignal<ReturnType<typeof sceneClearance> | undefined>(undefined)
  const [bom, setBom] = createSignal<{ rows: ReadonlyArray<BomRow>; skipped: Skipped } | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [washers, setWashers] = createSignal(true)

  // A report describes the drawing it was computed on.
  createEffect(on(() => store.elements, () => { setClashes(undefined); setGaps(undefined); setBom(undefined) }, { defer: true }))

  const run = (what: "fasten" | "joints" | "interference" | "clearance" | "bom", work: () => void) => {
    setBusy(what)
    setError(undefined)
    setTimeout(() => {
      try { work() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(undefined) }
    }, 0)
  }
  const fasten = () => run("fasten", () => {
    const result = fastenScene(store.elements as never, { washers: washers() })
    if (result.elements.length > 0) store.addElements(result.elements as never)
    setFastened(result)
  })
  const joints = () => run("joints", () => {
    const inferred = sceneJoints(store.elements as never)
    const outcome = applyJoints(inferred, () => useAssemblyStore.getState() as unknown as JointTarget)
    setJointed({ ...outcome, joints: inferred.joints.map((j) => `${inferred.names.get(j.child) ?? j.child} → ${inferred.names.get(j.parent) ?? j.parent}: ${j.kind}`), skipped: inferred.skipped })
  })
  const interference = () => run("interference", () => setClashes(sceneInterference(store.elements as never)))
  const clearance = () => run("clearance", () => setGaps(sceneClearance(store.elements as never)))
  const listBom = () => run("bom", () => setBom(sceneBom(store.elements as never)))
  const exportCsv = () => {
    const rows = bom()?.rows
    if (rows === undefined) return
    downloadFile({ name: "bill-of-materials.csv", data: bomCsv(rows), mime: "text/csv" })
  }
  const name = (id: string) => clashes()?.names.get(id) ?? id

  const SkippedList = (props: { readonly items: Skipped }) => (
    <Show when={props.items.length > 0}>
      <p class="text-xs text-amber-700 dark:text-amber-300" data-testid="automation-skipped">
        {t("cad.automation.skipped")}: <For each={props.items}>{(s) => <span class="mr-2">{s.name} ({s.reason})</span>}</For>
      </p>
    </Show>
  )

  return (
    <PanelCard title={t("cad.automation.title")} testId="assembly-automation">

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <button type="button" class={button} disabled={busy() !== undefined} onClick={fasten}>{busy() === "fasten" ? t("cad.automation.working") : t("cad.automation.fasten")}</button>
          <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={washers()} onChange={(e) => setWashers(e.currentTarget.checked)} />
            {t("cad.automation.washers")}
          </label>
        </div>
        <Show when={fastened()}>
          {(r) => (
            <div class="space-y-1 text-xs text-gray-700 dark:text-gray-300" data-testid="fasten-result">
              <p>{t("cad.automation.inserted")}: {r().plans.length} · {t("cad.automation.alreadyFastened")}: {r().existing}</p>
              <ul class="space-y-0.5">
                <For each={r().plans}>{(p) => (
                  <li>
                    <span class="font-medium">{p.designation}</span>
                    {p.nut !== undefined ? ` + ${p.nut.designation}` : ""}
                    {` · ${t("cad.automation.grip")} ${fmt(p.grip)} mm`}
                    {p.engagement !== undefined ? ` · ${t("cad.automation.engagement")} ${fmt(p.engagement)} mm` : ""}
                    <For each={p.warnings}>{(w) => <span class="block text-amber-700 dark:text-amber-300">{w}</span>}</For>
                  </li>
                )}</For>
              </ul>
              <Show when={r().unfastened.length > 0}>
                <ul class="text-amber-700 dark:text-amber-300">
                  <For each={r().unfastened}>{(u) => <li>{u.bodies.join(" / ")}: {u.reason}</li>}</For>
                </ul>
              </Show>
              <SkippedList items={r().skipped} />
            </div>
          )}
        </Show>
      </div>

      <div class="space-y-2">
        <button type="button" class={button} disabled={busy() !== undefined} onClick={joints}>{busy() === "joints" ? t("cad.automation.working") : t("cad.automation.joints")}</button>
        <Show when={jointed()}>
          {(r) => (
            <div class="space-y-1 text-xs text-gray-700 dark:text-gray-300" data-testid="joints-result">
              <p>{t("cad.automation.jointsAdded")}: {r().added} · {t("cad.automation.alreadyJoined")}: {r().existing}</p>
              <ul><For each={r().joints}>{(j) => <li>{j}</li>}</For></ul>
              <SkippedList items={r().skipped} />
            </div>
          )}
        </Show>
      </div>

      <div class="space-y-2">
        <button type="button" class={button} disabled={busy() !== undefined} onClick={interference}>{busy() === "interference" ? t("cad.automation.working") : t("cad.automation.interference")}</button>
        <Show when={clashes()}>
          {(r) => {
            const hard = () => r().interferences.filter((i) => i.kind === "clash")
            const expected = () => r().interferences.filter((i) => i.kind === "expected")
            return (
              <div class="space-y-1 text-xs" data-testid="interference-result">
                <p class={hard().length === 0 && r().undetermined.length === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>
                  {hard().length === 0 && r().undetermined.length === 0 ? t("cad.automation.noClash") : `${t("cad.automation.clashes")}: ${hard().length}`}
                  {` · ${t("cad.automation.pairsChecked")}: ${r().checked}`}
                </p>
                <ul class="text-gray-700 dark:text-gray-300">
                  <For each={hard()}>{(i) => <li class="text-red-700 dark:text-red-300">{name(i.a)} × {name(i.b)}: {fmt(i.volume, 3)} mm³</li>}</For>
                  <For each={expected()}>{(i) => <li>{name(i.a)} × {name(i.b)}: {fmt(i.volume, 3)} mm³ ({i.note})</li>}</For>
                  <For each={r().undetermined}>{(u) => <li class="text-amber-700 dark:text-amber-300">{name(u.a)} × {name(u.b)}: {u.reason}</li>}</For>
                </ul>
                <SkippedList items={r().skipped} />
              </div>
            )
          }}
        </Show>
      </div>

      <div class="space-y-2">
        <button type="button" class={button} disabled={busy() !== undefined} onClick={clearance}>{busy() === "clearance" ? t("cad.automation.working") : t("cad.automation.clearance")}</button>
        <Show when={gaps()}>
          {(g) => (
            <div class="space-y-1 text-xs text-gray-700 dark:text-gray-300" data-testid="clearance-result">
              <Show when={g().length > 0} fallback={<p>{t("cad.automation.noNeighbours")}</p>}>
                <ul>
                  <For each={g()}>{(c) => <li data-testid="clearance-row">{c.aName} × {c.bName}: {c.overlap ? t("cad.automation.overlap") : `${fmt(c.distance, 3)} mm`}</li>}</For>
                </ul>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <div class="space-y-2">
        <div class="flex gap-2">
          <button type="button" class={button} disabled={busy() !== undefined} onClick={listBom}>{busy() === "bom" ? t("cad.automation.working") : t("cad.automation.bom")}</button>
          <Show when={bom()}><button type="button" class={button} onClick={exportCsv}>CSV</button></Show>
        </div>
        <Show when={bom()}>
          {(b) => (
            <div data-testid="bom-result">
              <div role="table" class="text-xs text-gray-700 dark:text-gray-300">
                <div role="row" class={`${grid} font-semibold`}>
                  <span role="columnheader">#</span><span role="columnheader">{t("cad.automation.part")}</span>
                  <span role="columnheader">{t("cad.automation.qty")}</span><span role="columnheader">{t("cad.automation.mass")}</span>
                </div>
                <For each={b().rows}>{(row) => (
                  <div role="row" class={grid} data-testid="bom-row">
                    <span role="cell">{row.item}</span>
                    <span role="cell">{row.designation ?? row.name}{row.material !== undefined ? ` (${row.material})` : ""}</span>
                    <span role="cell">{row.quantity}</span>
                    <span role="cell">{row.mass === undefined ? "–" : `${fmt(row.mass * row.quantity)} g`}</span>
                  </div>
                )}</For>
              </div>
              <SkippedList items={b().skipped} />
            </div>
          )}
        </Show>
      </div>

      <Show when={error()}><p class="text-xs text-red-700 dark:text-red-300">{error()}</p></Show>
    </PanelCard>
  )
}
