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
import { gaugeOfTool } from "./tool-models.ts"

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
  /** Mills: draw the machine around the part — base, column, head, table, trunnion, fork head (spec 32 P5). */
  readonly showMachine?: boolean
  readonly showTool?: boolean
  readonly showHolder?: boolean
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
  /** The machine model's preset and travels (a library machine's work volume). */
  readonly machineOptions?: cam.viewer.MachineModelOptions
  /** Tip-to-spindle-nose length of each toolpath's tool, mm (the head stands that far up the tool axis). */
  readonly gaugeOf?: (path: number) => number
  /**
   * The tool of each toolpath when the program's operations use different ones (spec 32 §4.2): a lathe program that faces,
   * threads and parts off draws the facing insert, the threading insert and the parting blade in turn. `undefined` entries
   * (and a model of another machine) fall back to the set-up's tool.
   */
  readonly pathTools?: ReadonlyArray<cam.ToolModel | undefined>
}

export interface MachineScene {
  readonly root: THREE.Group
  readonly frame?: "part" | "machine"
  readonly timeline: cam.viewer.Timeline
  readonly findings: ReadonlyArray<cam.viewer.SetupFinding>
  readonly layers: ReadonlyArray<number>
  /** Angle of what turns at `seconds` (mill: the tool about its axis; lathe: the bar about display +x), radians. */
  readonly spinAngle: (seconds: number) => number
  /** Moves the lathe tool / nozzle, spins the chuck, grows the turned part and the deposits. True when something moved. */
  readonly update: (seconds: number) => boolean
  /** The machine model drawn round a mill (spec 32 P5), its travel / rotary limit findings and its links' placement. */
  readonly model?: cam.viewer.MachineModel
  readonly limits: ReadonlyArray<cam.viewer.LimitFinding>
  readonly placeMachine: (pose: cam.viewer.MachinePose) => boolean
  readonly dispose: () => void
}

const COLORS = {
  jaw: 0x8b97a6, parallel: 0x64748b, "vise-base": 0x334155, clamp: 0xb45309, table: 0x1e293b, chuck: 0x475569, collet: 0x64748b,
  tailstock: 0x94a3b8, bed: 0x111827, "build-volume": 0x475569, stock: 0xc8a878
} as const

const material = (color: number, assumed: boolean, opacity = 1): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.5, transparent: assumed || opacity < 1, opacity: assumed ? 0.45 : opacity, depthWrite: !assumed, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })

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
  for (const rotary of v.displayRotaryAxes(setup)) {
    const axis = new THREE.Vector3(rotary.axis.x, rotary.axis.y, rotary.axis.z)
    const ref = Math.abs(axis.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
    const u = ref.clone().sub(axis.clone().multiplyScalar(ref.dot(axis))).normalize(), w = axis.clone().cross(u)
    const points = Array.from({ length: 33 }, (_, i) => u.clone().multiplyScalar(length * 0.48 * Math.cos(i / 32 * Math.PI * 1.6)).addScaledVector(w, length * 0.48 * Math.sin(i / 32 * Math.PI * 1.6)))
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: rotary.name === "C" ? 0xfacc15 : 0x2dd4bf }))
    arc.name = `axis-rotation:${rotary.name}`
    const label = labelSprite(rotary.name, rotary.name === "C" ? 0xfacc15 : 0x2dd4bf, length * 0.2)
    label.position.copy(points[32]!)
    group.add(arc, label)
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
    // With the machine drawn, its own table stands under the workholding.
    if (setup.kind === "mill" && display.showMachine && body.role === "table") continue
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
  const millTurn = setup.kind === "lathe" && setup.turnMill !== undefined
  const inferredTools = millTurn ? v.turnMillToolModels(program, input.motion, "") : undefined
  const millingPaths = program.toolpaths.map((tp, i) => {
    const model = input.pathTools?.[i] ?? inferredTools?.get(tp.toolId)
    return millTurn && (model !== undefined ? model.family === "mill" || model.family === "probe" : v.turnMillPathIsMilling(program, i))
  })
  const milling = new Set(millingPaths.flatMap((yes, i) => yes ? [i] : []))
  const chuckPhases = millTurn ? v.turnMillChuckTrack(timeline, millingPaths, display.spin) : undefined
  const liveSpin = millTurn && display.spin ? v.spinTable(timeline, "mill") : undefined
  const turnMillBase = new THREE.Group(); turnMillBase.name = "mill-turn-machine"
  const turnMillRam = new THREE.Group(); turnMillRam.name = "mill-turn-carriage"

  // One drawn tool per distinct model; the one of the playing toolpath is shown.
  const toolObjects = new Map<cam.ToolModel, THREE.Group>()
  const ownFamily = setup.kind === "lathe" ? "lathe" : setup.kind === "3dprinter" ? "nozzle" : undefined
  const modelOfPath = (path: number | undefined): cam.ToolModel | undefined => {
    const own = path !== undefined ? input.pathTools?.[path] : undefined
    if (millTurn && path !== undefined && millingPaths[path]) return own?.family === "mill" || own?.family === "probe" ? own : inferredTools?.get(program.toolpaths[path]!.toolId)
    return own !== undefined && own.family === ownFamily ? own : setup.kind === "mill" ? undefined : setup.tool
  }
  const toolObjectOf = (model: cam.ToolModel): THREE.Group => {
    let object = toolObjects.get(model)
    if (object === undefined) {
      object = toolObject(model, { ...(setup.kind === "lathe" ? { turret: setup.turret } : {}), assumeHolder: display.showHolder !== false })
      if (display.showHolder === false) object.traverse((o) => { if (o.name.startsWith("holder")) o.visible = false })
      object.userData.tool = cam.describeTool(model)
      object.visible = false
      toolObjects.set(model, object)
      root.add(object)
    }
    return object
  }
  let bHead: THREE.Group | undefined
  if (setup.kind === "lathe") {
    tool = toolObjectOf(modelOfPath(timeline.moves[0]?.path)!)
    tool.visible = true
    if (setup.turnMill !== undefined) {
      bHead = new THREE.Group(); bHead.name = "turn-mill-b-head"
      for (const body of v.turnMillMachineBodies(setup)) {
        const mesh = modelBodyMesh(body, true)
        if (body.id === "b-head") mesh.name = "b-head-spindle"
        ;(body.link === "spindle" || body.link === "fork" ? bHead : turnMillBase).add(mesh)
      }
      const ram = new THREE.Mesh(new THREE.BoxGeometry(70, 110, 100), material(0x334155, true))
      ram.position.z = 50; ram.name = "mill-turn-ram"; turnMillRam.add(ram)
      root.add(bHead, turnMillBase, turnMillRam)
    }
    const marker = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
    const { back } = v.latheStockEnds(setup)
    marker.position.set(back - 2, 0, setup.workholding.chuckDiameter / 2 - 4)
    marker.name = "spindle-marker"
    spinning.add(marker)
  } else if (setup.kind === "3dprinter") {
    tool = toolObjectOf(modelOfPath(timeline.moves[0]?.path)!)
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
    const runs = v.profileRuns(v.turnedProfileAt(setup, timeline, seconds, millTurn ? milling : undefined), 1e-6)
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
    const model = setup.kind !== "mill" ? modelOfPath(pose.move?.path) : undefined
    if (tool && model !== undefined) {
      const next = toolObjectOf(model)
      if (next !== tool) { next.position.copy(tool.position); tool.visible = false; tool = next; changed = true }
    }
    if (tool) {
      const headPose = millTurn && setup.kind === "lathe" ? v.turnMillDisplayPose(setup, pose.point, pose.angles, display.frame ?? "machine", pose.state?.xMode) : undefined
      const d = headPose?.tip ?? v.displayPoint(setup, pose.point, pose.state?.xMode)
      if (tool.position.x !== d.x || tool.position.y !== d.y || tool.position.z !== d.z) { tool.position.set(d.x, d.y, d.z); changed = true }
      tool.visible = timeline.moves.length > 0 && display.showTool !== false
      if (headPose !== undefined) {
        const axis = new THREE.Vector3(headPose.axis.x, headPose.axis.y, headPose.axis.z)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
        const milling = model?.family === "mill" || model?.family === "probe"
        const toolQ = milling ? q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), liveSpin ? v.spinAngleAt(timeline, "mill", liveSpin, seconds) : 0)) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), headPose.machineAngle)
        if (!tool.quaternion.equals(toolQ)) { tool.quaternion.copy(toolQ); changed = true }
        if (bHead !== undefined) {
          const gauge = gaugeOfTool(model, display.showHolder !== false)
          bHead.position.set(d.x + axis.x * gauge, d.y + axis.y * gauge, d.z + axis.z * gauge)
          bHead.quaternion.copy(q); bHead.visible = display.showMachine === true && milling
          turnMillRam.position.copy(bHead.position); turnMillRam.rotation.x = headPose.machineAngle
          turnMillRam.visible = display.showMachine === true && milling
        }
        turnMillBase.rotation.x = headPose.machineAngle
        turnMillBase.visible = display.showMachine === true
        statics.rotation.x = headPose.machineAngle
        changed = true
      }
    }
    if (setup.kind === "lathe") {
      const indexed = millTurn && millingPaths[pose.move?.path ?? 0]
      const headPose = millTurn ? v.turnMillDisplayPose(setup, pose.point, pose.angles, display.frame ?? "machine") : undefined
      const angle = indexed ? headPose!.chuckAngle : chuckPhases ? v.turnMillChuckAngleAt(timeline, millingPaths, chuckPhases, seconds) + (headPose?.machineAngle ?? 0) : spinAngle(seconds)
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

  // The machine model: one group per link, placed every frame from the joints (`cam.viewer.machinePose`).
  const model = setup.kind === "mill" && display.showMachine ? cam.viewer.machineModelOf(setup, input.machineOptions) : undefined
  const linkGroups = new Map<cam.viewer.LinkRole, THREE.Group>()
  if (model !== undefined) {
    const group = new THREE.Group(); group.name = "machine-model"
    for (const body of model.bodies) {
      let link = linkGroups.get(body.link)
      if (link === undefined) { link = new THREE.Group(); link.name = `machine-link:${body.link}`; link.matrixAutoUpdate = false; linkGroups.set(body.link, link); group.add(link) }
      link.add(modelBodyMesh(body, model.assumed.length > 0))
    }
    root.add(group)
  }
  const rotary = setup.kind === "mill" ? setup.rotary : undefined
  const limits = model !== undefined ? cam.viewer.checkLimits(model, timeline, rotary, input.gaugeOf ?? (() => 0)) : setup.kind === "lathe" ? v.turnMillLimitFindings(setup, timeline) : []
  const placeMachine = (pose: cam.viewer.MachinePose): boolean => {
    let changed = false
    for (const [role, group] of linkGroups) {
      const m = pose.links[role]
      const target = new THREE.Matrix4().set(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!, m[8]!, m[9]!, m[10]!, m[11]!, 0, 0, 0, 1)
      if (!group.matrix.equals(target)) { group.matrix.copy(target); group.matrixWorldNeedsUpdate = true; changed = true }
    }
    return changed
  }

  return {
    root, frame: display.frame ?? (millTurn ? "machine" : "part"), timeline, findings, layers: deposits?.layers ?? [], spinAngle, update, ...(model !== undefined ? { model } : {}), limits, placeMachine,
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
  /** The machine model drawn, and the moves that leave its travels or rotary limits. */
  readonly model?: cam.viewer.MachineModel
  readonly limits?: ReadonlyArray<cam.viewer.LimitFinding>
}

const LINK_COLORS: Readonly<Record<cam.viewer.LinkRole, number>> = {
  base: 0x334155, column: 0x475569, head: 0x64748b, spindle: 0x94a3b8, table: 0x1e293b, cradle: 0x0f766e, platter: 0x14b8a6, fork: 0x7c3aed
}

/** A body of the machine model in its link's home position; translucent when the machine's sizes were assumed. */
const modelBodyMesh = (body: cam.viewer.ModelBody, assumed: boolean): THREE.Object3D => {
  const shape = body.shape
  let geometry: THREE.BufferGeometry
  const at = new THREE.Vector3()
  if (shape.type === "box") {
    geometry = new THREE.BoxGeometry(Math.max(1e-3, shape.max.x - shape.min.x), Math.max(1e-3, shape.max.y - shape.min.y), Math.max(1e-3, shape.max.z - shape.min.z))
    at.set((shape.min.x + shape.max.x) / 2, (shape.min.y + shape.max.y) / 2, (shape.min.z + shape.max.z) / 2)
  } else {
    geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.length, 48)
    // Three's cylinder stands along +Y.
    if (shape.axis === "z") geometry.rotateX(Math.PI / 2)
    else if (shape.axis === "x") geometry.rotateZ(-Math.PI / 2)
    at.set(shape.center.x, shape.center.y, shape.center.z)
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: LINK_COLORS[body.link], metalness: 0.4, roughness: 0.55, transparent: true, opacity: assumed ? 0.35 : 0.9, depthWrite: !assumed, side: THREE.DoubleSide }))
  mesh.position.copy(at)
  mesh.name = `machine-model:${body.id}`
  mesh.userData.noFit = true
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: assumed ? 0.4 : 0.7 }))
  mesh.add(edges)
  return mesh
}

export const machineSpatial = (setup: cam.viewer.MachineSetup, machine: MachineScene, seconds: number): Record<string, unknown> => {
  const pose = cam.viewer.poseAt(machine.timeline, seconds)
  const kinematics = cam.KINEMATICS[setup.kind]
  return {
    machine: setup.kind,
    ...(setup.kind === "lathe" && setup.turnMill !== undefined ? { kinematics: "mill-turn XYZBC", rotary: pose.angles, rotaryAxes: v.displayRotaryAxes(setup), removal: "turned profile only; local milling removal is not simulated" } : {}),
    rotates: kinematics.rotates,
    mapping: setup.kind === "lathe"
      ? `display x = program Z (chuck on the left), display z = ${setup.turret === "rear" ? "+" : "-"}X/2 (X is a diameter), display y = ${setup.turnMill !== undefined ? `${setup.turret === "rear" ? "+" : "-"}program Y` : "0"}; ${setup.turret} turret`
      : "display = program coordinates (Z up)",
    axes: cam.viewer.displayAxes(setup).axes.map((a) => ({ name: a.name, direction: a.direction, positive: a.positive })),
    workholding: setup.kind === "mill" ? setup.workholding : setup.kind === "lathe" ? setup.workholding : { bed: setup.bed },
    assumed: setup.assumed,
    seconds,
    tool: { program: pose.point, display: setup.kind === "lathe" && setup.turnMill !== undefined ? v.turnMillDisplayPose(setup, pose.point, pose.angles, machine.frame ?? "machine", pose.state?.xMode).tip : cam.viewer.displayPoint(setup, pose.point, pose.state?.xMode), line: pose.state?.line, spindle: pose.state?.spindle, rpm: pose.state?.rpm },
    findings: machine.findings.map((f) => ({ code: f.code, severity: f.severity, line: f.line, message: f.message }))
  }
}

export type { Vec3 }
