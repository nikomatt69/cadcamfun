import { downloadFile } from "../../../shared/lib/save-file.ts"
import { PanelCard } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"
import { NumberField } from "../../../shared/components/panel/ui.tsx"
import { analyzeExact, editElementBoss, editElementFillet, editElementHole, editElementNurbs, elementStep, type ExactAnalysis, type HoleChange } from "../lib/exactModel.ts"
import { useElementsStore } from "../store/elementsStore.ts"

interface Props {
  readonly element: Record<string, unknown>
  readonly all: ReadonlyArray<Record<string, unknown>>
}

const fmt = (x: number, d = 3) => x.toLocaleString(undefined, { maximumFractionDigits: d })

/**
 * The exact (B-rep) model of the selected element: topology, surfaces, exact volume, area and centre of mass, through-holes,
 * validity, and its own STEP file. STEP imports are analysed at once; other solids on request, since a Boolean element
 * recomputes its operands exactly.
 */
export default function ExactModelPanel(props: Props): JSX.Element {
  const [analysis, setAnalysis] = createSignal<ExactAnalysis | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)
  const run = () => {
    setBusy(true)
    // Let the busy state paint before the kernel works.
    setTimeout(() => {
      setAnalysis(analyzeExact(props.element, props.all))
      setBusy(false)
    }, 0)
  }
  createEffect(on(() => props.element, (el) => {
    setAnalysis(undefined)
    if (el["type"] === "brep") run()
  }))
  /** The diameter typed for each hole, by index; the recognised one until the person types. */
  const [sizes, setSizes] = createSignal<Readonly<Record<number, number>>>({})
  const [note, setNote] = createSignal<{ readonly ok: boolean; readonly text: string } | undefined>(undefined)
  /** Draft angle of the wall a resize makes, degrees; 0 leaves it straight. */
  const [draft, setDraft] = createSignal(0)
  const changeHole = (index: number, change: HoleChange) => {
    const r = editElementHole(props.element, props.all, index, change.kind === "resize" && draft() > 0 ? { ...change, taper: draft() } : change)
    if (!r.ok) { setNote({ ok: false, text: r.error }); return }
    useElementsStore.getState().addElements([r.element])
    setNote({ ok: true, text: `Added "${String(r.element["name"])}": volume ${fmt(r.volume)} mm³ (${r.volumeChange > 0 ? "+" : ""}${fmt(r.volumeChange)}).` })
  }
  const [bossSizes, setBossSizes] = createSignal<Readonly<Record<number, number>>>({})
  const changeBoss = (index: number, diameter: number) => {
    const r = editElementBoss(props.element, props.all, index, diameter, draft())
    if (!r.ok) { setNote({ ok: false, text: r.error }); return }
    useElementsStore.getState().addElements([r.element])
    setNote({ ok: true, text: `Added "${String(r.element["name"])}": volume ${fmt(r.volume)} mm³ (${r.volumeChange > 0 ? "+" : ""}${fmt(r.volumeChange)}).` })
  }
  const [nurbsMoves, setNurbsMoves] = createSignal<Readonly<Record<number, number>>>({})
  const changeNurbs = (index: number, how: Parameters<typeof editElementNurbs>[3]) => {
    const r = editElementNurbs(props.element, props.all, index, how)
    if (!r.ok) { setNote({ ok: false, text: r.error }); return }
    useElementsStore.getState().addElements([r.element])
    setNote({ ok: true, text: `Added "${String(r.element["name"])}": volume ${fmt(r.volume)} mm³ (${r.volumeChange > 0 ? "+" : ""}${fmt(r.volumeChange)})${r.deviation !== undefined ? `; approximate, the new face is within ${fmt(Math.max(r.deviation, 0.0001))} mm of the exact one` : ""}.` })
  }
  const [filletRadii, setFilletRadii] = createSignal<Readonly<Record<number, number>>>({})
  const changeFillet = (index: number, radius: number) => {
    const r = editElementFillet(props.element, props.all, index, radius)
    if (!r.ok) { setNote({ ok: false, text: r.error }); return }
    useElementsStore.getState().addElements([r.element])
    setNote({ ok: true, text: `Added "${String(r.element["name"])}": volume ${fmt(r.volume)} mm³ (${r.volumeChange > 0 ? "+" : ""}${fmt(r.volumeChange)}).` })
  }
  createEffect(on(() => props.element, () => { setSizes({}); setBossSizes({}); setFilletRadii({}); setNurbsMoves({}); setDraft(0); setNote(undefined) }))
  const exportStep = () => {
    const out = elementStep(props.element, props.all)
    if (!("step" in out)) { alert(t("cad.exact.noModel", { reason: out.reason })); return }
    downloadFile({ name: `${String(props.element["name"] ?? props.element["type"] ?? "part")}.step`, data: out.step, mime: "application/step" })
  }
  return (
    <PanelCard title={t("cad.exactModel")} testId="exact-model-panel" actions={<>
          <button type="button" class="panel-btn" disabled={busy()} onClick={run}>{busy() ? "Analysing…" : "Analyse"}</button>
          <button type="button" class="panel-btn" onClick={exportStep}>STEP</button>
    </>}>
      <Show when={analysis()}>
        {(a) => (
          <Show when={a().ok ? a() : undefined} fallback={<p class="text-xs text-amber-700 dark:text-amber-300" data-testid="exact-reason">Mesh only: {(a() as { reason: string }).reason}</p>}>
            {(ok) => {
              const v = ok() as Extract<ExactAnalysis, { ok: true }>
              return (
                <dl class="panel-kv" data-testid="exact-stats">
                  <dt>{t("cad.exact.volume")}</dt><dd>{fmt(v.volume)} mm³</dd>
                  <dt>{t("cad.exact.surfaceArea")}</dt><dd>{fmt(v.area)} mm²</dd>
                  <dt>{t("cad.exact.centreOfMass")}</dt><dd>{fmt(v.centroid.x)}, {fmt(v.centroid.y)}, {fmt(v.centroid.z)}</dd>
                  <dt>{t("cad.exact.topology")}</dt><dd>{v.faces} / {v.edges} / {v.vertices}</dd>
                  <dt>{t("cad.exact.throughHoles")}</dt><dd>{v.holes ?? "–"}</dd>
                  <dt>{t("cad.exact.holesRecognised")}</dt><dd data-testid="exact-drilled">{v.drilled.length === 0 ? "–" : v.drilled.map((h) => `Ø${fmt(h.diameter)}${h.form === "simple" ? "" : ` ${h.form}`} × ${fmt(h.depth)}`).join(", ")}</dd>
                  <dt>{t("cad.cam")}</dt>
                  <dd data-testid="exact-machining">{v.machining.prismatic ? `By features: ${v.machining.holes} holes, ${v.machining.pockets} pockets${v.machining.islands ? ` (${v.machining.islands} islands)` : ""}, ${v.machining.outlines} outlines${v.machining.sideHoles ? `; ${v.machining.sideHoles} holes along other axes are left to their own setup` : ""}${v.machining.hiddenFaces ? `; ${v.machining.hiddenFaces} faces hidden from above are left to their own setup` : ""}` : `3D surface job: ${v.machining.reason}`}</dd>
                  <dt>{t("cad.exact.surfaces")}</dt><dd><For each={Object.entries(v.surfaces)}>{([k, n]) => <span class="mr-1">{k} {n}</span>}</For></dd>
                  <dt>{t("cad.exact.validSolid")}</dt><dd class={v.valid ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{v.valid ? "yes" : `no: ${v.issues.join("; ")}`}</dd>
                </dl>
              )
            }}
          </Show>
        )}
      </Show>
      <Show when={analysis()}>
        {(a) => (
          <Show when={a().ok ? (a() as Extract<ExactAnalysis, { ok: true }>) : undefined}>
            {(ok) => (
              <Show when={ok().drilled.length > 0 || ok().bosses.length > 0 || ok().fillets.length > 0 || ok().nurbsFaces.length > 0}>
                <div class="mt-2 space-y-1 text-xs" data-testid="exact-hole-edit">
                  <p class="font-medium">{t("cad.exact.editHint")}</p>
                  <div class="space-y-0.5">
                    <div>Draft angle (°, 0 = straight)</div>
                    <div class="w-24"><NumberField id="exact-draft" value={draft()} accept={(x) => x >= 0 && x <= 30} onValue={setDraft} /></div>
                  </div>
                  <For each={ok().drilled}>{(h, i) => (
                    <div class="space-y-0.5" data-hole={i()}>
                      <div>Hole #{i() + 1} Ø{fmt(h.diameter)} × {fmt(h.depth)}</div>
                      <div class="flex items-center gap-1">
                      <div class="w-24"><NumberField id={`exact-hole-${i()}`} value={sizes()[i()] ?? h.diameter} onValue={(x) => setSizes({ ...sizes(), [i()]: x })} /></div>
                      <button type="button" class="panel-btn" data-testid="exact-hole-resize" onClick={() => changeHole(i(), { kind: "resize", diameter: sizes()[i()] ?? h.diameter })}>{t("cad.exact.resize")}</button>
                      <button type="button" class="panel-btn" data-testid="exact-hole-fill" onClick={() => changeHole(i(), { kind: "fill" })}>{t("cad.exact.fill")}</button>
                      </div>
                    </div>
                  )}</For>
                  <For each={ok().bosses}>{(x, i) => (
                    <div class="space-y-0.5" data-boss={i()}>
                      <div>Boss #{i() + 1} Ø{fmt(x.diameter)} × {fmt(x.length)}</div>
                      <div class="flex items-center gap-1">
                        <div class="w-24"><NumberField id={`exact-boss-${i()}`} value={bossSizes()[i()] ?? x.diameter} onValue={(d) => setBossSizes({ ...bossSizes(), [i()]: d })} /></div>
                        <button type="button" class="panel-btn" data-testid="exact-boss-resize" onClick={() => changeBoss(i(), bossSizes()[i()] ?? x.diameter)}>{t("cad.exact.resize")}</button>
                      </div>
                    </div>
                  )}</For>
                  <For each={ok().fillets}>{(x, i) => (
                    <div class="space-y-0.5" data-fillet={i()}>
                      <div>Fillet #{i() + 1} R{fmt(x.radius)}{x.convex ? "" : " (inside)"} × {fmt(x.length)}</div>
                      <div class="flex items-center gap-1">
                        <div class="w-24"><NumberField id={`exact-fillet-${i()}`} value={filletRadii()[i()] ?? x.radius} accept={(r) => r > 0} onValue={(r) => setFilletRadii({ ...filletRadii(), [i()]: r })} /></div>
                        <button type="button" class="panel-btn" data-testid="exact-fillet-resize" onClick={() => changeFillet(i(), filletRadii()[i()] ?? x.radius)}>{t("cad.exact.setRadius")}</button>
                      </div>
                    </div>
                  )}</For>
                  <For each={ok().nurbsFaces}>{(x, i) => (
                    <div class="space-y-0.5" data-nurbs={i()}>
                      <div>Free-form face #{i() + 1} (normal {fmt(x.normal.x)}, {fmt(x.normal.y)}, {fmt(x.normal.z)})</div>
                      <div class="flex items-center gap-1">
                        <div class="w-24"><NumberField id={`exact-nurbs-${i()}`} value={nurbsMoves()[i()] ?? 1} accept={(d) => d !== 0} onValue={(d) => setNurbsMoves({ ...nurbsMoves(), [i()]: d })} /></div>
                        <button type="button" class="panel-btn" data-testid="exact-nurbs-move" onClick={() => changeNurbs(i(), nurbsMoves()[i()] ?? 1)}>{t("cad.move")}</button>
                        <button type="button" class="panel-btn" data-testid="exact-nurbs-offset" title={t("cad.exact.alongNormals")} onClick={() => changeNurbs(i(), { mode: "offset", distance: nurbsMoves()[i()] ?? 1 })}>{t("cad.offset")}</button>
                        <button type="button" class="panel-btn" data-testid="exact-nurbs-draft" title={t("cad.exact.aboutZ")} disabled={draft() === 0} onClick={() => changeNurbs(i(), { mode: "draft", angle: draft() })}>{t("cad.titleBlock.option.draft")}</button>
                      </div>
                    </div>
                  )}</For>
                  <Show when={note()}>{(n) => <p class={n().ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"} role={n().ok ? "status" : "alert"} data-testid="exact-hole-message">{n().text}</p>}</Show>
                </div>
              </Show>
            )}
          </Show>
        )}
      </Show>
    </PanelCard>
  )
}
