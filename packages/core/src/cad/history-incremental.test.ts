/**
 * Spec 58 T4: the exact replay resumes from the first dirty feature. Proof obligation: a resumed result equals the full result
 * (same bodies, same face names and keys, same volume), for edits of the last feature, a middle one, a parameter, a suppressed
 * feature, and an edit of the first feature (nothing to reuse).
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Feature, History } from "./history.ts"
import { newExactStageCache, rebuildExact, type ExactRebuild } from "./history-brep.ts"
import { newRebuildCache, rebuild, type RebuildResult } from "./history.ts"
import { entityRefs } from "./history-naming.ts"
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

/** Everything a mesh rebuild returns, in a form `toEqual` compares exactly (meshes as plain arrays). */
const meshDigest = (r: RebuildResult) => ({
  bodies: r.bodies.map((b) => ({ id: b.id, feature: b.feature, appearance: b.appearance, positions: Array.from(b.mesh.positions), indices: Array.from(b.mesh.indices) })),
  issues: r.issues, states: r.states, lineage: r.lineage, planes: r.planes, flatPatterns: r.flatPatterns, parameters: r.parameters,
  sketches: Object.fromEntries(Object.entries(r.sketches).map(([id, s]) => [id, { plane: s.plane, offset: s.offset, frame: s.frame, status: s.solve.status }]))
})

describe("incremental mesh rebuild (spec 58 T4, mesh half)", () => {
  test("editing the last hole of 14 features evaluates one feature and equals the full replay", () => {
    const cache = newRebuildCache()
    rebuild(model(), { cache })
    expect(cache.lastResumedAt).toBe(0)
    expect(cache.lastReplayed).toBe(14)
    const edited = model({ lastDiameter: 6 })
    const t0 = performance.now()
    const full = rebuild(edited)
    const t1 = performance.now()
    const resumed = rebuild(edited, { cache })
    const t2 = performance.now()
    expect(cache.lastResumedAt).toBe(13)
    expect(cache.lastReplayed).toBe(1)
    expect(meshDigest(resumed)).toEqual(meshDigest(full))
    console.log(`T4 mesh 14 features: full ${(t1 - t0).toFixed(0)} ms, resumed ${(t2 - t1).toFixed(0)} ms`)
    // The same history again: nothing is evaluated.
    const again = rebuild(edited, { cache })
    expect(cache.lastResumedAt).toBe(14)
    expect(cache.lastReplayed).toBe(0)
    expect(meshDigest(again)).toEqual(meshDigest(full))
  })

  test("a middle edit, a parameter edit, a suppression and a release each resume at the first dirty feature", () => {
    const cache = newRebuildCache()
    rebuild(model(), { cache })
    const cases: Array<readonly [History, number]> = [
      [model({ midDiameter: 7 }), 7],
      [model({ midDiameter: 7, thick: 12 }), 1],
      [withSuppressed(model({ midDiameter: 7, thick: 12 }), ["h10"]), 12],
      [model({ midDiameter: 7, thick: 12 }), 12]
    ]
    for (const [h, at] of cases) {
      const resumed = rebuild(h, { cache })
      expect(cache.lastResumedAt).toBe(at)
      expect(cache.lastReplayed).toBe(14 - at)
      expect(meshDigest(resumed)).toEqual(meshDigest(rebuild(h)))
    }
  })

  test("failed features are restored with their issues: the resumed report equals the full one", () => {
    // A fillet too large for the plate fails; the holes after it still build; then the last hole is edited.
    const failing = (d: number): History => {
      const h = model({ lastDiameter: d })
      const f = [...h.features]
      f.splice(2, 0, { id: "round", type: "fillet", radius: 90, edges: { parallel: "z" } } as Feature)
      return { ...h, features: f }
    }
    const cache = newRebuildCache()
    const first = rebuild(failing(4), { cache })
    expect(first.states["round"]).toEqual({ state: "failed" })
    const edited = failing(5)
    const resumed = rebuild(edited, { cache })
    expect(cache.lastResumedAt).toBe(14)
    expect(cache.lastReplayed).toBe(1)
    expect(resumed.issues.some((i) => i.feature === "round" && i.severity === "error")).toBe(true)
    expect(meshDigest(resumed)).toEqual(meshDigest(rebuild(edited)))
  })

  test("a fillet by persistent reference after the edit: the inner exact replay resumes too, and the result is the full one", () => {
    const base = model()
    const prefix: History = { ...base, features: base.features.slice(0, 2) }
    const refs = entityRefs(rebuildExact(prefix), "plate", ["edge"])
      .filter((r) => /^edge\(plate\.side0\.\d,plate\.side0\.\d\)$/.test(r.key)).slice(0, 2).map((r) => `edge:${r.body}|${r.key}`)
    expect(refs).toHaveLength(2)
    const h = (d: number): History => ({
      ...base,
      features: [
        ...base.features.slice(0, 2),
        { id: "h0", type: "hole", plane: "XY", offset: "thick", at: [30, 40], diameter: 6, depth: "thick" } as Feature,
        { id: "h1", type: "hole", plane: "XY", offset: "thick", at: [90, 40], diameter: d, depth: "thick" } as Feature,
        { id: "round", type: "fillet", radius: 3, edges: { refs } } as Feature
      ]
    })
    const cache = newRebuildCache()
    const first = rebuild(h(6), { cache })
    expect(first.issues.filter((i) => i.severity === "error")).toEqual([])
    const resumed = rebuild(h(8), { cache })
    expect(cache.lastResumedAt).toBe(3)
    expect(cache.lastReplayed).toBe(2)
    // The fillet asked for the exact model before it: that replay resumed after the unchanged prefix as well.
    expect(cache.exact.lastResumedAt).toBe(3)
    expect(meshDigest(resumed)).toEqual(meshDigest(rebuild(h(8))))
  })

  test("both halves together: a cached edit gives the exact result of the full replay", () => {
    const mesh = newRebuildCache(), exact = newExactStageCache()
    rebuildExact(model(), rebuild(model(), { cache: mesh }), { cache: exact })
    const edited = model({ lastDiameter: 6 })
    const resumedMesh = rebuild(edited, { cache: mesh })
    const resumedExact = rebuildExact(edited, resumedMesh, { cache: exact })
    expect(mesh.lastReplayed).toBe(1)
    expect(exact.lastReplayed).toBe(1)
    expect(digest(resumedExact)).toEqual(digest(rebuildExact(edited)))
  })
})
