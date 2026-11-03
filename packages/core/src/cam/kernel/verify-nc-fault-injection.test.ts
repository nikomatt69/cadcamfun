/**
 * Sensitivity of the foreign-NC verifier (spec 72 P0-4, spec 53 V2): seeded overcuts injected into otherwise clean programs must all be
 * found, with the NC line of the pass that carries them, and clean programs must all pass. The programs are multi-pass contours of a
 * block with a 6 mm flat end mill; one side of one pass is moved `d` mm toward the part. The smallest depth injected is above the
 * declared error of the replay, so a miss is a defect of the verifier, not of the lattice.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { Cutter } from "./cutters.ts"
import { verifyNc } from "./verify-nc.ts"

setDefaultTimeout(180_000)

const flat: Cutter = { id: "f6", name: "flat 6", kind: "flat", diameter: 6, flutes: 3, material: "carbide", coating: "none", fluteLength: 20, shankDiameter: 6, stickout: 30 }
const boxMesh = (w: number, h: number, d: number): Mesh64 => {
  const [x0, y0, z0, x1, y1, z1] = [0, 0, -d, w, h, 0]
  return {
    positions: Float64Array.from([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
  }
}

/** Small deterministic generator (mulberry32). */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

interface Program { readonly nc: string; readonly passes: ReadonlyArray<{ readonly first: number; readonly last: number }> }

/** Contour passes at the given depths; `offsets[pass]` is the wall distance of the south, east, north and west sides (3 mm = the tool just touches). */
const contour = (w: number, h: number, depths: ReadonlyArray<number>, offsets: ReadonlyArray<readonly [number, number, number, number]>): Program => {
  const lines = ["G21 G90 G54", "T1 M6", "S10000 M3", "G0 Z15"]
  const passes: Array<{ first: number; last: number }> = []
  depths.forEach((z, i) => {
    const [s, e, n, wst] = offsets[i]!
    const first = lines.length + 1
    lines.push(`G0 X${(-wst).toFixed(3)} Y${(-s).toFixed(3)}`, `G1 Z${z} F300`, `G1 X${(w + e).toFixed(3)} Y${(-s).toFixed(3)} F800`, `G1 X${(w + e).toFixed(3)} Y${(h + n).toFixed(3)}`, `G1 X${(-wst).toFixed(3)} Y${(h + n).toFixed(3)}`, `G1 X${(-wst).toFixed(3)} Y${(-s).toFixed(3)}`, "G0 Z15")
    passes.push({ first, last: lines.length })
  })
  lines.push("M30")
  return { nc: lines.join("\n"), passes }
}

const check = (w: number, h: number, d: number, program: Program) => verifyNc({
  nc: program.nc, part: [boxMesh(w, h, d)], stock: { min: { x: -3, y: -3, z: -d }, max: { x: w + 3, y: h + 3, z: 0 } },
  tools: [{ number: 1, cutter: flat }], tolerance: 0.01, allowance: 0.05, cell: 0.1
})

describe("verifyNc sensitivity on seeded programs", () => {
  test("30 seeded overcuts of 0.2 to 1 mm are all found, at the pass that carries them; 15 clean programs all verify", () => {
    const random = rng(20261103)
    const missed: string[] = [], misplaced: string[] = [], falsePositives: string[] = []
    let detectedMin = Infinity
    for (let i = 0; i < 45; i++) {
      const w = 12 + Math.floor(random() * 8), h = 10 + Math.floor(random() * 8), d = 4 + Math.floor(random() * 3)
      const depths = [-1, -2.5, -4].slice(0, 2 + Math.floor(random() * 2)).map((z) => Math.max(z, -d))
      const clean = depths.map(() => [3, 3, 3, 3] as const)
      if (i >= 30) {
        const r = check(w, h, d, contour(w, h, depths, clean))
        if (r.verdict !== "clean" || r.findings.length > 0) falsePositives.push(`clean #${i}: ${r.verdict} ${r.findings.map((f) => f.message).join("; ")}`)
        continue
      }
      const pass = Math.floor(random() * depths.length), side = Math.floor(random() * 4)
      const depth = Math.round((0.2 + random() * 0.8) * 100) / 100
      const offsets = clean.map((o, k) => (k === pass ? (o.map((v, s) => (s === side ? v - depth : v)) as unknown as readonly [number, number, number, number]) : o))
      const program = contour(w, h, depths, offsets)
      const r = check(w, h, d, program)
      const gouge = r.findings.find((f) => f.kind === "gouge")
      if (r.verdict !== "faults" || gouge === undefined) { missed.push(`#${i} ${w}x${h}x${d} pass ${pass} side ${side} depth ${depth}: ${r.verdict}`); continue }
      detectedMin = Math.min(detectedMin, depth)
      const where = program.passes[pass]!
      if (gouge.line === undefined || gouge.line < where.first || gouge.line > where.last) misplaced.push(`#${i} line ${gouge.line} not in pass ${pass} (${where.first}-${where.last})`)
    }
    expect(missed).toEqual([])
    expect(misplaced).toEqual([])
    expect(falsePositives).toEqual([])
    expect(detectedMin).toBeGreaterThanOrEqual(0.2)
  })

  test("the smallest overcut found is limited by the declared error, not guessed: an overcut under it is not reported", () => {
    const deep = contour(16, 12, [-1, -3], [[3, 3, 3, 3], [3, 3, 3, 3]])
    const clean = check(16, 12, 5, deep)
    expect(clean.verdict).toBe("clean")
    const tiny = check(16, 12, 5, contour(16, 12, [-1, -3], [[3, 3, 3, 3], [3, 3 - 0.02, 3, 3]]))
    // 0.02 mm is under tolerance plus the lattice's error bound: not reported, and the figure says why.
    expect(tiny.threshold).toBeGreaterThan(0.02)
    expect(tiny.findings.filter((f) => f.kind === "gouge")).toEqual([])
    const big = check(16, 12, 5, contour(16, 12, [-1, -3], [[3, 3, 3, 3], [3, 3 - (clean.threshold + 0.5), 3, 3]]))
    expect(big.verdict).toBe("faults")
  })
})
