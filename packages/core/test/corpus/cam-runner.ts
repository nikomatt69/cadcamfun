/**
 * CAM program entries of the corpus (spec 55 §2 set (d), spec 72 P0-8): a manufacturing job is run through the kernel and the
 * resulting artifact is judged against an expectation written by hand from the job's definition:
 *   - the release level and the status of the claims the job is meant to decide (a clean job `verified-program`, a seeded collision
 *     `blocked`, a job whose fixing is not described `preview`),
 *   - the volume of the part as the kernel's stock model measured it, against the analytic volume of the part.
 * A claim that moves (a `passed` that is now `unresolved`) is `wrong`, never silently accepted. Time is judged like any entry.
 */
import { runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "../../src/cam/kernel/index.ts"
import { hashOf, type EntryResult, type Outcome } from "./runner.ts"
import camManifest from "./cam-corpus.json"

export type ClaimStatus = "passed" | "failed" | "unresolved" | "unsupported"

export interface CamProgramEntry {
  readonly id: string
  readonly set: "d"
  readonly kind: "cam-program"
  readonly source: { readonly job: string }
  readonly licence: string
  /** sha256 of the canonical JSON of the job. */
  readonly hash: string
  readonly budgetMs: number
  readonly capabilities: ReadonlyArray<string>
  readonly expected: {
    readonly release: CamArtifact["release"]
    /** Claims the entry decides: every one listed must have exactly this status. */
    readonly claims: Readonly<Record<string, ClaimStatus>>
    /** Volume of the part, mm³, from `formula`. */
    readonly partVolume: number
    readonly formula: string
    readonly partVolumeRelTol: number
  }
}

export const CAM_CORPUS: ReadonlyArray<CamProgramEntry> = camManifest.entries as unknown as ReadonlyArray<CamProgramEntry>

// ------------------------------------------------------------------------------------------------- jobs

/** A 60 x 40 x 10 block as a closed mesh, stock 3 mm larger on each side in X and Y. */
const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }]
const outline = { id: "outline", strategy: "profile", tool: "flat-6", loop: ring, side: "outside", top: 10, bottom: 0, allowance: 0, finish: true, leadIn: "direct" } as OperationSpec
const plate = (id: string, fixtures?: ManufacturingJob["fixtures"]): ManufacturingJob => ({
  schemaVersion: 1, id, name: id, material: "6061", part: { kind: "meshes", meshes: [block] },
  stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 63, y: 43, z: 10 } }, operations: [outline], ...(fixtures !== undefined ? { fixtures } : {})
})

/** A 20 x 16 x 10 block with a blind Ø4 hole in its +X face, drilled from a separate +X setup. */
const sideHole = (fixtures?: ManufacturingJob["fixtures"]): ManufacturingJob => ({
  schemaVersion: 1, id: "side-hole", name: "Side hole", material: "6061", setupOrientation: "+X",
  part: { kind: "elements", elements: [{ id: "p", type: "parametric", x: 0, y: 0, z: 0, history: {
    parameters: {}, features: [
      { id: "b", type: "primitive", element: "cube", params: { width: 20, height: 16, depth: 10 }, operation: "new" },
      { id: "h", type: "hole", plane: "YZ", offset: 10, at: [0, 0], diameter: 4, depth: 6 }
    ]
  } }] } as ManufacturingJob["part"],
  stock: { min: { x: -10, y: -8, z: -5 }, max: { x: 11, y: 8, z: 5 } },
  quality: { resolution: 0.25 },
  ...(fixtures !== undefined ? { fixtures } : {})
})

/** The job fixtures of set (d), by name. */
export const JOB_FIXTURES: Readonly<Record<string, () => ManufacturingJob>> = {
  "block-outline": () => plate("block-outline"),
  "block-outline-jaw": () => plate("block-outline-jaw", [{ id: "jaw", min: { x: 80, y: 0, z: 0 }, max: { x: 90, y: 40, z: 10 } }]),
  // A strap clamp across the part at 12..20 mm: the holder of the 6 mm cutter passes through it on its way round the outline.
  "block-outline-clamp": () => plate("block-outline-clamp", [{ id: "clamp", min: { x: 20, y: 10, z: 12 }, max: { x: 40, y: 30, z: 20 } }]),
  // Side setup with the fixing described by a jaw below the part (CAD frame): workholding is decided, not assumed.
  "side-hole-fixtured": () => sideHole([{ id: "vise-jaw", min: { x: -60, y: -20, z: -20 }, max: { x: -40, y: 20, z: 20 } }]),
  // The same setup with nothing said about the fixing: the claim stays open and the release at preview.
  "side-hole-unfixtured": () => sideHole()
}

export const camJobOf = (source: CamProgramEntry["source"]): ManufacturingJob => {
  const build = JOB_FIXTURES[source.job]
  if (build === undefined) throw new RangeError(`unknown corpus job '${source.job}'`)
  return build()
}

// ------------------------------------------------------------------------------------------------- judging

export interface CamMeasurement {
  readonly hash: string
  readonly ms: number
  readonly failure?: string
  readonly release?: CamArtifact["release"]
  readonly claims: Readonly<Record<string, string>>
  readonly partVolume?: number
}

const rel = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)

export const classifyCam = (entry: CamProgramEntry, m: CamMeasurement): Omit<EntryResult, "id" | "ms"> => {
  const wrong = (detail: string) => ({ outcome: "wrong" as Outcome, detail })
  if (m.hash !== entry.hash) return wrong(`the job changed (${m.hash.slice(0, 19)}…, manifest ${entry.hash.slice(0, 19)}…): re-derive the expectation, then update the hash`)
  if (m.failure !== undefined) return wrong(`the kernel refused the job: ${m.failure}`)
  const e = entry.expected
  if (m.release !== e.release) return wrong(`release ${m.release}, expected ${e.release}`)
  for (const [id, want] of Object.entries(e.claims)) {
    const got = m.claims[id] ?? "absent"
    if (got !== want) return wrong(`claim ${id} is ${got}, expected ${want}`)
  }
  if (m.partVolume === undefined || rel(m.partVolume, e.partVolume) > e.partVolumeRelTol) {
    return wrong(`part volume ${m.partVolume?.toFixed(1)} mm³, oracle ${e.partVolume} (${e.formula}), tolerance ${e.partVolumeRelTol}`)
  }
  if (m.ms > entry.budgetMs) return { outcome: "slow", detail: `${Math.round(m.ms)} ms over the ${entry.budgetMs} ms budget` }
  return { outcome: "pass", detail: `release ${e.release}, ${Object.keys(e.claims).length} claims as expected, part volume within ${rel(m.partVolume, e.partVolume).toExponential(1)}` }
}

export const measureCam = (entry: CamProgramEntry): CamMeasurement => {
  const job = camJobOf(entry.source)
  const hash = hashOf(job)
  const started = performance.now()
  const r = runJob(job)
  const ms = performance.now() - started
  if (r.status !== "ok") return { hash, ms, claims: {}, failure: r.issues.map((i) => i.message).join("; ") }
  return {
    hash, ms, release: r.value.release,
    claims: Object.fromEntries(r.value.claims.map((c) => [c.id, c.status])),
    partVolume: r.value.stock.partVolume
  }
}

export const runCamEntry = (entry: CamProgramEntry): EntryResult => {
  const started = performance.now()
  try {
    const m = measureCam(entry)
    return { id: entry.id, ms: Math.round(m.ms), ...classifyCam(entry, m) }
  } catch (error) {
    return { id: entry.id, outcome: "wrong", detail: `crashed: ${error instanceof Error ? error.message : String(error)}`, ms: Math.round(performance.now() - started) }
  }
}

export const camManifestProblems = (entries: ReadonlyArray<CamProgramEntry>): string[] => {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.id)) problems.push(`${e.id}: duplicate id`)
    seen.add(e.id)
    if (!(e.budgetMs > 0)) problems.push(`${e.id}: budget must be positive`)
    if (e.capabilities.length === 0) problems.push(`${e.id}: names no capability`)
    if (JOB_FIXTURES[e.source.job] === undefined) problems.push(`${e.id}: unknown job '${e.source.job}'`)
    if (!(e.expected.partVolume > 0 && e.expected.partVolumeRelTol > 0 && e.expected.formula.trim() !== "")) problems.push(`${e.id}: an oracle needs a volume, a formula and a positive tolerance`)
    if (Object.keys(e.expected.claims).length === 0) problems.push(`${e.id}: decides no claim`)
  }
  return problems
}

