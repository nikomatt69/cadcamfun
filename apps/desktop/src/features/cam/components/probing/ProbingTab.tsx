/**
 * The Probing tab of the CAM inspector (spec 73 §4): cycles (add, list, edit), work offsets of the machine, the inspection result
 * and the program of the selected cycle. The tab owns no probing logic: cycles are toolpaths in the multi-toolpath store, results
 * are in the probing store, and everything that asks the sidecar goes through the `ProbingController`.
 */
import { For, Show, createEffect, createMemo, on, type JSX } from "solid-js"
import { Crosshair, Gauge, ListChecks, Terminal } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { Badge, Note, PanelSection } from "../../../../shared/components/panel/ui.tsx"
import { useCamStore } from "../../store/camStore.ts"
import { useInspectionStore } from "../../store/inspectionStore.ts"
import { useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import { freshProgram, freshResult, useProbingStore, type ProbingSection } from "../../store/probingStore.ts"
import { useWorkOffsetStore } from "../../store/workOffsetStore.ts"
import type { MachineProfile } from "../../lib/probing/contract.ts"
import { probeCycles, type ProbeToolpath } from "../../lib/probing/cycles.ts"
import type { PaletteEntry } from "../../lib/probing/cycle-palette.data.ts"
import { planLocal, type ProbeOperation } from "../../lib/probing/operation.ts"
import type { ProbeTarget } from "../../lib/probing/probe-targets.ts"
import { summarizeInspection } from "../../lib/probing/inspection.ts"
import type { RunCalibration } from "../../lib/probing/result.ts"
import type { ProbingDefaults } from "../../../../shared/state/settings.ts"
import type { OffsetScope } from "../../store/workOffsetStore.ts"
import { InspectionList } from "./InspectionList.tsx"
import { ProbeContactList } from "./ProbeContactList.tsx"
import { ProbeCycleEditor } from "./ProbeCycleEditor.tsx"
import { ProbeCycleList } from "./ProbeCycleList.tsx"
import { ProbeCyclePalette } from "./ProbeCyclePalette.tsx"
import { ProbeProgramPreview, type DialectOption } from "./ProbeProgramPreview.tsx"
import { WorkOffsetTable } from "./WorkOffsetTable.tsx"
import { StatusPill } from "./StatusPill.tsx"
import "../../styles/probing.css"

/** What the tab asks of its host: the machine, the part's features and every action that changes something outside the panel. */
export interface ProbingController {
  readonly profile: () => MachineProfile | undefined
  readonly machine: () => { readonly id: string; readonly name: string; readonly stored: boolean } | undefined
  readonly defaults: () => ProbingDefaults
  readonly targets: () => ReadonlyArray<ProbeTarget>
  readonly setups: () => ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly dialects: () => ReadonlyArray<DialectOption>
  add(entry: PaletteEntry): void
  update(id: string, patch: Partial<ProbeOperation>): void
  remove(id: string): void
  duplicate(id: string): void
  move(id: string, direction: -1 | 1): void
  toggleVisible(id: string): void
  pick(): void
  /** A pick on the model: the nearest feature fills the selected cycle and ends the pick. */
  pickHit(hit: { readonly point: { readonly x: number; readonly y: number; readonly z: number }; readonly normal: { readonly x: number; readonly y: number; readonly z: number } }): void
  applyTarget(id: string, target: ProbeTarget): void
  generate(id: string): Promise<void>
  simulate(id: string): Promise<void>
  insert(nc: string): void
  loadOffsets(setupId?: string): Promise<void>
  saveOffsets(): Promise<void>
  applyMeasured(id: string): void
  saveReport(id: string): Promise<void>
  /** What the selected run calibrated, when it can be written to the machine. */
  calibrationOf(id: string): RunCalibration | undefined
  applyCalibration(id: string): Promise<void>
  /** Opens a stored report of the project for reading (`undefined`: back to the run of the selected cycle). */
  openReport(id: string | undefined): Promise<void>
}

const SECTION_ICON = { cycles: Crosshair, offsets: Gauge, inspection: ListChecks, program: Terminal } as const

export function ProbingTab(props: { readonly controller: ProbingController }): JSX.Element {
  const c = props.controller
  const probing = useProbingStore()
  const toolpaths = useMultiToolpathStore()
  const inspection = useInspectionStore()
  const offsets = useWorkOffsetStore()
  const cam = useCamStore()
  const cycles = createMemo(() => probeCycles({ toolpaths: toolpaths.toolpaths }))
  const selected = createMemo<ProbeToolpath | undefined>(() => cycles().find((cycle) => cycle.id === probing.selectedId))
  const resultOf = (cycle: ProbeToolpath) => freshResult(probing.results, cycle.id, cycle.probe)
  const run = createMemo(() => inspection.opened ?? (selected() === undefined ? undefined : resultOf(selected()!)))
  const program = createMemo(() => { const s = selected(); return s === undefined ? undefined : probing.programs[s.id] })
  const stale = () => { const s = selected(); const p = program(); return s !== undefined && p !== undefined && freshProgram(probing.programs, s.id, s.probe) === undefined }
  const dialect = () => probing.dialect ?? c.profile()?.post ?? "fanuc"
  const toggle = (section: ProbingSection) => () => probing.toggleSection(section)
  // The palette is taller than the panel: a new cycle would open out of sight and the click would seem to do nothing.
  let editorEl: HTMLDivElement | undefined
  const revealEditor = () => queueMicrotask(() => editorEl?.scrollIntoView?.({ block: "start", behavior: "smooth" }))
  const contactLines = createMemo(() => new Set((run()?.outcome.contacts ?? []).flatMap((contact) => contact.line === undefined ? [] : [contact.line])))
  const summary = (): string | undefined => {
    const r = run()
    if (r === undefined) return undefined
    const s = summarizeInspection(r.verdicts)
    return s.total === 0 ? t(`cam.probing.status.${r.verdict}` as never) : t("cam.probing.inspection.short", { fail: s.fail, warn: s.warn, total: s.total })
  }
  const probeSummary = () => {
    const p = c.profile()?.probing
    const diameter = p === undefined ? undefined : p.stylusDiameter ?? (p.stylusRadius !== undefined ? p.stylusRadius * 2 : undefined)
    return diameter === undefined ? t("cam.probing.noProbe") : t("cam.probing.probeSummary", { diameter: Number(diameter.toFixed(3)), calibrated: p?.calibration !== undefined ? t("cam.probing.calibratedShort") : t("cam.probing.uncalibrated") })
  }
  const machine = () => c.machine()
  // The table is read from the machine when the section is opened (and again when another machine is picked).
  createEffect(on(() => [probing.open.offsets, machine()?.id, machine()?.stored] as const, ([open, id, stored]) => {
    if (open && id !== undefined && stored === true && offsets.machineConfigId !== id) void c.loadOffsets()
  }))

  // The machine's table changed elsewhere (a live event): read it again unless the user has unsaved edits, which then see a conflict.
  createEffect(on(() => offsets.stale, (stale) => {
    if (!stale || machine()?.stored !== true || offsets.machineConfigId === undefined) return
    if (offsets.changes().length === 0) void c.loadOffsets(offsets.setupId)
    else offsets.setConflict(true)
  }))

  return (
    <div class="panel probing-tab" data-testid="probing-tab">
      <header class="panel-header">
        <div>
          <h2 class="panel-header__title">{t("cam.probing.title")}</h2>
          <p class="panel-header__sub" data-testid="probing-machine">{machine()?.name ?? t("cam.probing.noMachine")} · {probeSummary()}</p>
        </div>
        <Show when={probing.progress?.phase === "running"}><Badge tone="warn" testId="probing-progress">{t("cam.probing.running", { index: probing.progress?.index ?? 0, count: probing.progress?.count ?? 0 })}</Badge></Show>
      </header>
      <Show when={probing.remote}>{(remote) => (
        <Note kind={remote().verdict === "fail" || remote().verdict === "missed" ? "warn" : "info"} testId="probing-remote">
          <p>{t("cam.probing.remote.result", { verdict: t(`cam.probing.status.${remote().verdict}` as never), failed: remote().failed, checks: remote().checks })}</p>
          <div class="probing-row-actions">
            <Show when={remote().reportId}>{(id) => <button type="button" class="panel-btn panel-btn--fit" data-testid="probing-remote-open" onClick={() => { void c.openReport(id()); probing.setRemote(undefined) }}>{t("cam.probing.remote.open")}</button>}</Show>
            <button type="button" class="panel-btn panel-btn--fit" data-testid="probing-remote-dismiss" onClick={() => probing.setRemote(undefined)}>{t("cam.probing.remote.dismiss")}</button>
          </div>
        </Note>
      )}</Show>
      <Show when={probing.error}>{(message) => <Note kind="bad" role="alert" testId="probing-error">{message()}</Note>}</Show>

      <PanelSection id="probing-cycles" icon={SECTION_ICON.cycles} title={t("cam.probing.section.cycles")} open={probing.open.cycles} onToggle={toggle("cycles")} testId="probing-section-cycles"
        summary={t("cam.probing.cycles.count", { count: cycles().length })}>
        <ProbeCyclePalette profile={c.profile()} onAdd={(entry) => { c.add(entry); revealEditor() }} />
        <ProbeCycleList cycles={cycles()} selectedId={probing.selectedId} resultOf={resultOf}
          onSelect={(id) => probing.select(id)} onToggleVisible={(id) => c.toggleVisible(id)} onMove={(id, dir) => c.move(id, dir)}
          onDuplicate={(id) => c.duplicate(id)} onRemove={(id) => c.remove(id)} />
        <div ref={editorEl} data-testid="probe-editor-anchor" />
        <Show when={selected()}>{(cycle) => (
          <ProbeCycleEditor id={cycle().id} operation={cycle().probe} profile={c.profile()} defaults={c.defaults()} targets={c.targets()} picking={probing.picking}
            onChange={(patch) => c.update(cycle().id, patch)} onPick={c.pick} onTarget={(target) => c.applyTarget(cycle().id, target)} />
        )}</Show>
      </PanelSection>

      <PanelSection id="probing-offsets" icon={SECTION_ICON.offsets} title={t("cam.probing.section.offsets")} open={probing.open.offsets} onToggle={toggle("offsets")} testId="probing-section-offsets"
        summary={offsets.rows.length > 0 ? t("cam.probing.offsets.count", { count: offsets.rows.length }) : undefined}>
        <WorkOffsetTable profile={c.profile()} stored={machine()?.stored ?? false} setups={c.setups()}
          onSave={() => void c.saveOffsets()} onReload={() => void c.loadOffsets(offsets.setupId)}
          onScope={(scope: OffsetScope, setupId?: string) => void c.loadOffsets(scope === "setup" ? setupId : undefined)} />
        <Show when={selected() !== undefined && (run()?.outcome.updates.length ?? 0) > 0}>
          <button type="button" class="panel-btn" data-testid="offsets-apply-measured" onClick={() => c.applyMeasured(selected()!.id)}>{t("cam.probing.offsets.applyMeasured")}</button>
        </Show>
      </PanelSection>

      <PanelSection id="probing-inspection" icon={SECTION_ICON.inspection} title={t("cam.probing.section.inspection")} open={probing.open.inspection} onToggle={toggle("inspection")} testId="probing-section-inspection"
        {...(summary() !== undefined ? { summary: summary()! } : {})}>
        <Show when={run()}>{(r) => (
          <p class="probing-run" data-testid="inspection-verdict"><StatusPill status={r().verdict} /><span class="panel-hint">{t(`cam.probing.runSource.${r().source}` as never)}</span></p>
        )}</Show>
        <Show when={inspection.history.length > 0}>
          <select class="panel-input" aria-label={t("cam.probing.inspection.history")} data-testid="inspection-history" value=""
            onChange={(event) => { const id = event.currentTarget.value; event.currentTarget.value = ""; if (id !== "") void c.openReport(id) }}>
            <option value="">{t("cam.probing.inspection.history")}</option>
            <For each={inspection.history}>{(entry) => <option value={entry.id}>{entry.name} · {entry.verdict}</option>}</For>
          </select>
        </Show>
        <Show when={run()}>{(r) => <ProbeContactList contacts={r().outcome.contacts} expected={r().expected} highlighted={probing.highlight} onHighlight={(index) => probing.setHighlight(index)} />}</Show>
        <Show when={selected() !== undefined && inspection.opened === undefined && run() !== undefined ? c.calibrationOf(selected()!.id) : undefined}>{(found) => (
          <div class="probing-row-actions">
            <p class="panel-hint" data-testid="probing-calibration">{found().kind === "rotary" ? t("cam.probing.calibration.rotary") : t("cam.probing.calibration.stylus")}</p>
            <button type="button" class="panel-btn panel-btn--fit" data-testid="probing-apply-calibration" disabled={machine()?.stored !== true || probing.busy !== undefined} onClick={() => void c.applyCalibration(selected()!.id)}>{t("cam.probing.calibration.apply")}</button>
          </div>
        )}</Show>
        <InspectionList verdicts={run()?.verdicts ?? []} warnShare={inspection.warnShare} selected={inspection.selected}
          title={selected()?.probe.name ?? "inspection"} onSelect={(name) => inspection.select(name)}
          onSave={selected() !== undefined && run() !== undefined ? () => void c.saveReport(selected()!.id) : undefined} saved={run()?.reportId !== undefined} />
      </PanelSection>

      <PanelSection id="probing-program" icon={SECTION_ICON.program} title={t("cam.probing.section.program")} open={probing.open.program} onToggle={toggle("program")} testId="probing-section-program">
        <Show when={selected()} fallback={<p class="panel-empty">{t("cam.probing.program.select")}</p>}>{(cycle) => (
          <ProbeProgramPreview program={program()} stale={stale()} dialect={dialect()} dialects={c.dialects()} busy={probing.busy} showIn3d={probing.showIn3d} contactLines={contactLines()} misplacement={probing.misplacement} onMisplacement={(patch) => probing.setMisplacement(patch)}
            nativeStyle={c.profile()?.probing?.macroStyle} native={cycle().probe.native === true} onNative={(native) => c.update(cycle().id, { native })}
            disabled={!planLocal(cycle().probe, { profile: c.profile(), defaults: c.defaults() }).ok} onDialect={(id) => probing.setDialect(id)} onGenerate={() => void c.generate(cycle().id)} onSimulate={() => void c.simulate(cycle().id)}
            onShow3d={(show) => { probing.setShowIn3d(show); if (show) cam.setActiveTab("toolpath") }} onInsert={(nc) => c.insert(nc)} />
        )}</Show>
      </PanelSection>
      <Show when={cam.gcode !== "" && selected() === undefined}><p class="panel-hint">{t("cam.probing.hint.legacy")}</p></Show>
    </div>
  )
}

