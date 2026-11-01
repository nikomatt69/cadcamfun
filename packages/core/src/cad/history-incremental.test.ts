/**
 * Spec 58 T4: the exact replay resumes from the first dirty feature. Proof obligation: a resumed result equals the full result
 * (same bodies, same face names and keys, same volume), for edits of the last feature, a middle one, a parameter, a suppressed
 * feature, and an edit of the first feature (nothing to reuse).
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature, History } from "./history.ts"
import { newExactStageCache, rebuildExact, type ExactRebuild } from "./history-brep.ts"
import { rebuild } from "./history.ts"
import { massProperties } from "./brep/mass.ts"
import { topologyKeys } from "./brep/naming-keys.ts"
import { withSuppressed } from "./history-timeline.ts"

setDefaultTimeout(120_000)

const HOLES = 12
/** A plate with 12 holes on a grid: 1 sketch + 1 extrude + 12 holes = 14 features (the 50-feature case is measured by the bench). */
const model = (opts: { lastDiameter?: number; thick?: number; midDiameter?: number } = {}): History => {
  const features: Feature[] = [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 120, height: 80 }] } } as Feature,
    { id: "plate", type: "extrude", sketch: "s", depth: "thick", operation: "new" } as Feature
  ]
  for (let i = 0; i < HOLES; i++) {
    const col = i % 4, row = Math.floor(i / 4)
    const d = i === HOLES - 1 ? (opts.lastDiameter ?? 4) : i === 5 ? (opts.midDiameter ?? 4) : 4
    features.push({ id: `h${i}`, type: "hole", plane: "XY", offset: "thick", at: [15 + col * 28, 15 + row * 25], diameter: d, depth: "thick" } as Feature)
  }
  return { parameters: { thick: opts.thick ?? 10 }, features }
}

const digest = (e: ExactRebuild) => e.bodies.map((b) => {
  expect(b.reason).toBeUndefined()
  const k = topologyKeys(b.brep!)
  return { id: b.id, volume: massProperties(b.brep!).volume, faces: k.faces, edges: k.edges.length, vertices: k.vertices.length }
})

const run = (h: History, cache?: ReturnType<typeof newExactStageCache>) => {
  const result = rebuild(h)
  const t0 = performance.now()
  const exact = rebuildExact(h, result, cache === undefined ? {} : { cache })
  return { exact, ms: performance.now() - t0 }
}

describe("incremental exact rebuild", () => {
  test("a 14-feature model: editing the last hole replays one feature of 14 and gives the full result", () => {
    const cache = newExactStageCache()
    const first = run(model(), cache)
    expect(model().features.length).toBe(14)
    expect(cache.lastResumedAt).toBe(0)
    const edited = model({ lastDiameter: 6 })
    const full = run(edited)
    const resumed = run(edited, cache)
    expect(cache.lastResumedAt).toBe(13)
    expect(cache.lastReplayed).toBe(1)
    expect(digest(resumed.exact)).toEqual(digest(full.exact))
    const v = massProperties(resumed.exact.bodies[0]!.brep!).volume
    const expected = 120 * 80 * 10 - 11 * Math.PI * 2 * 2 * 10 - Math.PI * 3 * 3 * 10
    expect(Math.abs(v - expected) / expected).toBeLessThan(1e-9)
    // The timeline of the resumed replay is the complete one.
    expect(resumed.exact.timeline!.length).toBe(full.exact.timeline!.length)
    console.log(`T4 14 features: first ${first.ms.toFixed(0)} ms, full replay of the edit ${full.ms.toFixed(0)} ms, resumed ${resumed.ms.toFixed(0)} ms (x${(full.ms / resumed.ms).toFixed(1)})`)
    // A timing claim only when the machine is not the bottleneck: the structural claim above (1 of 50 replayed) is the proof.
    expect(resumed.ms).toBeLessThan(full.ms)
  })

  test("a middle edit resumes at the dirty feature, a parameter edit and a first-feature edit as far as the fingerprints allow", () => {
    const cache = newExactStageCache()
    run(model(), cache)
    const mid = model({ midDiameter: 7 })
    const resumedMid = run(mid, cache)
    expect(cache.lastResumedAt).toBe(7)
    expect(cache.lastReplayed).toBe(14 - 7)
    expect(digest(resumedMid.exact)).toEqual(digest(run(mid).exact))
    // Thickness is read by the extrude: everything from feature 1 on is dirty (the sketch is clean).
    const thick = model({ thick: 12 })
    const resumedThick = run(thick, cache)
    expect(cache.lastResumedAt).toBe(1)
    expect(digest(resumedThick.exact)).toEqual(digest(run(thick).exact))
    // The same history again: everything is clean, the last boundary is reused and nothing is replayed.
    const again = run(thick, cache)
    expect(cache.lastResumedAt).toBe(14)
    expect(cache.lastReplayed).toBe(0)
    expect(digest(again.exact)).toEqual(digest(run(thick).exact))
    // Changing the sketch: nothing before it to reuse.
    const wide: History = { ...thick, features: [{ ...(thick.features[0] as Feature), sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 130, height: 80 }] } } as Feature, ...thick.features.slice(1)] }
    const resumedWide = run(wide, cache)
    expect(cache.lastResumedAt).toBe(0)
    expect(digest(resumedWide.exact)).toEqual(digest(run(wide).exact))
  })

  test("suppressing a feature and releasing it again is equal to the full replay each time", () => {
    const cache = newExactStageCache()
    const base = model()
    run(base, cache)
    const off = withSuppressed(base, ["h10"])
    const a = run(off, cache)
    expect(cache.lastResumedAt).toBe(12)
    expect(digest(a.exact)).toEqual(digest(run(off).exact))
    const back = run(base, cache)
    expect(digest(back.exact)).toEqual(digest(run(base).exact))
  })

  test("a cache from another history is never used for a different one", () => {
    const cache = newExactStageCache()
    run(model(), cache)
    const other: History = { parameters: { thick: 10 }, features: model().features.slice(0, 2).map((f) => (f.id === "plate" ? ({ ...f, depth: 3 } as Feature) : f)) }
    const r = run(other, cache)
    expect(cache.lastResumedAt).toBe(1)
    expect(massProperties(r.exact.bodies[0]!.brep!).volume).toBeCloseTo(120 * 80 * 3, 6)
  })
})
