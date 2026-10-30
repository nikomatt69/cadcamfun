import { booleanBrep, BooleanError, frame, makeBox, makeCone, makeCylinder, makeSphere, makeTorus, massProperties, validateBrep, type Brep } from "./index.ts"
import { booleanCounters, resetBooleanCounters } from "./boolean.ts"

/**
 * Seeded Boolean sweep (spec 42 gate 1): the same generator as `fuzz.test.ts`, over any seed range. Used by hand
 * (`bun run packages/core/src/cad/brep/fuzz-sweep.ts 1 120 aligned`) and by `fuzz.test.ts` for a pinned set of seeds.
 */
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const AXES = [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 0.3, y: -0.5, z: 0.8 }]
/** A random primitive; with `aligned` the placement snaps to coordinates that make poles, seams and tangencies coincide. */
export const fuzzPrimitive = (r: () => number, aligned: boolean): Brep => {
  const q = (x: number) => (aligned ? Math.round(x * 2) / 2 : x)
  const at = frame({ x: q(r() * 6 - 3), y: q(r() * 6 - 3), z: q(r() * 6 - 3) }, AXES[Math.floor(r() * (aligned ? 3 : AXES.length))]!)
  const k = Math.floor(r() * 5)
  const size = (lo: number, hi: number) => q(lo + r() * (hi - lo))
  if (k === 0) return makeBox(size(3, 8), size(3, 8), size(3, 8), at)
  if (k === 1) return makeCylinder(size(1.5, 4), size(4, 10), at)
  if (k === 2) return makeSphere(size(2, 5), at)
  if (k === 3) return makeCone(size(2, 4), size(0.5, 2), size(4, 8), at)
  return makeTorus(size(4, 7), size(1, 2.5), at)
}
export const fuzzPair = (seed: number, aligned: boolean): [Brep, Brep] => {
  const r = rng(seed * (aligned ? 7919 : 104729))
  return [fuzzPrimitive(r, aligned), fuzzPrimitive(r, aligned)]
}
const volume = (b: Brep) => (b.faces.length === 0 ? 0 : massProperties(b).volume)

export interface SweepCase {
  readonly seed: number
  readonly failure?: string
  /** A Boolean of the case used the displacement recovery. */
  readonly displaced: boolean
  /** A Boolean of the case was refused with a stated reason. */
  readonly refused: boolean
  readonly warnings: ReadonlyArray<string>
  /** Largest relative error of the two volume identities. */
  readonly identityError: number
}

export const sweepCase = (seed: number, aligned: boolean): SweepCase => {
  const [A, B] = fuzzPair(seed, aligned)
  try {
    const u = booleanBrep(A, B, "union"), i = booleanBrep(A, B, "intersect"), d = booleanBrep(A, B, "subtract")
    for (const x of [u, i, d]) if (x.brep.faces.length > 0 && validateBrep(x.brep).issues.length > 0) return { seed, displaced: false, refused: false, warnings: [], identityError: NaN, failure: "invalid result" }
    const warnings = [u, i, d].flatMap((x) => x.warnings)
    const displaced = warnings.some((w) => w.includes("degenerate alignment"))
    const va = volume(A), vb = volume(B)
    const e1 = Math.abs(volume(u.brep) + volume(i.brep) - va - vb) / (va + vb)
    const e2 = Math.abs(volume(d.brep) - (va - volume(i.brep))) / va
    const identityError = Math.max(e1, e2)
    const tol = displaced ? 1e-3 : 1e-6
    return { seed, displaced, refused: false, warnings, identityError, ...(identityError > tol ? { failure: `volume balance off by ${identityError.toExponential(2)}` } : {}) }
  } catch (e) {
    const msg = String((e as Error).message)
    // A typed refusal (a `BooleanError`) is a stated outcome, not a silent wrong answer; anything else is a failure.
    return { seed, displaced: false, refused: e instanceof BooleanError, warnings: [], identityError: NaN, failure: msg.slice(0, 200) }
  }
}

if (import.meta.main) {
  const [from = "1", to = "120", mode = "aligned"] = process.argv.slice(2)
  resetBooleanCounters()
  const t0 = Date.now()
  const cases: SweepCase[] = []
  for (let s = Number(from); s <= Number(to); s++) cases.push(sweepCase(s, mode === "aligned"))
  const n = cases.length
  const displaced = cases.filter((c) => c.displaced)
  console.log(JSON.stringify({
    from: Number(from), to: Number(to), mode, seeds: n,
    failures: cases.filter((c) => c.failure !== undefined && !c.refused).map((c) => [c.seed, c.failure]),
    refused: cases.filter((c) => c.refused).map((c) => [c.seed, c.failure]),
    displaced: displaced.map((c) => [c.seed, c.identityError, c.warnings.filter((w) => w.includes("degenerate alignment"))[0]]),
    displacedPct: (100 * displaced.length) / n,
    counters: booleanCounters(), seconds: (Date.now() - t0) / 1000,
  }, null, 1))
}
