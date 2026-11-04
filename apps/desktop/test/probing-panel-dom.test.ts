/** The Probing tab end to end without a sidecar (spec 73 §4): stores, the offset save with its 409, the controller, and the DOM of the tab. */
import { afterEach, beforeEach, expect, test } from "bun:test"
import { Effect } from "effect"
import { cam } from "@cadcamfun/core"
import "./helpers/dom-global.ts"
import { installDom } from "./helpers/dom.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { DEFAULT_PROBING } from "../src/shared/state/settings.ts"
import { WorkOffsetConflict, makeProbingStoreService, type ProbingService } from "../src/features/cam/api/probing.ts"
import { ToolpathGeneratorError } from "../src/features/cam/api/generator.ts"
import { loadOffsets, saveOffsets } from "../src/features/cam/lib/probing/offset-sync.ts"
import { createProbingController } from "../src/features/cam/hooks/useProbing.ts"
import { useWorkOffsetStore } from "../src/features/cam/store/workOffsetStore.ts"
import { freshProgram, freshResult, useProbingStore } from "../src/features/cam/store/probingStore.ts"
import { useInspectionStore } from "../src/features/cam/store/inspectionStore.ts"
import { useMultiToolpathStore } from "../src/features/cam/store/multiToolpathStore.ts"
import { probeCycles } from "../src/features/cam/lib/probing/cycles.ts"
import { PALETTE } from "../src/features/cam/lib/probing/cycle-palette.data.ts"
import { fingerprintOf, type ProbeRunResult } from "../src/features/cam/lib/probing/result.ts"
import type { InspectionVerdict } from "../src/features/cam/lib/probing/contract.ts"

const MACHINE = { id: "m1", name: "VF-2", type: "mill", config: { post: "fanuc", axes: 3, probing: { stylusDiameter: 4 }, workOffsetTable: { entries: { G54: { x: -300, y: -200, z: -400 } } } } }

/** An in-memory machine table with the revision rule of the sidecar: a write with a stale base is a conflict. */
const fakeService = () => {
  let entries: Record<string, { x: number; y: number; z: number }> = { G54: { x: -300, y: -200, z: -400 } }
  let revision = 1
  const writes: Array<Record<string, unknown>> = []
  const reports: Array<Record<string, unknown>> = []
  const doc = () => ({ machineConfigId: "m1", setupId: null, entries, updatedAt: `2026-11-04T10:00:0${revision}.000Z`, isOwner: true })
  const service: ProbingService = {
    workOffsets: {
      get: () => Effect.succeed(doc() as never),
      put: (_id, body) => {
        if (body.baseUpdatedAt !== undefined && body.baseUpdatedAt !== doc().updatedAt) return Effect.fail(new WorkOffsetConflict({ machineConfigId: "m1", message: "saved elsewhere" }))
        writes.push(body as unknown as Record<string, unknown>)
        entries = body.entries as typeof entries
        revision++
        return Effect.succeed(doc() as never)
      }
    },
    probeConfig: { get: () => Effect.fail(new ToolpathGeneratorError({ message: "unused" })), put: () => Effect.fail(new ToolpathGeneratorError({ message: "unused" })) },
    reports: {
      list: () => Effect.succeed(reports.map((r, i) => ({ id: `r${i}`, name: r["name"], kind: r["kind"], verdict: r["verdict"], toolpathId: null, workOffset: null, measuredAt: "2026-11-04T10:00:00.000Z" })) as never),
      get: (_p, id) => Effect.succeed({ ...reports[Number(id.slice(1))], id, source: "simulated", runId: null, programHash: null, workOffset: "G54", toolpathId: null, measuredAt: "2026-11-04T10:00:00.000Z" } as never),
      save: (_p, body) => { reports.push(body as unknown as Record<string, unknown>); return Effect.succeed({ id: `r${reports.length - 1}` } as never) },
      remove: () => Effect.void
    }
  }
  return { service, writes, reports, bump: () => { revision++ }, setEntries: (next: typeof entries) => { entries = next } }
}

const run: Parameters<typeof loadOffsets>[1] = (effect) => Effect.runPromise(effect)

const verdict = (name: string, deviation: number, over: Partial<InspectionVerdict> = {}): InspectionVerdict => ({
  name, kind: "size", nominal: 20, measured: 20 + deviation, deviation, lower: -0.05, upper: 0.05, pass: Math.abs(deviation) <= 0.05, ...over
})

const reset = () => {
  resetStores()
  useMultiToolpathStore.getState().clearAllToolpaths()
  useProbingStore.getState().reset()
  useInspectionStore.getState().reset()
  useWorkOffsetStore.getState().reset()
}
beforeEach(reset)
afterEach(reset)

const profile = () => cam.kernel.profileOfConfig(MACHINE.config as Record<string, unknown>, "mill")

test("work offsets: load, edit, save writes the table with the revision read; a stale revision keeps the edits and flags the conflict", async () => {
  const fake = fakeService()
  await loadOffsets(fake.service, run, profile(), "m1")
  const store = useWorkOffsetStore
  expect(store.getState().rows.find((r) => r.key === "G54")!.entry).toEqual({ x: -300, y: -200, z: -400 })
  expect(store.getState().isOwner).toBe(true)
  store.getState().edit("G54", "x", -299.5)
  store.getState().addRow("G54.1 P3")
  store.getState().edit("G54.1 P3", "z", -10)
  expect(store.getState().changes().map((c) => `${c.key} ${c.axis} ${c.delta}`)).toEqual(["G54 x 0.5", "G54.1 P3 z -10"])
  expect(await saveOffsets(fake.service, run, profile())).toBe(true)
  expect(fake.writes[0]!["baseUpdatedAt"]).toBe("2026-11-04T10:00:01.000Z")
  expect((fake.writes[0]!["entries"] as Record<string, unknown>)["G54"]).toMatchObject({ x: -299.5 })
  expect(store.getState().changes()).toEqual([])
  expect(store.getState().updatedAt).toBe("2026-11-04T10:00:02.000Z")
  // Someone else writes meanwhile: Save is refused as a conflict, nothing is lost.
  store.getState().edit("G54", "y", -199)
  fake.bump()
  expect(await saveOffsets(fake.service, run, profile())).toBe(false)
  expect(store.getState().conflict).toBe(true)
  expect(store.getState().error).toBeUndefined()
  expect(store.getState().rows.find((r) => r.key === "G54")!.entry.y).toBe(-199)
  // The measured updates of a run wait in the rows for Save.
  store.getState().discard()
  store.getState().applyUpdates([{ ref: cam.probing.parseOffsetRef("G54")!, axis: "Z", before: -400, after: -400.25 }])
  expect(store.getState().changes()[0]).toMatchObject({ key: "G54", axis: "z", after: -400.25 })
})

test("API client: a 409 from the table write becomes WorkOffsetConflict, other failures stay plain", async () => {
  const conflict = Object.assign(new Error("Table saved elsewhere"), { _tag: "Conflict", status: 409 })
  const bad = Object.assign(new Error("No access"), { _tag: "Forbidden" })
  let next: Error = conflict
  const client = { camProbing: { workOffsetsPut: () => Effect.fail(next) } } as never
  const service = makeProbingStoreService(client)
  const body = { entries: {}, baseUpdatedAt: "2026-11-04T10:00:00.000Z" }
  const first = await Effect.runPromise(Effect.flip(service.workOffsets.put("m1", body)))
  expect(first).toBeInstanceOf(WorkOffsetConflict)
  next = bad
  const second = await Effect.runPromise(Effect.flip(service.workOffsets.put("m1", body)))
  expect(second).toBeInstanceOf(ToolpathGeneratorError)
  expect(second.message).toBe("No access")
})

const controllerWith = (fake: ReturnType<typeof fakeService>, inserted: string[] = []) => createProbingController({
  run, service: fake.service, machine: () => MACHINE, defaults: () => DEFAULT_PROBING,
  elements: () => [{ id: "c1", type: "circle", name: "Hole", x: 20, y: 0, z: 0, radius: 8 }],
  stock: () => ({ x: 0, y: 0, width: 100, height: 50, topZ: 0 }), setups: () => [{ id: "s1", name: "Op 10" }],
  projectId: () => "p1", insert: (nc) => { inserted.push(nc) }
})

test("controller: add, edit, pick a feature, duplicate, remove; the program calls say so when the sidecar has none", async () => {
  const fake = fakeService()
  const inserted: string[] = []
  const c = controllerWith(fake, inserted)
  expect(c.machine()).toEqual({ id: "m1", name: "VF-2", stored: true })
  c.add(PALETTE.find((e) => e.id === "bore")!)
  const [first] = probeCycles(useMultiToolpathStore.getState())
  expect(first!.probe.name).toBe("Bore")
  expect(useProbingStore.getState().selectedId).toBe(first!.id)
  c.add(PALETTE.find((e) => e.id === "inspect-bore")!)
  const inspect = probeCycles(useMultiToolpathStore.getState())[1]!
  expect(inspect.probe).toMatchObject({ updateMode: "report", name: "Bore 2" })
  expect(inspect.probe.checks.map((x) => x.result)).toEqual(["diameter"])
  c.update(first!.id, { tolerance: 0.2 })
  expect(useMultiToolpathStore.getState().getToolpathById(first!.id)!.probe!.tolerance).toBe(0.2)
  // A pick on the wall of the drawn hole fills the selected cycle with that feature.
  useProbingStore.getState().select(first!.id)
  c.pickHit({ point: { x: 20, y: 8, z: -3 }, normal: { x: 0, y: 1, z: 0 } })
  expect(useMultiToolpathStore.getState().getToolpathById(first!.id)!.probe!.cycle).toMatchObject({ kind: "bore", diameter: 16, centre: { x: 20, y: 0 } })
  expect(useProbingStore.getState().error).toBeUndefined()
  c.pickHit({ point: { x: 9999, y: 9999, z: 9999 }, normal: { x: 0, y: 0, z: 1 } })
  expect(useProbingStore.getState().error).toContain("No feature")
  c.duplicate(first!.id)
  expect(probeCycles(useMultiToolpathStore.getState()).map((t) => t.probe.name)).toEqual(["Bore", "Bore copy", "Bore 2"])
  await c.generate(first!.id)
  expect(useProbingStore.getState().error).toContain("sidecar")
  expect(useProbingStore.getState().busy).toBeUndefined()
  c.remove(first!.id)
  expect(probeCycles(useMultiToolpathStore.getState())).toHaveLength(2)
  expect(useProbingStore.getState().selectedId).toBeDefined()
})

test("results and programs are stale as soon as the operation changes", () => {
  const op = { name: "A", tolerance: 0.05 }
  const store = useProbingStore.getState()
  const result = { operationId: "t1", fingerprint: fingerprintOf(op) } as ProbeRunResult
  store.setResult(result)
  expect(freshResult(useProbingStore.getState().results, "t1", op)).toBe(result)
  expect(freshResult(useProbingStore.getState().results, "t1", { ...op, tolerance: 0.1 })).toBeUndefined()
  store.setProgram({ operationId: "t1", dialect: "fanuc", nc: "G0", lines: 1, notes: [], warnings: [], fingerprint: fingerprintOf(op) })
  expect(freshProgram(useProbingStore.getState().programs, "t1", op)?.nc).toBe("G0")
  expect(freshProgram(useProbingStore.getState().programs, "t1", { ...op, name: "B" })).toBeUndefined()
  store.forget("t1")
  expect(useProbingStore.getState().results).toEqual({})
})

test("controller: a report is stored with the project and read back as a run", async () => {
  const fake = fakeService()
  const c = controllerWith(fake)
  c.add(PALETTE.find((e) => e.id === "bore")!)
  const id = useProbingStore.getState().selectedId!
  const op = useMultiToolpathStore.getState().getToolpathById(id)!.probe!
  const verdicts = [verdict("d", 0.01)]
  useProbingStore.getState().setResult({
    operationId: id, source: "simulated", fingerprint: fingerprintOf(op), verdicts, verdict: "pass", measuredAt: "2026-11-04T10:00:00.000Z", expected: [],
    outcome: { contacts: [], variables: {}, results: {}, offsets: {}, updates: [], tools: [], inspections: verdicts, alarms: [], reports: [], path: [] }
  })
  await c.saveReport(id)
  expect(fake.reports).toHaveLength(1)
  expect(fake.reports[0]).toMatchObject({ name: "Bore", kind: "part", source: "simulated", verdict: "pass", workOffset: "G54", machineConfigId: "m1" })
  expect(useProbingStore.getState().results[id]!.reportId).toBe("r0")
  expect(useInspectionStore.getState().history.map((h) => h.id)).toEqual(["r0"])
  await c.openReport("r0")
  expect(useInspectionStore.getState().opened?.verdicts).toEqual(verdicts)
  await c.openReport(undefined)
  expect(useInspectionStore.getState().opened).toBeUndefined()
})

// ------------------------------------------------------------------ DOM

const fire = (el: Element, type: string) => el.dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event)
const typeInto = (el: HTMLInputElement, value: string) => { el.value = value; fire(el, "input"); fire(el, "change") }
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test("the Probing tab: no number inputs, a cycle is added and edited with comma decimals, the offsets table saves", async () => {
  installDom("http://localhost/cam")
  const { render } = await import("solid-js/web")
  const { ProbingTab } = await import("../src/features/cam/components/probing/ProbingTab.tsx")
  const fake = fakeService()
  const controller = controllerWith(fake)
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => ProbingTab({ controller }), root)
  try {
    expect(root.querySelector('[data-testid="probing-machine"]')?.textContent).toContain("VF-2")
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
    ;(root.querySelector('[data-testid="probe-add-bore"]') as HTMLButtonElement).click()
    await settle()
    expect(root.querySelector('[data-testid="probe-cycle-editor"]')).not.toBeNull()
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
    const id = useProbingStore.getState().selectedId!
    const diameter = root.querySelector('[data-testid="probe-field-diameter"]') as HTMLInputElement
    expect(diameter.value).toBe("20")
    typeInto(diameter, "12,5")
    expect(useMultiToolpathStore.getState().getToolpathById(id)!.probe!.cycle).toMatchObject({ diameter: 12.5 })
    typeInto(diameter, "40/2+3")
    expect((useMultiToolpathStore.getState().getToolpathById(id)!.probe!.cycle as unknown as { diameter: number }).diameter).toBe(23)
    // The plan summary follows the cycle; a stylus that does not fit is the core's refusal, shown as typed.
    expect(root.querySelector('[data-testid="probe-plan"]')?.textContent).toContain("diameter")
    typeInto(root.querySelector('[data-testid="probe-override-stylusDiameter"]') as HTMLInputElement, "30")
    await settle()
    expect(root.querySelector('[data-testid="probe-refused"], [data-testid="probe-issues"]')).not.toBeNull()
    // Work offsets: load, edit a cell, save.
    useProbingStore.getState().toggleSection("offsets")
    await settle()
    await settle()
    const cell = root.querySelector('[data-testid="offset-G54-x"]') as HTMLInputElement
    expect(cell.value).toBe("-300")
    typeInto(cell, "-299,5")
    await settle()
    expect(root.querySelector('[data-testid="offsets-diff"]')?.textContent).toContain("G54 X")
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0)
    ;(root.querySelector('[data-testid="offsets-save"]') as HTMLButtonElement).click()
    await settle()
    await settle()
    expect((fake.writes[0]!["entries"] as Record<string, { x: number }>)["G54"]!.x).toBe(-299.5)
    expect(root.querySelector('[data-testid="offsets-diff"]')).toBeNull()
    // A conflict shows the banner and keeps Save closed until the user decides.
    typeInto(root.querySelector('[data-testid="offset-G54-y"]') as HTMLInputElement, "-199")
    fake.bump()
    ;(root.querySelector('[data-testid="offsets-save"]') as HTMLButtonElement).click()
    await settle()
    await settle()
    expect(root.querySelector('[data-testid="offsets-conflict"]')).not.toBeNull()
    expect((root.querySelector('[data-testid="offsets-save"]') as HTMLButtonElement).disabled).toBe(true)
    ;(root.querySelector('[data-testid="offsets-conflict-keep"]') as HTMLButtonElement).click()
    await settle()
    expect(root.querySelector('[data-testid="offsets-conflict"]')).toBeNull()
  } finally {
    dispose()
    root.remove()
  }
})

test("the inspection list: failures first, a warning near the limit, CSV through the export hook, selection", async () => {
  installDom("http://localhost/cam")
  const { render } = await import("solid-js/web")
  const { InspectionList } = await import("../src/features/cam/components/probing/InspectionList.tsx")
  const exported: Array<{ csv: string; file: string }> = []
  let selected: string | undefined
  const root = document.createElement("div")
  document.body.append(root)
  const verdicts = [verdict("ok", 0.01), verdict("near", 0.045), verdict("bad", -0.07)]
  const dispose = render(() => InspectionList({ verdicts, title: "Bore check", onExport: (csv, file) => exported.push({ csv, file }), onSelect: (name) => { selected = name } }), root)
  try {
    const rows = [...root.querySelectorAll('[data-testid^="inspection-row-"]')]
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["fail", "warn", "pass"])
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["inspection-row-bad", "inspection-row-near", "inspection-row-ok"])
    // Status is text, not colour alone.
    expect(rows[0]!.textContent).toContain("Fail")
    expect(rows[1]!.textContent).toContain("Warning")
    expect(root.querySelector('[data-testid="inspection-summary"]')?.textContent).toContain("1 failed, 1 warnings, 1 passed")
    ;(rows[0]!.querySelector("button") as HTMLButtonElement).click()
    expect(selected).toBe("bad")
    ;(root.querySelector('[data-testid="inspection-csv"]') as HTMLButtonElement).click()
    expect(exported[0]!.file).toBe("Bore-check.csv")
    expect(exported[0]!.csv.split("\n")[1]).toBe("bad,size,20.000,19.930,-0.070,-0.050,0.050,fail")
  } finally {
    dispose()
    root.remove()
  }
})
