/** The probe overlay without WebGL (spec 73 §4): model, named objects, playback reveal, WCS move, contact times. */
import { expect, test } from "bun:test"
import * as THREE from "three"
import { createProbeOverlay, probeOverlayModel } from "../src/viewport/view3d/probe-overlay.ts"
import { contactTimes } from "../src/features/cam/lib/probing/contact-times.ts"
import type { ProbeSimOutcome } from "../src/features/cam/lib/probing/contract.ts"

const outcome = (over: Partial<ProbeSimOutcome> = {}): ProbeSimOutcome => ({
  contacts: [{ name: "x+", tip: { x: 10.004, y: 0, z: -3 }, moveIndex: 4, line: 12 }, { name: "x-", tip: { x: -9.996, y: 0, z: -3 }, moveIndex: 9, line: 20 }],
  variables: {}, results: {}, offsets: {}, updates: [], tools: [], inspections: [], alarms: [], reports: [], path: [], ...over
})
const expected = [{ name: "x+", expected: { x: 10, y: 0, z: -3 }, direction: { x: 1, y: 0, z: 0 } }, { name: "x-", expected: { x: -10, y: 0, z: -3 }, direction: { x: -1, y: 0, z: 0 } }]

test("model: deviations exaggerated by the scale, WCS shift seen from the old offset, switch at the last contact", () => {
  const model = probeOverlayModel({
    outcome: outcome(), expected, deviationScale: 100, times: [1.5, 2.5],
    before: { x: 100, y: 50, z: -200, rotation: Math.PI / 2 }, after: { x: 100.3, y: 50, z: -200, rotation: Math.PI / 2 + 0.01 }
  })
  expect(model.deviations[0]!.magnitude).toBeCloseTo(0.004, 9)
  expect(model.deviations[0]!.to.x).toBeCloseTo(10.4, 9)
  // A +0.3 machine X move under a 90° rotated offset is -0.3 along the old work Y.
  expect(model.wcsShift.x).toBeCloseTo(0, 9)
  expect(model.wcsShift.y).toBeCloseTo(-0.3, 9)
  expect(model.wcsRotation).toBeCloseTo(0.01, 12)
  expect(model.switchAt).toBe(2.5)
})

test("objects are named, contacts appear as playback reaches them, the triad moves at the switch", () => {
  const model = probeOverlayModel({ outcome: outcome(), expected, deviationScale: 50, times: [1, 2], after: { x: 0.2, y: 0, z: 0 },
    frames: [{ origin: { x: 0, y: 0, z: 10 }, x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 } }], spheres: [{ centre: { x: 0, y: 0, z: 50 }, diameter: 25 }] })
  const overlay = createProbeOverlay(model)
  const names = (o: THREE.Object3D) => o.children.map((c) => c.name)
  expect(names(overlay.root)).toEqual(["probe:contact:0", "probe:contact:1", "probe:deviation:0", "probe:deviation:1", "probe:wcs", "probe:frame:0", "probe:calibration:0"])
  overlay.update(1.2)
  expect(overlay.root.getObjectByName("probe:contact:0")!.visible).toBe(true)
  expect(overlay.root.getObjectByName("probe:contact:1")!.visible).toBe(false)
  expect(overlay.root.getObjectByName("probe:deviation:1")!.visible).toBe(false)
  expect(overlay.root.getObjectByName("probe:wcs:after")!.visible).toBe(false)
  expect(overlay.root.getObjectByName("probe:wcs:before")!.visible).toBe(true)
  overlay.update(2)
  expect(overlay.root.getObjectByName("probe:wcs:after")!.visible).toBe(true)
  expect(overlay.root.getObjectByName("probe:wcs:after")!.position.x).toBeCloseTo(0.2)
  overlay.pulse(1)
  overlay.update(2)
  expect(overlay.root.getObjectByName("probe:contact:1")!.scale.x).toBeGreaterThan(1)
  overlay.dispose()
})

test("contact times come from the NC line of each touch through the move that line wrote", () => {
  const lines = [1, 2, 3, 12, 12, 13, 20, 21]
  const ends = new Map([["0:3", 4.25], ["0:6", 7.5]])
  expect(contactTimes(outcome().contacts, lines, ends)).toEqual([4.25, 7.5])
  expect(contactTimes([{ tip: { x: 0, y: 0, z: 0 }, moveIndex: 0 }], lines, ends)).toEqual([undefined])
  expect(contactTimes(outcome().contacts, undefined, ends)).toEqual([undefined, undefined])
})
