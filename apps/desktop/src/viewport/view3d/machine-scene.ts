/**
 * The machine around a CAM program, as Three.js objects (spec 31 §5): the bodies of `cam.viewer.machineBodies` (vise, clamps,
 * table; lathe chuck, jaws, bar; printer bed and build volume), the machine triad, the lathe tool or the printer nozzle, the
 * live turned part, the printer's deposited beads, and the moves that run into the workholding in red.
 *
 * Everything it shows comes from the pure core (`cam.viewer`): this module only builds meshes and moves them with
 * `update(seconds)`. `View3D` mounts it when it is given a `machine`; without one nothing here runs (the CAD editor and older
 * callers see no change).
 */
import * as THREE from "three"
import { cam, type Vec3 } from "@cadcamfun/core"
import { toolObject } from "./tool-object.ts"

const v = cam.viewer

export interface MachineDisplay {
  readonly showWorkholding: boolean
  readonly showTriad: boolean
  /** Turn the spinning part (tool or bar) with the spindle. */
  readonly spin: boolean
  /** Printer: show only what is deposited by now, or the whole print. */
  readonly depositMode: "progressive" | "all"
  /** Printer: highest layer shown (index into the layers), all when absent. */
  readonly layer?: number
  /** Rotary mills: the part stays and the tool leans (`part`), or the tool stays vertical and the table turns (`machine`). */
  readonly frame?: "part" | "machine"
}

export const DEFAULT_MACHINE_DISPLAY: MachineDisplay = { showWorkholding: true, showTriad: true, spin: true, depositMode: "progressive" }

export interface MachineSceneInput {
  readonly setup: cam.viewer.MachineSetup
  readonly program: cam.Program
  readonly motion?: cam.viewer.MotionTrack
  readonly display: MachineDisplay
  /** The cutter radius and reach used by the workholding check (mill). */
  readonly tool?: cam.viewer.ToolEnvelope
  /** Size the triad and labels to the scene. */
  readonly scale: number
  /** Where the machine is before the first move (`cam.viewer.programStart`). */
  readonly start?: Vec3
  /**
   * The tool of each toolpath when the program's operations use different ones (spec 32 §4.2): a lathe program that faces,
   * threads and parts off draws the facing insert, the threading insert and the parting blade in turn. `undefined` entries
   * (and a model of another machine) fall back to the set-up's tool.
   */
  readonly pathTools?: ReadonlyArray<cam.ToolModel | undefined>
}

export interface MachineScene {
  readonly root: THREE.Group
  readonly timeline: cam.viewer.Timeline
  readonly findings: ReadonlyArray<cam.viewer.SetupFinding>
  readonly layers: ReadonlyArray<number>
  /** Angle of what turns at `seconds` (mill: the tool about its axis; lathe: the bar about display +x), radians. */
  readonly spinAngle: (seconds: number) => number
  /** Moves the lathe tool / nozzle, spins the chuck, grows the turned part and the deposits. True when something moved. */
  readonly update: (seconds: number) => boolean
  readonly dispose: () => void
}

const COLORS = {
  jaw: 0x8b97a6, parallel: 0x64748b, "vise-base": 0x334155, clamp: 0xb45309, table: 0x1e293b, chuck: 0x475569, collet: 0x64748b,
  tailstock: 0x94a3b8, bed: 0x111827, "build-volume": 0x475569, stock: 0xc8a878
} as const

const material = (color: number, assumed: boolean, opacity = 1): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.5, transparent: assumed || opacity < 1, opacity: assumed ? 0.45 : opacity, depthWrite: !assumed, side: THREE.DoubleSide })

/** A revolved outline about display +x: `points` are (radius, x). Three's LatheGeometry turns about +Y, so it is laid onto +X. */
const revolveX = (points: ReadonlyArray<readonly [number, number]>, segments = 64): THREE.BufferGeometry => {
  const geometry = new THREE.LatheGeometry(points.map(([r, x]) => new THREE.Vector2(Math.max(0, r), x)), segments)
  geometry.rotateZ(-Math.PI / 2)
  return geometry
}

const bodyMesh = (body: cam.viewer.Body): THREE.Object3D => {
  const color = COLORS[body.role] ?? 0x94a3b8
  const shape = body.shape
  let object: THREE.Object3D
  if (shape.type === "box") {
    const size = new THREE.Vector3(shape.max.x - shape.min.x, shape.max.y - shape.min.y, shape.max.z - shape.min.z)
    const geometry = new THREE.BoxGeometry(Math.max(size.x, 1e-3), Math.max(size.y, 1e-3), Math.max(size.z, 1e-3))
    if (body.wire) {
      object = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: body.role === "build-volume" ? 0.35 : 0.8 }))
      geometry.dispose()
    } else {
      object = new THREE.Mesh(geometry, material(color, body.assumed))
      // The edges keep a body readable on the dark background, assumed (translucent) or not.
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: body.assumed ? 0xcbd5e1 : 0xe2e8f0, transparent: true, opacity: body.assumed ? 0.55 : 0.8 }))
      edges.name = "edges"
      object.add(edges)
    }
    object.position.set((shape.min.x + shape.max.x) / 2, (shape.min.y + shape.max.y) / 2, (shape.min.z + shape.max.z) / 2)
  } else if (shape.type === "cylinder-x") {
    const pts: Array<readonly [number, number]> = shape.inner > 0
      ? [[shape.inner, shape.x0], [shape.radius, shape.x0], [shape.radius, shape.x1], [shape.inner, shape.x1], [shape.inner, shape.x0]]
      : [[0, shape.x0], [shape.radius, shape.x0], [shape.radius, shape.x1], [0, shape.x1]]
    object = new THREE.Mesh(revolveX(pts), material(color, body.assumed))
  } else {
    object = new THREE.Mesh(revolveX([[0, shape.x0], [shape.r0, shape.x0], [shape.r1, shape.x1], [0, shape.x1]], 32), material(color, body.assumed))
  }
  if (body.rotateX !== undefined) {
    const pivot = new THREE.Group()
    pivot.rotation.x = body.rotateX
    pivot.add(object)
    object = pivot
  }
  object.name = `${body.role}:${body.id}${body.assumed ? " (assumed)" : ""}`
  object.userData.noFit = body.role === "table" || body.role === "vise-base"
  return object
}

const labelSprite = (text: string, color: number, size: number): THREE.Sprite => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : undefined
  const context = canvas?.getContext("2d") ?? null
  let map: THREE.Texture | null = null
  if (canvas && context) {
    canvas.width = 128; canvas.height = 64
    context.font = "bold 40px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`; context.fillText(text, 64, 32)
    map = new THREE.CanvasTexture(canvas)
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ ...(map ? { map } : { color }), transparent: true, depthTest: false }))
  sprite.scale.set(size * 2, size, 1)
  sprite.renderOrder = 30
  sprite.name = `label:${text}`
  return sprite
}

const triad = (setup: cam.viewer.MachineSetup, length: number): THREE.Group => {
  const group = new THREE.Group()
  group.name = "machine-triad"
  const { axes, rotary } = v.displayAxes(setup)
  for (const axis of axes) {
    const dir = new THREE.Vector3(axis.direction.x, axis.direction.y, axis.direction.z)
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), length, axis.color, length * 0.18, length * 0.09)
    arrow.name = `axis:${axis.name}`
    group.add(arrow)
    const label = labelSprite(`${axis.label}+`, axis.color, length * 0.22)
    label.position.copy(dir.clone().multiplyScalar(length * 1.18))
    group.add(label)
  }
  if (rotary !== undefined) {
    // An arc with an arrow head round the axis of what turns, in the sense of M3.
    const axis = new THREE.Vector3(rotary.axis.x, rotary.axis.y, rotary.axis.z)
    const sense = v.spinSense(setup.kind, "cw")
    const radius = length * 0.32
    const points: THREE.Vector3[] = []
    const ref = Math.abs(axis.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
    const u = ref.clone().sub(axis.clone().multiplyScalar(ref.dot(axis))).normalize()
    const w = axis.clone().cross(u)
    for (let i = 0; i <= 24; i++) {
      const a = sense * (i / 24) * Math.PI * 1.5
      points.push(axis.clone().multiplyScalar(length * 0.55).add(u.clone().multiplyScalar(radius * Math.cos(a))).add(w.clone().multiplyScalar(radius * Math.sin(a))))
    }
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xfacc15 }))
    arc.name = `rotary:${rotary.name}`
    group.add(arc)
    const label = labelSprite(rotary.name === "C" ? "C M3" : "S M3", 0xfacc15, length * 0.13)
    label.position.copy(points[points.length - 1]!.clone().add(w.clone().multiplyScalar(length * 0.1)))
    group.add(label)
  }
  return group
}

const layerColor = (layer: number, count: number): THREE.Color => new THREE.Color().setHSL(0.6 - 0.6 * (count > 1 ? layer / (count - 1) : 0), 0.85, 0.55)

export const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
      o.geometry.dispose()
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m instanceof THREE.SpriteMaterial) m.map?.dispose(); m.dispose() }
    }
  })
}

export const createMachineScene = (input: MachineSceneInput): MachineScene => {
  const { setup, program, display } = input
  const root = new THREE.Group()
  root.name = `machine:${setup.kind}`
  const timeline = v.buildTimeline(program, input.motion, v.DEFAULT_RAPID_RATE, input.start)
  const findings = v.checkSetup(setup, timeline, input.tool)
  const statics = new THREE.Group(); statics.name = "machine-bodies"
  const spinning = new THREE.Group(); spinning.name = "spindle"
  root.add(statics, spinning)
  const bodies = v.machineBodies(setup)
  for (const body of bodies) {
    if (!display.showWorkholding && body.role !== "stock" && body.role !== "bed") continue
    // The lathe bar is the live turned profile below, not its raw cylinder.
    if (setup.kind === "lathe" && body.role === "stock") continue
    // The mill stock outline is drawn by the viewport's stock box (its opacity setting applies).
    if (setup.kind === "mill" && body.role === "stock") continue
    ;(body.spins ? spinning : statics).add(bodyMesh(body))
  }
  if (display.showTriad) root.add(triad(setup, Math.max(30, Math.min(120, input.scale * 0.6))))

  // Moves into the workholding, drawn over the path in red.
  const hits = v.collidingMoves(setup, timeline, input.tool)
  if (hits.size > 0) {
    const positions: number[] = []
    for (const i of hits) {
      const m = timeline.moves[i]!
      const steps = m.center ? 24 : 1
      for (let k = 0; k < steps; k++) {
        const a = v.displayPoint(setup, v.pointOn(m, k / steps), m.state.xMode), b = v.displayPoint(setup, v.pointOn(m, (k + 1) / steps), m.state.xMode)
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xff2d2d, depthTest: false }))
    lines.renderOrder = 25; lines.name = "collisions"
    root.add(lines)
  }

  let tool: THREE.Group | undefined
  let turned: THREE.Mesh | undefined
  let beads: THREE.LineSegments | undefined
  let partial: THREE.Line | undefined
  let deposits: cam.viewer.Deposits | undefined
  let lastProfileAt = Number.NaN
  let lastProfileWall = 0
  const spin = display.spin ? v.spinTable(timeline, setup.kind) : undefined
  const spinAngle = (seconds: number): number => (spin ? v.spinAngleAt(timeline, setup.kind, spin, seconds) : 0)

  // One drawn tool per distinct model; the one of the playing toolpath is shown.
  const toolObjects = new Map<cam.ToolModel, THREE.Group>()
  const ownFamily = setup.kind === "lathe" ? "lathe" : setup.kind === "3dprinter" ? "nozzle" : undefined
  const modelOfPath = (path: number | undefined): cam.ToolModel | undefined => {
    const own = path !== undefined ? input.pathTools?.[path] : undefined
    return own !== undefined && own.family === ownFamily ? own : setup.kind === "mill" ? undefined : setup.tool
  }
  const toolObjectOf = (model: cam.ToolModel): THREE.Group => {
    let object = toolObjects.get(model)
    if (object === undefined) {
      object = toolObject(model, setup.kind === "lathe" ? { turret: setup.turret } : {})
      object.userData.tool = cam.describeTool(model)
      object.visible = false
      toolObjects.set(model, object)
      root.add(object)
    }
    return object
  }
  if (setup.kind === "lathe") {
    tool = toolObjectOf(modelOfPath(timeline.moves[0]?.path)!)
    tool.visible = true
    const marker = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
    const { back } = v.latheStockEnds(setup)
    marker.position.set(back - 2, 0, setup.workholding.chuckDiameter / 2 - 4)
    marker.name = "spindle-marker"
    spinning.add(marker)
  } else if (setup.kind === "3dprinter") {
    tool = toolObjectOf(setup.tool)
    tool.visible = true
    deposits = v.printerDeposits(timeline, setup.layerHeight)
    const positions = new Float32Array(deposits.beads.length * 6)
    const colors = new Float32Array(deposits.beads.length * 6)
    deposits.beads.forEach((b, i) => {
      positions.set([b.from.x, b.from.y, b.from.z, b.to.x, b.to.y, b.to.z], i * 6)
      const c = layerColor(b.layer, deposits!.layers.length)
      colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    beads = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }))
    beads.name = "deposits"
    root.add(beads)
    partial = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xfacc15 }))
    partial.name = "deposit-current"
    partial.visible = false
    root.add(partial)
    // Travel without filament: thin grey.
    const travel: number[] = []
    for (const i of deposits.travels) { const m = timeline.moves[i]!; travel.push(m.from.x, m.from.y, m.from.z, m.to.x, m.to.y, m.to.z) }
    const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(travel, 3))
    const travels = new THREE.LineSegments(tg, new THREE.LineDashedMaterial({ color: 0x6b7280, dashSize: 1.5, gapSize: 1.5, transparent: true, opacity: 0.6 }))
    travels.computeLineDistances(); travels.name = "travel"
    root.add(travels)
  }

  const updateTurned = (seconds: number): boolean => {
    if (setup.kind !== "lathe") return false
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    if (seconds === lastProfileAt || (Number.isFinite(lastProfileAt) && now - lastProfileWall < 60 && seconds > lastProfileAt && seconds < timeline.duration)) return false
    lastProfileAt = seconds; lastProfileWall = now
    const runs = v.profileRuns(v.turnedProfileAt(setup, timeline, seconds), 1e-6)
    if (turned) { spinning.remove(turned); turned.geometry.dispose(); (turned.material as THREE.Material).dispose(); turned = undefined }
    if (runs.length === 0) return true
    // Outline: along the outer radius from the chuck end to the free end, back along the bore.
    const outline: Array<readonly [number, number]> = [[runs[0]!.inner, runs[0]!.x0]]
    for (const r of runs) outline.push([r.outer, r.x0], [r.outer, r.x1])
    const last = runs[runs.length - 1]!
    outline.push([last.inner, last.x1])
    for (let i = runs.length - 1; i >= 0; i--) outline.push([runs[i]!.inner, runs[i]!.x1], [runs[i]!.inner, runs[i]!.x0])
    turned = new THREE.Mesh(revolveX(outline, 72), new THREE.MeshStandardMaterial({ color: COLORS.stock, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide }))
    turned.name = "turned-part"
    // A stripe along the bar so its rotation shows.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, last.x1 - runs[0]!.x0), 0.8, 0.4), new THREE.MeshBasicMaterial({ color: 0x7c2d12 }))
    stripe.position.set((last.x1 + runs[0]!.x0) / 2, 0, Math.min(...runs.map((r) => r.outer)) + 0.15)
    stripe.name = "bar-stripe"
    turned.add(stripe)
    spinning.add(turned)
    return true
  }

  const update = (seconds: number): boolean => {
    let changed = updateTurned(seconds)
    const pose = v.poseAt(timeline, seconds)
    const model = setup.kind === "lathe" ? modelOfPath(pose.move?.path) : undefined
    if (tool && model !== undefined) {
      const next = toolObjectOf(model)
      if (next !== tool) { next.position.copy(tool.position); tool.visible = false; tool = next; changed = true }
    }
    if (tool) {
      const d = v.displayPoint(setup, pose.point, pose.state?.xMode)
      if (tool.position.x !== d.x || tool.position.y !== d.y || tool.position.z !== d.z) { tool.position.set(d.x, d.y, d.z); changed = true }
      tool.visible = timeline.moves.length > 0
    }
    if (setup.kind === "lathe") {
      const angle = spinAngle(seconds)
      if (spinning.rotation.x !== angle) { spinning.rotation.x = angle; changed = true }
    }
    if (beads && deposits && partial) {
      const all = deposits.beads
      // Beads are in print order: the first `complete` are finished at `seconds`, the next one may be under the nozzle.
      let complete = all.length
      if (display.depositMode === "progressive") {
        let lo = 0, hi = all.length
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (all[mid]!.end <= seconds) lo = mid + 1; else hi = mid }
        complete = lo
      }
      const limit = display.layer === undefined ? all.length : (() => { const k = all.findIndex((b) => b.layer > display.layer!); return k < 0 ? all.length : k })()
      complete = Math.min(complete, limit)
      if (beads.geometry.drawRange.count !== complete * 2) { beads.geometry.setDrawRange(0, complete * 2); changed = true }
      const current = display.depositMode === "progressive" && complete < limit ? all[complete] : undefined
      if (current !== undefined && current.start < seconds) {
        const to = v.pointOn(timeline.moves[current.move]!, (seconds - current.start) / Math.max(1e-12, current.end - current.start))
        const attr = partial.geometry.getAttribute("position") as THREE.BufferAttribute
        attr.setXYZ(0, current.from.x, current.from.y, current.from.z); attr.setXYZ(1, to.x, to.y, to.z); attr.needsUpdate = true
        partial.visible = true; changed = true
      } else if (partial.visible) { partial.visible = false; changed = true }
    }
    return changed
  }
  update(0)

  return {
    root, timeline, findings, layers: deposits?.layers ?? [], spinAngle, update,
    dispose: () => { disposeObject(root); root.clear() }
  }
}

/** Display bounds of what the camera should frame: the machine root without the big table / vise base. */
export const fitBounds = (object: THREE.Object3D, into: THREE.Box3): THREE.Box3 => {
  object.updateMatrixWorld(true)
  object.traverse((o) => {
    if (o.userData.noFit) return
    let parent = o.parent
    while (parent) { if (parent.userData.noFit) return; parent = parent.parent }
    if ((o instanceof THREE.Mesh || o instanceof THREE.LineSegments) && o.geometry) {
      o.geometry.computeBoundingBox()
      const box = o.geometry.boundingBox
      if (box && !box.isEmpty()) into.union(box.clone().applyMatrix4(o.matrixWorld))
    }
  })
  return into
}

export interface MachineInfo {
  readonly findings: ReadonlyArray<cam.viewer.SetupFinding>
  readonly layers: ReadonlyArray<number>
  readonly timeline: cam.viewer.Timeline
}

export const machineSpatial = (setup: cam.viewer.MachineSetup, machine: MachineScene, seconds: number): Record<string, unknown> => {
  const pose = cam.viewer.poseAt(machine.timeline, seconds)
  const kinematics = cam.KINEMATICS[setup.kind]
  return {
    machine: setup.kind,
    rotates: kinematics.rotates,
    mapping: setup.kind === "lathe"
      ? `display x = program Z (chuck on the left), display z = ${setup.turret === "rear" ? "+" : "-"}X/2 (X is a diameter), display y = 0; ${setup.turret} turret`
      : "display = program coordinates (Z up)",
    axes: cam.viewer.displayAxes(setup).axes.map((a) => ({ name: a.name, direction: a.direction, positive: a.positive })),
    workholding: setup.kind === "mill" ? setup.workholding : setup.kind === "lathe" ? setup.workholding : { bed: setup.bed },
    assumed: setup.assumed,
    seconds,
    tool: { program: pose.point, display: cam.viewer.displayPoint(setup, pose.point, pose.state?.xMode), line: pose.state?.line, spindle: pose.state?.spindle, rpm: pose.state?.rpm },
    findings: machine.findings.map((f) => ({ code: f.code, severity: f.severity, line: f.line, message: f.message }))
  }
}

export type { Vec3 }
