import { describe, expect, test } from "bun:test"
import { emitGcode } from "./gcode.ts"
import { resolveProfile } from "./profile.ts"
import { replayBeads, type PrintMotion } from "./verify.ts"
import type { PathKind } from "./types.ts"

describe("the actual NC respects the hotend melt-flow limit", () => {
  for (const kind of ["wall-outer", "bridge", "raft"] as const satisfies ReadonlyArray<PathKind>) {
    for (const flow of [100, 150]) {
      test(`${kind}, flow multiplier ${flow} %`, () => {
        const profile = resolveProfile({ layerHeight: 0.1, printSpeed: 100, printTemperature: 205, bedTemperature: 60, extrusionWidth: 0.6, nozzleDiameter: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 1, supportType: "none", flow, firstLayerSpeed: 100, minLayerTime: 0, bedWidth: 20, bedDepth: 20, maxVolumetricFlow: 0.503 })
        const { gcode } = emitGcode({ profile, notes: [], layers: [{ index: 0, z: 0.1, height: 0.1, paths: [{ kind, widthScale: kind === "raft" ? 2 : 1, points: [{ x: 2, y: 2 }, { x: 18, y: 2 }] }] }] })
        const motionsSeen: PrintMotion[] = []
        const replay = replayBeads(gcode, { onMotion: (m) => motionsSeen.push(m) })
        expect(replay.errors).toEqual([])
        const filamentArea = Math.PI * (profile.filamentDiameter / 2) ** 2
        let motions = 0
        for (const m of motionsSeen) {
          if (m.e <= 0) continue
          const length = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z)
          if (length === 0) continue
          const seconds = length / (m.feed / 60)
          expect(m.e * filamentArea / seconds).toBeLessThanOrEqual(profile.maxVolumetricFlow + 1e-5)
          motions++
        }
        expect(motions).toBe(1)
      })
    }
  }

  test("the wider startup purge also respects the melt-flow limit", () => {
    const profile = resolveProfile({ layerHeight: 0.1, printSpeed: 100, printTemperature: 205, bedTemperature: 60, extrusionWidth: 0.6, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 1, supportType: "none", flow: 150, firstLayerSpeed: 100, minLayerTime: 0, maxVolumetricFlow: 0.503 })
    const { gcode } = emitGcode({ profile, notes: [], layers: [{ index: 0, z: 0.1, height: 0.1, paths: [{ kind: "wall-outer", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }] }] }] })
    const motionsSeen: PrintMotion[] = []
    replayBeads(gcode, { onMotion: (m) => motionsSeen.push(m) })
    const positive = motionsSeen.filter((m) => m.e > 0)
    expect(positive).toHaveLength(2)
    for (const m of positive) {
      const seconds = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) / (m.feed / 60)
      expect(m.e * Math.PI * (profile.filamentDiameter / 2) ** 2 / seconds).toBeLessThanOrEqual(profile.maxVolumetricFlow + 1e-5)
    }
  })

  test("an unrepresentable flow-limited feed is refused instead of rounded above the ceiling", () => {
    const profile = resolveProfile({ layerHeight: 0.1, printSpeed: 100, printTemperature: 205, bedTemperature: 60, extrusionWidth: 0.6, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 1, supportType: "none", maxVolumetricFlow: 1e-9 })
    expect(() => emitGcode({ profile, notes: [], layers: [{ index: 0, z: 0.1, height: 0.1, paths: [{ kind: "wall-outer", points: [{ x: 100, y: 100 }, { x: 116, y: 100 }] }] }] })).toThrow(/precision/)
  })

  test("short segments obey the ceiling after XYZ and E have been rounded", () => {
    const profile = resolveProfile({ layerHeight: 0.1, printSpeed: 100, printTemperature: 205, bedTemperature: 60, extrusionWidth: 0.6, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 1, supportType: "none", flow: 150, minLayerTime: 0, bedWidth: 20, maxVolumetricFlow: 0.503 })
    for (const end of [1.00449, 1.00049]) {
      const { gcode } = emitGcode({ profile, notes: [], layers: [{ index: 0, z: 0.1, height: 0.1, paths: [{ kind: "wall-outer", points: [{ x: 1.0001, y: 2 }, { x: end, y: 2 }] }] }] })
      const line = gcode.split("\n").find((line) => /^G1 X/.test(line) && / E/.test(line))!
      const e = Number(/ E([\d.]+)/.exec(line)![1])
      const feed = Number(/ F([\d.]+)/.exec(line)![1])
      const distance = Math.abs(Number(end.toFixed(3)) - 1)
      const seconds = (distance > 0 ? distance : e) / (feed / 60)
      expect(e).toBeGreaterThan(0)
      expect(e * Math.PI * (profile.filamentDiameter / 2) ** 2 / seconds).toBeLessThanOrEqual(profile.maxVolumetricFlow + 1e-5)
    }
  })
})
