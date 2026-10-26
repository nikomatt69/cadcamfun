import { expect, test } from "bun:test"
import * as THREE from "three"
import { AO_TIERS, IdleAmbientOcclusion, IdleTrigger, aoRadiusFor, leavesOutAo } from "./ao.ts"
import { LineBudget, createLines } from "./lines.ts"

/** A manual clock: timers fire only when the test advances it. */
const clock = () => {
  let now = 0, next = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  return {
    setTimer: (callback: () => void, ms: number) => { const id = next++; timers.set(id, { at: now + ms, callback }); return id },
    clearTimer: (handle: unknown) => { timers.delete(handle as number) },
    advance: (ms: number) => {
      now += ms
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback() }
    },
    get pending() { return timers.size }
  }
}

test("the idle trigger fires once, a quiet period after the LAST arm", () => {
  const time = clock()
  let fired = 0
  const trigger = new IdleTrigger(() => fired++, 250, time.setTimer, time.clearTimer)
  trigger.arm()
  time.advance(200)
  trigger.arm() // a frame was drawn: the quiet period starts over
  time.advance(200)
  expect(fired).toBe(0)
  expect(trigger.pending).toBe(true)
  time.advance(60)
  expect(fired).toBe(1)
  expect(trigger.pending).toBe(false)
  time.advance(1000)
  expect(fired).toBe(1)
  trigger.arm(); trigger.cancel()
  time.advance(1000)
  expect(fired).toBe(1)
  expect(time.pending).toBe(0)
})

test("tiers: none on low, half resolution on standard, full on high", () => {
  expect(AO_TIERS.low).toBeUndefined()
  expect(AO_TIERS.standard!.scale).toBe(0.5)
  expect(AO_TIERS.balanced!.intensity).toBeLessThan(AO_TIERS.standard!.intensity)
  expect(AO_TIERS.high!.scale).toBe(1)
})

const harness = (quality: "low" | "standard" | "high", busy = false) => {
  const time = clock()
  const drawn: string[] = []
  const ao = new IdleAmbientOcclusion({
    renderer: {} as THREE.WebGLRenderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    render: () => drawn.push("render"), quality: () => quality, busy: () => busy, delayMs: 250, setTimer: time.setTimer, clearTimer: time.clearTimer
  })
  return { ao, time, drawn }
}

test("on low quality nothing is ever scheduled", () => {
  const { ao, time } = harness("low")
  expect(ao.enabled).toBe(false)
  ao.arm()
  expect(time.pending).toBe(0)
})

test("a frame that is still pending postpones nothing and draws nothing; a failing GPU disables AO for good and redraws the plain picture", () => {
  const busy = harness("standard", true)
  busy.ao.arm()
  busy.time.advance(300)
  expect(busy.drawn).toEqual([])
  expect(busy.ao.enabled).toBe(true)

  // The fake renderer has no GL: drawing throws, AO turns itself off and the plain frame is drawn.
  const warn = console.warn
  console.warn = () => {}
  try {
    const failing = harness("standard")
    failing.ao.arm()
    failing.time.advance(300)
    expect(failing.ao.enabled).toBe(false)
    expect(failing.drawn.length).toBeGreaterThan(0)
    failing.ao.arm()
    expect(failing.time.pending).toBe(0)
  } finally { console.warn = warn }
})

test("what occludes: solids yes; lines, thick lines, outlines, ghosts, flagged and excluded objects no", () => {
  const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 }))
  const outline = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); outline.userData.isOutline = true
  const flagged = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); flagged.userData.noAO = true
  const thin = createLines([0, 0, 0, 1, 0, 0], {}, { quality: "low" })
  const thick = createLines([0, 0, 0, 1, 0, 0], {}, { quality: "standard", budget: new LineBudget(10) })
  expect(leavesOutAo(solid)).toBe(false)
  for (const object of [ghost, outline, flagged, thin, thick, new THREE.Points(), new THREE.Sprite()]) expect(leavesOutAo(object)).toBe(true)
  expect(leavesOutAo(solid, (object) => object === solid)).toBe(true)
})

test("the radius is a few percent of the scene diagonal", () => {
  expect(aoRadiusFor(new THREE.Box3())).toBe(1)
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 0, 0))
  expect(aoRadiusFor(box)).toBeCloseTo(4, 6)
})
