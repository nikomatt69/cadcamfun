/**
 * The simulation hub of the editor (spec 48): finite-element studies on the selected solid (static stress, steady and transient
 * thermal, thermal stress, natural frequencies, buckling, machining load), assembly interference and clearance, and mass
 * properties. The kernels are the ones the assistant runs (`cad.simulate`, `cad.assembly`); the numbers here are the numbers it quotes.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { fea } from "@cadcamfun/core"
import { X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { Field, Grid, Group, NumberField, Note, Segmented, INPUT } from "../../../shared/components/panel/ui.tsx"
import { useElementsStore } from "../store/elementsStore.ts"
import CADCanvas from "./CADCanvas.tsx"
import {
  DEFAULT_FEM, cuttingMaterials, cuttingResultant, femStudy, fieldsOf, interferenceStudy, massStudy, partGeometry, projectResult, solidParts,
  type Axis, type FemForm, type FieldName, type InterferenceSummary, type MassSummary, type SimKind, type View
} from "../lib/simulation.ts"

const ANALYSES: ReadonlyArray<FemForm["analysis"]> = ["static", "thermal_stress", "thermal", "transient_thermal", "modal", "buckling"]
const SWEEP = ["steel-s235", "steel-c45", "stainless-304", "aluminium-6061-t6", "aluminium-7075-t6", "titanium-ti6al4v", "brass-c360", "abs"]
const AXES: ReadonlyArray<Axis> = ["x", "y", "z"]
const f = (v: number, d = 2): string => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toPrecision(d + 1))
const BTN = "px-3 py-1.5 rounded-lg text-sm font-medium border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] hover:bg-[color:var(--ent-surface-subtle)] disabled:opacity-50"
const BTN_PRIMARY = "px-3 py-1.5 rounded-lg text-sm font-semibold text-[color:var(--ent-action-text)] bg-[color:var(--ent-action)] hover:bg-[color:var(--ent-action-hover)] disabled:opacity-50"

const fieldKey = (name: FieldName) => `sim.f.${name}` as const
const analysisKey = (a: FemForm["analysis"]) => `sim.an.${a}` as const

export default function SimulationPanel(): JSX.Element {
  const elements = useElementsStore()
  const [tab, setTab] = createSignal<SimKind>("fem")
  const [form, setForm] = createSignal<FemForm>(DEFAULT_FEM)
  const patch = (p: Partial<FemForm>) => setForm({ ...form(), ...p })
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal<string | undefined>()
  const [result, setResult] = createSignal<fea.StudyResult | undefined>()
  const [findings, setFindings] = createSignal<ReadonlyArray<fea.Finding>>([])
  const [convergence, setConvergence] = createSignal<fea.ConvergenceReport | undefined>()
  const [sweep, setSweep] = createSignal<fea.MaterialSweep | undefined>()
  const [field, setField] = createSignal<FieldName>("vonMises")
  const [mode, setMode] = createSignal(0)
  const [deform, setDeform] = createSignal(true)
  const [view, setView] = createSignal<View>({ yaw: 0.7, pitch: 0.55, zoom: 1 })
  const [interference, setInterference] = createSignal<InterferenceSummary | undefined>()
  const [mass, setMass] = createSignal<MassSummary | { readonly reason: string } | undefined>()
  let canvas: HTMLCanvasElement | undefined
  let host: HTMLDivElement | undefined

  const all = (): ReadonlyArray<Record<string, unknown>> => elements.elements as unknown as ReadonlyArray<Record<string, unknown>>
  const selected = (): Record<string, unknown> | null => elements.selectedElement as unknown as Record<string, unknown> | null
  const cutting = cuttingMaterials()
  const materials = fea.MATERIALS

  /** Lets the "solving" state paint before the (synchronous) solver takes the thread. */
  const work = async (job: () => void): Promise<void> => {
    setBusy(true); setMessage(undefined)
    await new Promise((resolve) => setTimeout(resolve, 30))
    try { job() } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) }
  }

  const prepare = (): { study: fea.Study } | undefined => {
    const el = selected()
    if (el === null) { setMessage(t("sim.noPart")); return undefined }
    const g = partGeometry(el, all())
    if ("reason" in g) { setMessage(t("sim.noSolid", { reason: g.reason })); return undefined }
    return { study: femStudy({ ...form(), cutMaterial: form().cutMaterial || cutting.find((m) => m.name.toLowerCase().includes("alum"))?.id || cutting[0]?.id || "" }, g) }
  }

  const show = (study: fea.Study, r: fea.StudyResult) => {
    setResult(r); setFindings(fea.review(study, r)); setMode(0)
    const fields = fieldsOf(r)
    setField(fields[0] ?? "vonMises")
  }

  const run = () => work(() => {
    const p = prepare(); if (p === undefined) return
    setConvergence(undefined); setSweep(undefined)
    const r = fea.runStudy(p.study)
    if (!r.ok) { setMessage(t("sim.refused", { message: r.message })); return }
    show(p.study, r)
  })

  const converge = () => work(() => {
    const p = prepare(); if (p === undefined) return
    const c = fea.converge(p.study, { levels: 3, factor: 1.5 })
    if (!c.ok) { setMessage(t("sim.refused", { message: c.message })); return }
    setSweep(undefined); setConvergence(c); show(p.study, c.result)
  })

  const compare = () => work(() => {
    const p = prepare(); if (p === undefined) return
    const s = fea.compareMaterials({ ...p.study, mesh: { ...p.study.mesh, size: p.study.mesh.size * 1.6 } }, SWEEP, 2)
    if (!s.ok) { setMessage(t("sim.refused", { message: s.message })); return }
    setConvergence(undefined); setSweep(s)
  })

  const checkInterference = () => work(() => { setInterference(interferenceStudy(solidParts(all()))) })
  const computeMass = () => work(() => {
    const el = selected()
    if (el === null) { setMessage(t("sim.noPart")); return }
    const part = solidParts([el, ...all().filter((e) => e["id"] !== el["id"])]).find((p) => p.id === String(el["id"]))
    if (part === undefined) { setMessage(t("sim.noSolid", { reason: String(el["type"] ?? "") })); return }
    setMass(massStudy(part, form().material))
  })

  // ---------------------------------------------------------------- canvas
  const draw = () => {
    const r = result()
    if (canvas === undefined || host === undefined || r === undefined) return
    const dpr = window.devicePixelRatio || 1, w = host.clientWidth, h = host.clientHeight
    if (w === 0 || h === 0) return
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext("2d")
    if (ctx === null) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const drawn = projectResult(r, field(), mode(), view(), deform() ? 1 : 0, w, h)
    ctx.lineJoin = "round"; ctx.lineWidth = 0.6
    for (const tri of drawn.triangles) {
      const p = tri.points
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath()
      ctx.fillStyle = tri.color; ctx.strokeStyle = tri.color; ctx.fill(); ctx.stroke()
    }
    const reversed = field() === "safety"
    const bar = ctx.createLinearGradient(0, h - 150, 0, h - 20)
    const stops = [0, 0.25, 0.5, 0.75, 1]
    for (const s of stops) bar.addColorStop(s, `hsl(${(reversed ? 1 - s : s) * 240},75%,50%)`)
    ctx.fillStyle = bar; ctx.fillRect(w - 28, h - 150, 12, 130)
    ctx.fillStyle = "#9ca3af"; ctx.font = "11px system-ui"; ctx.textAlign = "right"
    ctx.fillText(f(drawn.max), w - 32, h - 140); ctx.fillText(f(drawn.min), w - 32, h - 22)
  }
  createEffect(() => { result(); field(); mode(); deform(); view(); requestAnimationFrame(draw) })
  onMount(() => {
    const ro = new ResizeObserver(() => draw())
    if (host !== undefined) ro.observe(host)
    onCleanup(() => ro.disconnect())
  })

  let drag: { x: number; y: number } | undefined
  const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const move = (e: PointerEvent) => {
    if (drag === undefined) return
    const v = view()
    setView({ ...v, yaw: v.yaw + (e.clientX - drag.x) * 0.01, pitch: Math.max(-1.5, Math.min(1.5, v.pitch + (e.clientY - drag.y) * 0.01)) })
    drag = { x: e.clientX, y: e.clientY }
  }
  const up = () => { drag = undefined }
  const wheel = (e: WheelEvent) => { e.preventDefault(); const v = view(); setView({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9))) }) }

  const fields = createMemo(() => { const r = result(); return r === undefined ? [] : fieldsOf(r) })
  const modeCount = createMemo(() => { const r = result(); return r === undefined ? 0 : (r.modes?.filter((m) => !m.rigid).length ?? r.buckling?.length ?? 0) })
  const a = () => form().analysis
  const needsSupport = () => a() === "static" || a() === "buckling" || a() === "modal" || a() === "thermal_stress" || a() === "transient_thermal"
  const hasLoad = () => a() === "static" || a() === "buckling"
  const thermalFaces = () => a() === "thermal" || a() === "thermal_stress" || a() === "transient_thermal"

  const faceChoice = () => `${form().fixedAxis}${form().fixedSide}`
  const setFace = (v: string) => patch({ fixedAxis: v[0] as Axis, fixedSide: v.slice(1) as "min" | "max" })
  const loadChoice = () => `${form().loadSign > 0 ? "+" : "-"}${form().loadAxis}`
  const setLoad = (v: string) => patch({ loadSign: v[0] === "+" ? 1 : -1, loadAxis: v[1] as Axis })

  const controls = (): JSX.Element => (
    <div class="space-y-3">
      <Field label={t("sim.analysis")}>
        <select class={INPUT} value={form().analysis} onChange={(e) => patch({ analysis: e.currentTarget.value as FemForm["analysis"] })}>
          <For each={ANALYSES}>{(an) => <option value={an}>{t(analysisKey(an))}</option>}</For>
        </select>
      </Field>
      <Field label={t("sim.material")}>
        <select class={INPUT} value={form().material} onChange={(e) => patch({ material: e.currentTarget.value })}>
          <For each={materials}>{(m) => <option value={m.id}>{m.name}</option>}</For>
        </select>
      </Field>
      <Show when={needsSupport()}>
        <Field label={t("sim.fixedFace")}>
          <select class={INPUT} value={faceChoice()} onChange={(e) => setFace(e.currentTarget.value)}>
            <For each={AXES}>{(ax) => <><option value={`${ax}min`}>{`−${ax.toUpperCase()}`}</option><option value={`${ax}max`}>{`+${ax.toUpperCase()}`}</option></>}</For>
          </select>
        </Field>
      </Show>
      <Show when={hasLoad()}>
        <Segmented value={form().loadMode} label={t("sim.force")} options={[["force", t("sim.loadMode.force")], ["cutting", t("sim.loadMode.cutting")]]} onChange={(v) => patch({ loadMode: v })} />
        <Field label={t("sim.loadDir")}>
          <select class={INPUT} value={loadChoice()} onChange={(e) => setLoad(e.currentTarget.value)}>
            <For each={AXES}>{(ax) => <><option value={`-${ax}`}>{`−${ax.toUpperCase()}`}</option><option value={`+${ax}`}>{`+${ax.toUpperCase()}`}</option></>}</For>
          </select>
        </Field>
        <Show when={form().loadMode === "force"} fallback={
          <Group>
            <Field label={t("sim.cutMaterial")}>
              <select class={INPUT} value={form().cutMaterial || cutting.find((m) => m.name.toLowerCase().includes("alum"))?.id} onChange={(e) => patch({ cutMaterial: e.currentTarget.value })}>
                <For each={cutting}>{(m) => <option value={m.id}>{m.name}</option>}</For>
              </select>
            </Field>
            <Grid cols={3}>
              <Field label={t("sim.ap")}><NumberField value={form().ap} onValue={(v) => patch({ ap: v })} /></Field>
              <Field label={t("sim.fz")}><NumberField value={form().fz} onValue={(v) => patch({ fz: v })} /></Field>
              <Field label={t("sim.teeth")}><NumberField value={form().teeth} int onValue={(v) => patch({ teeth: v })} /></Field>
            </Grid>
            <Note kind="info">{t("sim.cutForce", { force: f(cuttingResultant({ ...form(), cutMaterial: form().cutMaterial || cutting.find((m) => m.name.toLowerCase().includes("alum"))?.id || "" })) })}</Note>
          </Group>
        }>
          <Field label={t("sim.force")}><NumberField value={form().forceN} onValue={(v) => patch({ forceN: v })} /></Field>
        </Show>
      </Show>
      <Show when={thermalFaces()}>
        <Show when={a() === "thermal_stress"}>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={form().useUniform} onChange={(e) => patch({ useUniform: e.currentTarget.checked })} />{t("sim.useUniform")}</label>
        </Show>
        <Show when={a() === "thermal_stress" && form().useUniform} fallback={
          <Grid cols={2}>
            <Field label={t("sim.hot")}><NumberField value={form().hot} accept={() => true} onValue={(v) => patch({ hot: v })} /></Field>
            <Field label={t("sim.cold")}><NumberField value={form().cold} accept={() => true} onValue={(v) => patch({ cold: v })} /></Field>
          </Grid>
        }>
          <Field label={t("sim.uniform")}><NumberField value={form().uniform} accept={() => true} onValue={(v) => patch({ uniform: v })} /></Field>
        </Show>
        <Show when={a() !== "thermal"}>
          <Field label={t("sim.reference")}><NumberField value={form().reference} accept={() => true} onValue={(v) => patch({ reference: v })} /></Field>
          <Show when={a() === "thermal_stress"}>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={form().clampOpposite} onChange={(e) => patch({ clampOpposite: e.currentTarget.checked })} />{t("sim.clamp")}</label>
          </Show>
        </Show>
        <Show when={a() === "transient_thermal"}><Field label={t("sim.duration")}><NumberField value={form().duration} onValue={(v) => patch({ duration: v })} /></Field></Show>
      </Show>
      <Show when={a() === "modal" || a() === "buckling"}>
        <Field label={t("sim.modes")}><NumberField value={form().modes} int onValue={(v) => patch({ modes: Math.min(12, v) })} /></Field>
      </Show>
      <Field label={t("sim.size")}><NumberField value={form().size} accept={(v) => v >= 0} onValue={(v) => patch({ size: v })} /></Field>
      <div class="flex flex-wrap gap-2 pt-1">
        <button class={BTN_PRIMARY} disabled={busy()} onClick={run}>{busy() ? t("sim.running") : t("sim.run")}</button>
        <Show when={a() === "static" || a() === "thermal_stress" || a() === "modal" || a() === "thermal" || a() === "buckling"}>
          <button class={BTN} disabled={busy()} onClick={converge}>{t("sim.converge")}</button>
        </Show>
        <Show when={a() === "static" || a() === "thermal_stress" || a() === "modal"}>
          <button class={BTN} disabled={busy()} onClick={compare}>{t("sim.compare")}</button>
        </Show>
      </div>
    </div>
  )

  const summary = (r: fea.StudyResult): JSX.Element => {
    const s = r.summary
    return (
      <ul class="text-sm space-y-0.5">
        <Show when={s.maxVonMises}>{(v) => <li>{t("sim.sum.stress", { value: f(v().value) })}</li>}</Show>
        <Show when={s.maxDisplacement !== undefined && r.modes === undefined && r.buckling === undefined}><li>{t("sim.sum.disp", { value: f(s.maxDisplacement!.value) })}</li></Show>
        <Show when={s.minSafetyFactor}>{(v) => <li>{t("sim.sum.safety", { value: f(v().value) })}</li>}</Show>
        <Show when={s.maxTemperature !== undefined && s.minTemperature !== undefined}><li>{t("sim.sum.temp", { min: f(s.minTemperature!.value), max: f(s.maxTemperature!.value) })}</li></Show>
        <Show when={r.stressTime !== undefined}><li>{t("sim.sum.stressTime", { time: f(r.stressTime!) })}</li></Show>
        <For each={r.modes?.filter((m) => !m.rigid) ?? []}>{(m, i) => <li>{t("sim.sum.freq", { n: i() + 1, value: f(m.frequencyHz) })}</li>}</For>
        <For each={r.buckling ?? []}>{(b, i) => <li>{t("sim.sum.buckling", { n: i() + 1, value: f(b.factor) })}</li>}</For>
        <Show when={s.massKg !== undefined}><li>{t("sim.sum.mass", { value: f(s.massKg!, 3) })}</li></Show>
        <li class="text-[color:var(--ent-text-muted)]">{t("sim.sum.mesh", { elements: r.meshSummary.elements, dofs: r.meshSummary.dofs, ms: r.solver.milliseconds })}</li>
      </ul>
    )
  }

  const femView = (): JSX.Element => (
    <div class="flex h-full min-h-0">
      <div class="w-[300px] shrink-0 overflow-y-auto p-3 border-r border-[color:var(--ent-line)]">{controls()}</div>
      <div class="flex-1 min-w-0 flex flex-col">
        <div class="relative flex-1 min-h-[220px]" ref={host}>
          <Show when={result()} fallback={<CADCanvas width="100%" height="100%" allowDragDrop keyboard={false} />}>
            <canvas ref={canvas} class="absolute inset-0 w-full h-full touch-none cursor-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} />
            <div class="absolute top-2 left-2 flex flex-wrap items-center gap-2 bg-[color:var(--ent-surface)] shadow-sm rounded-lg px-3 py-2 text-xs">
              <span class="text-[color:var(--ent-text-muted)]">{t("sim.field")}</span>
              <select class={INPUT} value={field()} onChange={(e) => setField(e.currentTarget.value as FieldName)}>
                <For each={fields()}>{(n) => <option value={n}>{t(fieldKey(n))}</option>}</For>
              </select>
              <Show when={field() === "mode" && modeCount() > 1}>
                <select class={INPUT} value={String(mode())} onChange={(e) => setMode(Number(e.currentTarget.value))}>
                  <For each={Array.from({ length: modeCount() }, (_, i) => i)}>{(i) => <option value={String(i)}>{t("sim.mode", { n: i + 1 })}</option>}</For>
                </select>
              </Show>
              <label class="flex items-center gap-1"><input type="checkbox" checked={deform()} onChange={(e) => setDeform(e.currentTarget.checked)} />{t("sim.deformed")}</label>
              <button class="p-1 rounded hover:bg-[color:var(--ent-surface-inset)]" aria-label={t("common.close")} onClick={() => { setResult(undefined); setFindings([]) }}><X size={12} aria-hidden="true" /></button>
            </div>
          </Show>
        </div>
        <div class="max-h-[42%] overflow-y-auto p-3 border-t border-[color:var(--ent-line)] space-y-2">
          <Show when={message()}>{(m) => <Note kind="bad" role="alert">{m()}</Note>}</Show>
          <Show when={result()}>{(r) => summary(r())}</Show>
          <Show when={findings().length > 0}>
            <h4 class="mb-1 text-xs font-semibold text-[color:var(--ent-text-muted)]">{t("sim.findings")}</h4>
            <For each={findings()}>{(x) =>
              <Note kind={x.severity === "critical" ? "bad" : x.severity === "warning" ? "warn" : "info"}>
                {x.message}<Show when={x.suggestion}><div class="text-[color:var(--ent-text-muted)]">{t("sim.next", { text: x.suggestion! })}</div></Show>
              </Note>}
            </For>
          </Show>
          <Show when={convergence()}>{(c) =>
            <div class="text-sm">
              <h4 class="mb-1 text-xs font-semibold text-[color:var(--ent-text-muted)]">{t("sim.conv.title")}</h4>
              <For each={c().levels}>{(l) => <div>{t("sim.conv.row", { size: f(l.size), elements: l.elements, value: f(l.value) })}{l.changePercent !== undefined ? ` (${l.changePercent > 0 ? "+" : ""}${l.changePercent}%)` : ""}</div>}</For>
              <Note kind={c().singularity ? "warn" : c().converged ? "ok" : "info"}>{c().advice}</Note>
            </div>}
          </Show>
          <Show when={sweep()}>{(s) =>
            <div class="text-sm">
              <h4 class="mb-1 text-xs font-semibold text-[color:var(--ent-text-muted)]">{t("sim.compare.title")}</h4>
              <For each={s().rows.filter((r) => r.ok)}>{(r) => <div>{t("sim.compare.row", { name: r.name, sf: r.minSafetyFactor !== undefined ? f(r.minSafetyFactor) : "-", mass: r.massKg !== undefined ? f(r.massKg, 3) : "-" })}</div>}</For>
              <Note kind="info">{s().advice}</Note>
            </div>}
          </Show>
          <Show when={result() !== undefined}><p class="text-xs text-[color:var(--ent-text-muted)]">{t("sim.limits")}</p></Show>
        </div>
      </div>
    </div>
  )

  const interferenceView = (): JSX.Element => (
    <div class="p-4 space-y-3 overflow-y-auto h-full">
      <button class={BTN_PRIMARY} disabled={busy()} onClick={checkInterference}>{busy() ? t("sim.running") : t("sim.int.run")}</button>
      <Show when={interference()}>{(s) =>
        <div class="text-sm space-y-1">
          <p>{t("sim.int.parts", { n: s().parts })}</p>
          <Show when={s().clashes.length === 0}><Note kind="ok">{t("sim.int.none")}</Note></Show>
          <For each={s().clashes}>{(c) => <Note kind="bad">{t("sim.int.clash", { a: c.a, b: c.b, volume: f(c.volume) })}</Note>}</For>
          <Show when={s().touching > 0}><p>{t("sim.int.touching", { n: s().touching })}</p></Show>
          <For each={s().undetermined}>{(u) => <Note kind="warn">{t("sim.int.undetermined", { a: u.a, b: u.b, reason: u.reason })}</Note>}</For>
          <For each={s().closest}>{(g) => <p class="text-[color:var(--ent-text-muted)]">{t("sim.int.closest", { a: g.a, b: g.b, distance: f(g.distance) })}</p>}</For>
        </div>}
      </Show>
    </div>
  )

  const massView = (): JSX.Element => (
    <div class="p-4 space-y-3 overflow-y-auto h-full max-w-xl">
      <Field label={t("sim.material")}>
        <select class={INPUT} value={form().material} onChange={(e) => patch({ material: e.currentTarget.value })}>
          <For each={materials}>{(m) => <option value={m.id}>{m.name}</option>}</For>
        </select>
      </Field>
      <button class={BTN_PRIMARY} disabled={busy()} onClick={computeMass}>{t("sim.mass.run")}</button>
      <Show when={message()}>{(m) => <Note kind="bad" role="alert">{m()}</Note>}</Show>
      <Show when={mass()}>{(m) => {
        const v = m()
        return "reason" in v ? <Note kind="bad">{v.reason}</Note> : (
          <div class="text-sm space-y-1">
            <p>{t("sim.mass.volume", { volume: f(v.volumeMm3, 4), area: f(v.areaMm2, 4), mass: f(v.massKg, 4) })}</p>
            <p>{t("sim.mass.centroid", { x: f(v.centroid[0]), y: f(v.centroid[1]), z: f(v.centroid[2]) })}</p>
            <p>{t("sim.mass.inertia", { a: f(v.inertia[0]), b: f(v.inertia[1]), c: f(v.inertia[2]) })}</p>
          </div>)
      }}</Show>
    </div>
  )

  return (
    <div class="h-full flex flex-col pb-10 min-h-0">
      <div class="flex gap-1 px-3 pt-2 border-b border-[color:var(--ent-line)]">
        <For each={[["fem", t("sim.tab.fem")], ["interference", t("sim.tab.interference")], ["mass", t("sim.tab.mass")]] as const}>{([id, label]) =>
          <button class={`px-3 py-1.5 text-sm rounded-t-lg ${tab() === id ? "bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)] font-semibold" : "text-[color:var(--ent-text-muted)]"}`} aria-pressed={tab() === id} onClick={() => { setTab(id); setMessage(undefined) }}>{label}</button>}
        </For>
      </div>
      <div class="flex-1 min-h-0">
        <Show when={tab() === "fem"}>{femView()}</Show>
        <Show when={tab() === "interference"}>{interferenceView()}</Show>
        <Show when={tab() === "mass"}>{massView()}</Show>
      </div>
    </div>
  )
}
