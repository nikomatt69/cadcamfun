/**
 * What a probe run looks like in the 3D view (spec 73 §4): the contacts the stylus made, the deviation of each from where the drawn
 * part would have stopped it (exaggerated so a few microns are visible), the work coordinate system before and after the run moved
 * it, tilted probing frames and the calibration spheres of a rotary calibration.
 *
 * `probeOverlayModel` is pure (testable without WebGL); `createProbeOverlay` builds named Three.js objects from it and `update(seconds)`
 * reveals contacts as playback reaches them and moves the triad from before to after at `switchAt`.
 */
import * as THREE from "three"
import type { Vec3 } from "@cadcamfun/core"
import type { OffsetEntry, ProbeContact, ProbeSimOutcome } from "../../features/cam/lib/probing/contract.ts"
import { frameAxes, triad } from "./triad.ts"

export interface ProbeOverlayInput {
  readonly outcome: ProbeSimOutcome
  /** Where each touch was expected (the planned routine's contacts), matched to the outcome's contacts in order. */
  readonly expected?: ReadonlyArray<ProbeContact>
  /** The active work offset before the run and after it (core units); the triad shows the move between them. */
  readonly before?: OffsetEntry
  readonly after?: OffsetEntry
  /** Playback time of each contact, seconds (from `contact-times`); absent: every contact is shown. */
  readonly times?: ReadonlyArray<number | undefined>
  readonly deviationScale: number
  /** Tilted probing frames (5-axis probing): origin and X / Y axes in work coordinates. */
  readonly frames?: ReadonlyArray<{ readonly origin: Vec3; readonly x: Vec3; readonly y: Vec3 }>
  /** Rotary calibration: the sphere centre measured at each angle. */
  readonly spheres?: ReadonlyArray<{ readonly centre: Vec3; readonly diameter: number }>
  readonly triadLength?: number
}

export interface OverlayContact { readonly index: number; readonly name: string; readonly tip: Vec3; readonly time?: number }
export interface OverlayDeviation { readonly index: number; readonly from: Vec3; readonly to: Vec3; readonly magnitude: number }
export interface ProbeOverlayModel {
  readonly contacts: ReadonlyArray<OverlayContact>
  readonly deviations: ReadonlyArray<OverlayDeviation>
  /** The work origin after the run, in the work coordinates of the offset before it (zero vector when nothing moved). */
  readonly wcsShift: Vec3
  /** Rotation of the new work coordinates about the tool axis, radians. */
  readonly wcsRotation: number
  /** Playback time the triad moves at (the last contact); undefined: it shows the result at once. */
  readonly switchAt?: number
  readonly frames: NonNullable<ProbeOverlayInput["frames"]>
  readonly spheres: NonNullable<ProbeOverlayInput["spheres"]>
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

export const probeOverlayModel = (input: ProbeOverlayInput): ProbeOverlayModel => {
  const contacts = input.outcome.contacts.map((c, index) => {
    const time = input.times?.[index]
    return { index, name: c.name ?? input.expected?.[index]?.name ?? `#${index + 1}`, tip: c.tip, ...(time !== undefined ? { time } : {}) }
  })
  const deviations: OverlayDeviation[] = []
  for (const contact of contacts) {
    const expected = input.expected?.[contact.index]?.expected
    if (expected === undefined) continue
    const d = sub(contact.tip, expected)
    const k = input.deviationScale
    deviations.push({ index: contact.index, from: expected, to: { x: expected.x + d.x * k, y: expected.y + d.y * k, z: expected.z + d.z * k }, magnitude: len(d) })
  }
  const before = input.before ?? { x: 0, y: 0, z: 0 }
  const after = input.after ?? before
  // The new origin seen from the old work coordinates: machine delta rotated back by the old rotation.
  const r = before.rotation ?? 0
  const dx = after.x - before.x, dy = after.y - before.y
  const wcsShift = { x: Math.cos(r) * dx + Math.sin(r) * dy, y: -Math.sin(r) * dx + Math.cos(r) * dy, z: after.z - before.z }
  const times = contacts.map((c) => c.time).filter((t): t is number => t !== undefined)
  return {
    contacts, deviations, wcsShift, wcsRotation: (after.rotation ?? 0) - r,
    ...(times.length > 0 ? { switchAt: Math.max(...times) } : {}),
    frames: input.frames ?? [], spheres: input.spheres ?? []
  }
}

export interface ProbeOverlay {
  readonly root: THREE.Group
  /** Reveal what playback reached by `seconds`; `Infinity` shows the whole run. */
  update(seconds: number): void
  /** A short flash of the contact made at `index` (the stylus pulse while playing). */
  pulse(index: number): void
  dispose(): void
}

export const PROBE_COLORS = { contact: 0x22d3ee, deviation: 0xf59e0b, frame: 0xa78bfa, sphere: 0x94a3b8 } as const

export const createProbeOverlay = (model: ProbeOverlayModel, options: { readonly triadLength?: number; readonly contactRadius?: number } = {}): ProbeOverlay => {
  const root = new THREE.Group()
  root.name = "probe-overlay"
  const length = options.triadLength ?? 30
  const radius = options.contactRadius ?? 0.6
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const own = <G extends THREE.BufferGeometry>(g: G) => { geometries.push(g); return g }
  const mat = <M extends THREE.Material>(m: M) => { materials.push(m); return m }

  const contactGeometry = own(new THREE.SphereGeometry(radius, 12, 8))
  const contacts = model.contacts.map((c) => {
    const mesh = new THREE.Mesh(contactGeometry, mat(new THREE.MeshBasicMaterial({ color: PROBE_COLORS.contact })))
    mesh.name = `probe:contact:${c.index}`
    mesh.position.set(c.tip.x, c.tip.y, c.tip.z)
    mesh.userData = { time: c.time, name: c.name }
    root.add(mesh)
    return mesh
  })
  for (const d of model.deviations) {
    const line = new THREE.Line(own(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(d.from.x, d.from.y, d.from.z), new THREE.Vector3(d.to.x, d.to.y, d.to.z)])),
      mat(new THREE.LineBasicMaterial({ color: PROBE_COLORS.deviation })))
    line.name = `probe:deviation:${d.index}`
    line.userData = { magnitude: d.magnitude }
    root.add(line)
  }
  const before = triad(frameAxes(), length, "probe:wcs:before", { opacity: 0.35 })
  const c = Math.cos(model.wcsRotation), s = Math.sin(model.wcsRotation)
  const after = triad(frameAxes({ x: c, y: s, z: 0 }, { x: -s, y: c, z: 0 }), length, "probe:wcs:after")
  after.position.set(model.wcsShift.x, model.wcsShift.y, model.wcsShift.z)
  const moved = len(model.wcsShift) > 1e-9 || Math.abs(model.wcsRotation) > 1e-12
  const wcs = new THREE.Group()
  wcs.name = "probe:wcs"
  wcs.add(before, after)
  root.add(wcs)
  model.frames.forEach((f, i) => {
    const frame = triad(frameAxes(f.x, f.y), length * 0.6, `probe:frame:${i}`)
    frame.position.set(f.origin.x, f.origin.y, f.origin.z)
    root.add(frame)
  })
  model.spheres.forEach((sphere, i) => {
    const mesh = new THREE.Mesh(own(new THREE.SphereGeometry(sphere.diameter / 2, 24, 16)), mat(new THREE.MeshBasicMaterial({ color: PROBE_COLORS.sphere, wireframe: true, transparent: true, opacity: 0.5 })))
    mesh.name = `probe:calibration:${i}`
    mesh.position.set(sphere.centre.x, sphere.centre.y, sphere.centre.z)
    root.add(mesh)
  })
  const pulses = new Map<number, number>()
  const update = (seconds: number) => {
    for (const mesh of contacts) {
      const time = mesh.userData.time as number | undefined
      mesh.visible = time === undefined || time <= seconds
      const pulse = pulses.get(Number(mesh.name.split(":")[2]))
      mesh.scale.setScalar(pulse !== undefined && performanceNow() - pulse < 300 ? 1.8 : 1)
    }
    for (const child of root.children) if (child.name.startsWith("probe:deviation:")) {
      const index = Number(child.name.split(":")[2])
      child.visible = contacts[index]?.visible ?? true
    }
    const switched = !moved || model.switchAt === undefined || seconds >= model.switchAt
    before.visible = moved
    after.visible = switched
    if (!switched) after.visible = false
  }
  update(Infinity)
  return {
    root,
    update,
    pulse: (index) => { pulses.set(index, performanceNow()) },
    dispose: () => { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose() }
  }
}

const performanceNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now())
