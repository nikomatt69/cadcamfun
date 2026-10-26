import { createDisplayEdgeLines, createLines, setLineDrawRange, syncLineResolution } from "../lines.ts"
import { Outline } from "../outline.ts"
import { GRID_COLORS, createAdaptiveGrid } from "../adaptive-grid.ts"
import { FrameScheduler } from "../../features/cad/lib/frame-scheduler.ts"
import { MeshWorkerQueue } from "./mesh-jobs.ts"
import { registerViewportCapture } from "../../features/ai/index.ts"
import { Show, createEffect, createSignal, onCleanup, onMount, untrack, type JSX } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { TransformControls } from "three/addons/controls/TransformControls.js"
import { ViewportControls, viewportLabels } from "./viewport-controls.tsx"
import { creasedNormals, isClosedShape, meshOf, tessellate, cam, type Drawing, type Solid, type Vec3 } from "@cadcamfun/core"
import { entityPaths, renderEntity } from "../editor2d/render.ts"
import { t } from "../../i18n/index.ts"
import { buildPlayback, emptyPlayback, positionAt, toolAt, toolColors, TOOL_COLORS, type Playback } from "./playback.ts"
import { toolpathOverlayModel, type ToolpathPointKind } from "./toolpath-overlays.ts"
import { toolObject } from "./tool-object.ts"
import { gaugeOfTool, previewToolFor } from "./tool-models.ts"
import { createDirectionArrows, type DirectionArrows } from "./direction-arrows.ts"
import { createCameraRig } from "../camera-rig.ts"
import { createVoxelStock, type VoxelStock } from "./voxel-stock.ts"
import { classLookup, pathBuffers, startedBy, type ColorMode, type LegendEntry } from "./toolpath-colors.ts"
import { createMachineScene, DEFAULT_MACHINE_DISPLAY, fitBounds, machineSpatial, type MachineDisplay, type MachineInfo, type MachineScene } from "./machine-scene.ts"
import { attachRenderLook, currentLookTier } from "../render-look-setting.ts"
import { createLiveStock, createStockSimulation, type LiveStock, type StockInfo } from "./stock-simulation.ts"
export { machineSpatial, type MachineInfo } from "./machine-scene.ts"

export type ViewPreset = "perspective" | "top" | "front" | "right" | "isometric" | "bottom" | "back" | "left" | "four-view"
export type RenderMode = "shaded" | "shaded-edges" | "wireframe" | "xray"
export type TransformMode = "none" | "translate" | "rotate" | "scale"
export interface ViewportTransform {
  readonly solidIndex: number
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
}

/** Settings the new lighting/material/section UI controls. */
export interface ViewportLighting {
  /** Ambient hemisphere intensity (0..2). */
  readonly ambient: number
  /** Directional (key) light intensity (0..4). */
  readonly directional: number
  /** Hemisphere fill intensity (0..2). */
  readonly hemisphere: number
}
export interface ViewportMaterial {
  readonly color: string
  readonly metalness: number
  readonly roughness: number
  readonly opacity: number
}
export interface ViewportSection {
  readonly enabled: boolean
  readonly axis: "x" | "y" | "z"
  readonly position: number
  readonly inverted: boolean
}
export interface View3DProps {
  readonly visionMode?: "cad" | "cam"
  readonly drawing?: Drawing
  readonly solids?: readonly Solid[]
  readonly extrusionHeight?: number
  readonly program?: cam.Program
  /** Cutters of the program by `toolId`; playback draws the one in the spindle as its 3D assembly. */
  readonly tools?: ReadonlyMap<string, cam.kernel.Cutter>
  /** Cutter for a `toolId` that `tools` does not know (the generator's settings tool). */
  readonly defaultTool?: cam.kernel.Cutter
  /**
   * The 3D model of the tools by `toolId` and of the default tool (spec 31: the same model the tool's Resources page shows);
   * they win over `tools` / `defaultTool`, which are drawn through the same model.
   */
  readonly toolModels?: ReadonlyMap<string, cam.ToolModel>
  readonly defaultToolModel?: cam.ToolModel
  readonly preset?: ViewPreset
  readonly playing?: boolean
  readonly playbackTime?: number
  readonly playbackRate?: number
  readonly onPlaybackTimeChange?: (seconds: number) => void
  readonly renderMode?: RenderMode
  readonly gridVisible?: boolean
  readonly axesVisible?: boolean
  readonly origin?: { readonly x: number; readonly y: number; readonly z: number }
  readonly stock?: { readonly origin: { readonly x: number; readonly y: number; readonly z: number }; readonly size: { readonly x: number; readonly y: number; readonly z: number } }
  readonly showControls?: boolean
  /** Optional screen controls placed immediately before Fullscreen, including in fullscreen mode. */
  readonly controlsFooter?: JSX.Element
  readonly onPresetChange?: (preset: ViewPreset) => void
  readonly onRenderModeChange?: (mode: RenderMode) => void
  readonly onSolidSelect?: (index: number | undefined) => void
  readonly onTransformCommit?: (transform: ViewportTransform) => void
  readonly lighting?: ViewportLighting
  readonly material?: ViewportMaterial
  readonly section?: ViewportSection
  /**
   * The machine the program runs on (spec 31): the vise / chuck / bed around it, its own axes, what turns. Lathe programs are
   * drawn with the spindle axis horizontal; without it the program is drawn as written, as before.
   */
  readonly machine?: cam.viewer.MachineSetup
  /** Spindle, extrusion and plane of every move (the parse's motion track); derived from the program when absent or stale. */
  readonly motion?: cam.viewer.MotionTrack
  readonly machineDisplay?: MachineDisplay
  /** The machine model's preset and travels (spec 32 P5), e.g. from the machine chosen in the library. */
  readonly machineOptions?: cam.viewer.MachineModelOptions
  /** What the machine scene found (set-up findings, printer layers) after each rebuild. */
  readonly onMachineInfo?: (info: MachineInfo) => void
  readonly toolpathDisplay?: {
    readonly showPoints: boolean
    readonly showPointLabels: boolean
    readonly pointFilter: "all" | ToolpathPointKind
    readonly pointSize: number
    readonly showArcCenters: boolean
    readonly showArcRadii: boolean
    readonly stockVisible: boolean
    readonly stockOpacity: number
    readonly arcTolerance: number
    /** Draw the cutter, shank and holder during playback (default true). */
    readonly showTool?: boolean
    /** Draw the holder, a generic one when the cutter has none (default true). */
    readonly showHolder?: boolean
    /** Arrows along the cuts showing the feed direction, and the start and end of the cutting (default true). */
    readonly showDirection?: boolean
    /** Draw the live stock: the material as the program removes it (default true). */
    readonly liveStock?: boolean
    /** Colour the path by tool (default), operation, move class, feed or height (spec 32 §4.4). */
    readonly colorMode?: ColorMode
    /** Toolpaths (operations) not drawn. */
    readonly hiddenPaths?: ReadonlyArray<number>
    /** `done`: draw only the moves that have started by the playhead (the path grows as it plays). */
    readonly progress?: "all" | "done"
    /** Operation names by toolpath index, for the legend. */
    readonly operationNames?: ReadonlyArray<string>
    /** Source lines of canned cycles (`cam.viewer.cycleLinesOf`), for the move classes. */
    readonly cycleLines?: ReadonlySet<number>
  }
  /** The colours the path is drawn in, after each rebuild (the legend). */
  readonly onPathLegend?: (legend: ReadonlyArray<LegendEntry>) => void
  /** The live stock's volumes, after every change (the panel's readout). */
  readonly onStockInfo?: (info: StockInfo | undefined) => void
}

export const disposeGroup = (group: THREE.Object3D): void => {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.SpriteMaterial) material.map?.dispose()
        material.dispose()
      }
    }
  })
  group.clear()
}

/** What the assistant needs to read a CAM frame: the machine, how program coordinates map to the picture, where the tool is. */
export function View3D(props: View3DProps) {
  let host: HTMLDivElement | undefined
  // A webview (or a test DOM) without WebGL must not take the whole screen down with it.
  const [noWebGl, setNoWebGl] = createSignal(false)
  const [meshError, setMeshError] = createSignal<string>()
  let invalidate = () => {}
  const [preset, updatePreset] = createSignal<ViewPreset>(props.preset ?? "perspective")
  const [mode, updateMode] = createSignal<RenderMode>(props.renderMode ?? "shaded-edges")
  const [gridVisible, setGridVisible] = createSignal(props.gridVisible ?? true)
  const [axesVisible, setAxesVisible] = createSignal(props.axesVisible ?? true)
  const [transformMode, setTransformMode] = createSignal<TransformMode>("none")
  const [selected, setSelected] = createSignal<number>()
  let fit = () => {}, appearance = () => {}, transform = () => {}, applyLighting = () => {}, applyMaterial = () => {}, applySection = () => {}
  let rebuild = () => {}, setPreset = () => {}
  let playback: Playback = emptyPlayback()
  let seconds = 0
  createEffect(() => { props.drawing; props.solids; props.extrusionHeight; props.program; props.stock; props.toolpathDisplay; props.tools; props.defaultTool; props.toolModels; props.defaultToolModel; props.machine; props.motion; props.machineDisplay; untrack(rebuild) })
  createEffect(() => { if (props.preset) updatePreset(props.preset) })
  createEffect(() => { preset(); untrack(setPreset) })
  createEffect(() => { if (props.renderMode) updateMode(props.renderMode) })
  createEffect(() => { if (props.gridVisible !== undefined) setGridVisible(props.gridVisible) })
  createEffect(() => { if (props.axesVisible !== undefined) setAxesVisible(props.axesVisible) })
  createEffect(() => { mode(); gridVisible(); axesVisible(); props.origin; untrack(appearance) })
  createEffect(() => { transformMode(); selected(); untrack(transform) })
  createEffect(() => { seconds = props.playbackTime ?? 0; props.playing; invalidate() })
  createEffect(() => { props.lighting; untrack(applyLighting) })
  createEffect(() => { props.material; untrack(applyMaterial) })
  createEffect(() => { props.section; untrack(applySection) })
  onMount(() => {
    if (!host) return
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000)
    scene.background = new THREE.Color("#2a2a2a")
    const orthographic = new THREE.OrthographicCamera(-100, 100, 100, -100, .01, 100000)
    let activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = camera
    camera.up.set(0, 0, 1)
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch { setNoWebGl(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.append(renderer.domElement)
    let dirty = true
    let frames: FrameScheduler | undefined
    invalidate = () => { dirty = true; frames?.invalidate() }
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.minDistance = .01; controls.maxDistance = 50000; controls.zoomSpeed = 1.5
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setSize(.8)
    scene.add(gizmo.getHelper())
    let selectedMesh: THREE.Mesh | undefined
    // The selection outline: an inverted hull (see `outline.ts`), one extra draw of the selected mesh.
    const outline = new Outline({ quality: currentLookTier })
    const dragging = (event: { value: unknown }) => { controls.enabled = !event.value }
    const commit = () => {
      if (!selectedMesh || selected() === undefined) return
      props.onTransformCommit?.({ solidIndex: selected()!, position: [selectedMesh.position.x, selectedMesh.position.y, selectedMesh.position.z], rotation: [selectedMesh.rotation.x, selectedMesh.rotation.y, selectedMesh.rotation.z], scale: [selectedMesh.scale.x, selectedMesh.scale.y, selectedMesh.scale.z] })
    }
    gizmo.addEventListener("dragging-changed", dragging)
    gizmo.addEventListener("mouseUp", commit)
    transform = () => {
      invalidate()
      gizmo.detach()
      if (selectedMesh && transformMode() !== "none" && props.onTransformCommit && preset() !== "four-view") { gizmo.setMode(transformMode() as "translate" | "rotate" | "scale"); gizmo.attach(selectedMesh) }
    }
    const content = new THREE.Group(), helpers = new THREE.Group()
    scene.add(content, helpers)
    // Toolpaths cut below Z0 in the CAM view: the grid there is an underlay, drawn first and never occluding them.
    const ground = createAdaptiveGrid({ focus: () => controls.target, underlay: props.visionMode === "cam", half: 20000 })
    const grid = ground.object
    const axes = new THREE.Group()
    for (const [end, color] of [[new THREE.Vector3(500, 0, 0), GRID_COLORS.axisX], [new THREE.Vector3(0, 500, 0), GRID_COLORS.axisY], [new THREE.Vector3(0, 0, 500), GRID_COLORS.axisZ]] as const) {
      axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([end.clone().negate(), end]), new THREE.LineBasicMaterial({ color })))
    }
    const origin = new THREE.AxesHelper(12)
    helpers.add(grid, axes, origin)
    // Studio environment, tone mapping and a camera-following rig; the lighting controls scale it, `low` uses them as before.
    const look = attachRenderLook(renderer, scene, { ambient: props.lighting?.ambient ?? 0.4, hemisphere: props.lighting?.hemisphere ?? 1, key: props.lighting?.directional ?? 1.5, keyPosition: [100, 100, 200] }, () => invalidate())
    applyLighting = () => {
      invalidate()
      const l = props.lighting
      if (l === undefined) return
      look.setLegacy({ ambient: l.ambient, hemisphere: l.hemisphere, key: l.directional })
    }
    applyMaterial = () => {
      invalidate()
      const m = props.material
      if (m === undefined) return
      const tint = new THREE.Color(m.color)
      content.traverse(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.color.copy(tint)
          object.material.metalness = m.metalness
          object.material.roughness = m.roughness
          if (m.opacity < 1) {
            object.material.transparent = true
            object.material.opacity = m.opacity
          } else {
            object.material.transparent = false
            object.material.opacity = 1
          }
          object.material.needsUpdate = true
        }
      })
    }
    // Clipping planes hide everything past a constant along one axis; "inverted"
    // flips the visible side. We use `localClippingEnabled` so a user-defined
    // plane participates in the same lighting model as the geometry.
    const clipPlanes: THREE.Plane[] = []
    renderer.localClippingEnabled = true
    applySection = () => {
      invalidate()
      clipPlanes.length = 0
      const s = props.section
      if (s === undefined || !s.enabled) {
        content.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.material.clippingPlanes = []
            object.material.clipIntersection = false
          }
        })
        return
      }
      const normal = new THREE.Vector3(s.axis === "x" ? 1 : 0, s.axis === "y" ? 1 : 0, s.axis === "z" ? 1 : 0)
      if (s.inverted) normal.negate()
      const constant = s.position * (s.inverted ? -1 : 1)
      const plane = new THREE.Plane(normal, -constant)
      clipPlanes.push(plane)
      content.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.material.clippingPlanes = clipPlanes
          object.material.clipIntersection = false
        }
      })
    }
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf59e0b }))
    scene.add(marker)
    // The tool in the spindle as its 3D assembly (cutting zone in the tool's colour, shank, holder), one group per toolId.
    const toolGroups = new Map<string, THREE.Group | null>()
    let machineScene: MachineScene | undefined
    let rotary: cam.viewer.RotarySetup | undefined
    const anglesOf = new Map<string, cam.viewer.Angles>()
    const zAxis = new THREE.Vector3(0, 0, 1)
    /** Where the tool is and how it leans at `seconds` on a rotary mill, and how the table is turned (machine frame). */
    /** Tip-to-spindle-nose length of a toolpath's tool as it is drawn (its holder, or the assumed one). */
    const gaugeOf = (path: number): number => gaugeOfTool(modelFor(props.program?.toolpaths[path]?.toolId ?? ""), props.toolpathDisplay?.showHolder !== false)
    const rotaryPose = (seconds: number): { readonly at: Vec3; readonly axis: THREE.Vector3; readonly table?: THREE.Matrix4 } | undefined => {
      const lathe = props.machine
      if (lathe?.kind === "lathe" && lathe.turnMill !== undefined && machineScene !== undefined) {
        const at = cam.viewer.poseAt(machineScene.timeline, seconds)
        const pose = cam.viewer.turnMillDisplayPose(lathe, at.point, at.angles, props.machineDisplay?.frame ?? "machine", at.state?.xMode)
        return { at: pose.tip, axis: new THREE.Vector3(pose.axis.x, pose.axis.y, pose.axis.z), table: new THREE.Matrix4().makeRotationX(pose.chuckAngle) }
      }
      if (machineScene?.model !== undefined) {
        // The machine drawn round the part (spec 32 P5): the same pose moves its links, the tool and the table.
        const at = cam.viewer.poseAt(machineScene.timeline, seconds)
        const path = at.move?.path ?? 0
        const pose = cam.viewer.machinePose(machineScene.model, at.point, at.angles, rotary, gaugeOf(path), props.machineDisplay?.frame ?? "part")
        if (machineScene.placeMachine(pose)) invalidate()
        const m = pose.part
        const table = new THREE.Matrix4().set(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!, m[8]!, m[9]!, m[10]!, m[11]!, 0, 0, 0, 1)
        return { at: pose.tip, axis: new THREE.Vector3(pose.axis.x, pose.axis.y, pose.axis.z).normalize(), table }
      }
      if (!rotary || !machineScene) return undefined
      const pose = cam.viewer.poseAt(machineScene.timeline, seconds)
      if ((props.machineDisplay?.frame ?? "part") === "machine") {
        const r = cam.viewer.rotationOf(pose.angles, rotary)
        const pv = rotary.pivot
        // x' = R (x - pivot) + pivot, as a 4x4 matrix for the turning table.
        const m = new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1)
        const t = new THREE.Vector3(pv.x, pv.y, pv.z).sub(new THREE.Vector3(pv.x, pv.y, pv.z).applyMatrix4(m))
        m.setPosition(t)
        const head = cam.viewer.toolAxisInMachine(pose.angles, rotary)
        return { at: cam.viewer.machinePointOf(pose.point, pose.angles, rotary), axis: new THREE.Vector3(head.x, head.y, head.z).normalize(), table: m }
      }
      const axis = cam.viewer.toolAxisInPart(pose.angles, rotary)
      return { at: cam.viewer.partPointOf(pose.point, pose.angles, rotary), axis: new THREE.Vector3(axis.x, axis.y, axis.z).normalize() }
    }
    /** Turns the part side (path, stock, setter, workholding) as the table does; identity in the part frame. */
    const placeTable = (table: THREE.Matrix4 | undefined): boolean => {
      const target = table ?? new THREE.Matrix4()
      const bodies = props.machine?.kind === "lathe" ? undefined : machineScene?.root.getObjectByName("machine-bodies")
      let changed = false
      for (const group of [content, bodies]) {
        if (!group) continue
        if (!group.matrix.equals(target)) { group.matrixAutoUpdate = false; group.matrix.copy(target); group.matrixWorldNeedsUpdate = true; changed = true }
      }
      return changed
    }
    const disposeMachine = (): void => { if (machineScene) { scene.remove(machineScene.root); machineScene.dispose(); machineScene = undefined } }
    /** The live stock (spec 32 §4.5): the material as the program removes it. */
    let liveStock: LiveStock | undefined
    const disposeStock = (): void => {
      if (liveStock === undefined) return
      content.remove(liveStock.mesh)
      liveStock.mesh.geometry.dispose()
      const material = liveStock.mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material.dispose()
      liveStock = undefined
    }
    /** The voxel stock of a rotary program (spec 32 P6): where the height field does not hold. */
    let voxelStock: VoxelStock | undefined
    const disposeVoxels = (): void => { if (voxelStock === undefined) return; content.remove(voxelStock.mesh); voxelStock.dispose(); voxelStock = undefined }
    let toolColorOf: ReadonlyMap<string, number> = new Map()
    // The path's two line objects and their segments' start times (for the "only what has run" draw range).
    let pathLines: { readonly cut?: THREE.Object3D; readonly cutStarts: Float64Array; readonly rapid?: THREE.Object3D; readonly rapidStarts: Float64Array; readonly arrows?: DirectionArrows } | undefined
    const disposeTools = (): void => { for (const g of toolGroups.values()) if (g) { scene.remove(g); disposeGroup(g) } toolGroups.clear() }
    /** The model the preview draws for a toolpath's tool: its own, the kernel's cutter, the generator's tool. A tool setter is
     * on the table (see `rebuild`): what moves is the cutter it measures. */
    const modelFor = (id: string): cam.ToolModel | undefined => previewToolFor(id, props)
    const toolGroupFor = (id: string): THREE.Group | null => {
      const known = toolGroups.get(id)
      if (known !== undefined) return known
      const model = modelFor(id)
      if (model === undefined || props.toolpathDisplay?.showTool === false || model.family === "lathe" || model.family === "nozzle") { toolGroups.set(id, null); return null }
      const group = toolObject(model, { color: toolColorOf.get(id) ?? 0xf59e0b, assumeHolder: props.toolpathDisplay?.showHolder !== false })
      if (props.toolpathDisplay?.showHolder === false) for (const child of [...group.children]) if (child.name.startsWith("holder")) { group.remove(child); disposeGroup(child) }
      group.name = `tool:${id}`
      group.visible = false
      scene.add(group)
      toolGroups.set(id, group)
      return group
    }
    let radius = 100
    /** The bounding sphere the camera rig sets near and far from; dropped whenever the scene is rebuilt. */
    let sphereCache: THREE.Sphere | undefined
    const meshJobs = new MeshWorkerQueue({
      create: () => new Worker(new URL("./mesh-worker.ts", import.meta.url), { type: "module" }),
      onError: (message) => { setMeshError(message); invalidate() }
    })
    const directions: Record<ViewPreset, readonly [number, number, number]> = { perspective: [1, -1, .8], isometric: [1, -1, 1], top: [0, 0, 1], bottom: [0, 0, -1], front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], "four-view": [1, -1, 1] }
    const orient = (view: ViewPreset, targetCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
      targetCamera.position.copy(controls.target).add(new THREE.Vector3(...directions[view]).normalize().multiplyScalar(radius * 3))
      targetCamera.up.set(0, view === "top" || view === "bottom" ? 1 : 0, view === "top" || view === "bottom" ? 0 : 1)
      targetCamera.lookAt(controls.target)
    }
    setPreset = () => {
      invalidate()
      activeCamera = preset() === "perspective" || preset() === "four-view" ? camera : orthographic
      controls.object = activeCamera; gizmo.camera = activeCamera
      controls.enabled = preset() !== "four-view"
      orthographic.zoom = 1
      orient(preset(), activeCamera)
      resize()
      controls.update()
      transform()
    }
    appearance = () => {
      invalidate()
      grid.visible = gridVisible(); axes.visible = axesVisible() && !machineScene; origin.visible = axesVisible() && !machineScene
      // A lathe works in the XZ plane: its grid lies there.
      ground.setPlane(props.machine?.kind === "lathe" ? "xz" : "xy")
      const machineTriad = machineScene?.root.getObjectByName("machine-triad")
      if (machineTriad) machineTriad.visible = axesVisible()
      origin.position.set(props.origin?.x ?? 0, props.origin?.y ?? 0, props.origin?.z ?? 0)
      content.traverse(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.wireframe = mode() === "wireframe"
          object.material.transparent = mode() === "xray"; object.material.opacity = mode() === "xray" ? .3 : 1
          object.material.depthWrite = mode() !== "xray"
          for (const child of object.children) if (!child.userData.isOutline) child.visible = mode() === "shaded-edges"
        }
      })
    }
    const installMesh = (mesh: { positions: Float32Array; indices: Uint32Array }, index?: number) => {
      const geometry = new THREE.BufferGeometry()
      // Smooth across the facets of a curved face, sharp along a real edge (crease angle 30 degrees).
      const shaded = creasedNormals(mesh)
      geometry.setAttribute("position", new THREE.BufferAttribute(shaded.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(shaded.indices, 1)); geometry.setAttribute("normal", new THREE.BufferAttribute(shaded.normals, 3))
      const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: .2, roughness: .65, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
      object.userData.solidIndex = index
      object.add(createDisplayEdgeLines(geometry, 25, invalidate, { color: 0x202830, width: 1.5 }, { quality: currentLookTier() }))
      content.add(object)
      appearance()
    }
    const addSolid = (solid: Solid, index?: number) => {
      const estimate = solid._tag === "Sphere" ? solid.rings * solid.rings * 2 : solid._tag === "Cylinder" ? solid.segments * 6 : solid._tag === "Revolve" ? solid.profile.length * (solid.segments ?? 64) * 6 : solid._tag === "Extrude" ? solid.profile.length * 6 : 24
      if (estimate > 50000 && typeof Worker !== "undefined") {
        meshJobs.submit(solid, (mesh) => {
          installMesh(mesh, index)
          if (meshJobs.pending === 0) fit()
        })
      } else installMesh(meshOf(solid, .1), index)
    }
    const addLines = (positions: number[], rapid: boolean, color?: number) => {
      if (!positions.length) return
      content.add(createLines(positions, rapid ? { color: color ?? 0xf59e0b, width: 1.6, dash: { dash: 2, gap: 1 } } : { color: color ?? 0x38bdf8, width: 1.6 }, { quality: currentLookTier() }))
    }
    const pointColor: Record<ToolpathPointKind, number> = { rapid: 0xef4444, cut: 0x22c55e, arc: 0x3b82f6, cycle: 0xa855f7 }
    const addPointLabel = (text: string, position: Vec3) => {
      const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 48
      const context = canvas.getContext("2d")
      if (!context) return
      context.fillStyle = "rgba(15,23,42,.9)"; context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = "#fff"; context.font = "24px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 64, 24)
      const texture = new THREE.CanvasTexture(canvas)
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
      const sprite = new THREE.Sprite(material); sprite.position.set(position.x, position.y, position.z + 2); sprite.scale.set(12, 4.5, 1)
      content.add(sprite)
    }
    rebuild = () => {
      invalidate()
      meshJobs.reset(); setMeshError(undefined)
      gizmo.detach(); outline.clear(); selectedMesh = undefined; setSelected(undefined)
      disposeStock(); disposeVoxels()
      props.onStockInfo?.(undefined)
      disposeGroup(content)
      for (const [index, solid] of (props.solids ?? []).entries()) addSolid(solid, index)
      if (props.stock && (props.machine === undefined || props.machine.kind === "mill")) {
        const { size, origin: stockOrigin } = props.stock
        const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z)
        const stock = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry), new THREE.LineBasicMaterial({ color: 0xc8a878, transparent: true, opacity: props.toolpathDisplay?.stockOpacity ?? .6 }))
        boxGeometry.dispose()
        stock.position.set(stockOrigin.x + size.x / 2, stockOrigin.y + size.y / 2, stockOrigin.z + size.z / 2); stock.visible = props.toolpathDisplay?.stockVisible ?? true; content.add(stock)
      }
      for (const raw of props.drawing?.entities ?? []) {
        if (!raw.visible || props.drawing?.layers.find(l => l.id === raw.layerId)?.visible === false) continue
        const e = renderEntity(raw)
        if ((props.extrusionHeight ?? 0) !== 0 && isClosedShape(e)) {
          for (const profile of tessellate(e, 0.1)) if (profile.length >= 3) addSolid({ _tag: "Extrude", profile, height: props.extrusionHeight ?? 0 })
        } else {
          const positions: number[] = []
          for (const points of entityPaths(e)) for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; if (a && b) positions.push(a.x, a.y, 0, b.x, b.y, 0) }
          addLines(positions, false)
        }
      }
      // With a machine the first move starts where that machine believably is, not at the work zero inside the part.
      const start = props.machine && props.program ? cam.viewer.programStart(props.machine.kind, props.program) : undefined
      playback = props.program ? buildPlayback(props.program, 5000, props.toolpathDisplay?.arcTolerance ?? .1, start) : emptyPlayback()
      disposeMachine()
      const machine = props.machine
      if (machine && props.program) {
        const cutter = props.tools?.get(props.program.toolpaths[0]?.toolId ?? "") ?? props.defaultTool
        const extent = props.stock ? Math.max(props.stock.size.x, props.stock.size.y, props.stock.size.z) : 100
        machineScene = createMachineScene({
          setup: machine, program: props.program, ...(props.motion !== undefined ? { motion: props.motion } : {}), display: { ...DEFAULT_MACHINE_DISPLAY, ...props.machineDisplay, showTool: props.toolpathDisplay?.showTool ?? props.machineDisplay?.showTool ?? true, showHolder: props.toolpathDisplay?.showHolder ?? props.machineDisplay?.showHolder ?? true },
          ...(start !== undefined ? { start } : {}),
          ...(props.machineOptions !== undefined ? { machineOptions: props.machineOptions } : {}),
          gaugeOf,
          ...(props.toolModels !== undefined ? { pathTools: props.program.toolpaths.map((tp) => props.toolModels!.get(tp.toolId)) } : {}),
          ...(cutter ? { tool: { radius: cutter.diameter / 2, length: cutter.stickout } } : {}),
          scale: machine.kind === "lathe" ? Math.max(machine.stock.diameter, machine.stock.length / 2) : machine.kind === "3dprinter" ? Math.max(machine.bed.width, machine.bed.depth) / 2 : extent
        })
        scene.add(machineScene.root)
        props.onMachineInfo?.({ findings: machineScene.findings, layers: machineScene.layers, timeline: machineScene.timeline, ...(machineScene.model !== undefined ? { model: machineScene.model } : {}), limits: machineScene.limits })
      }
      // The live stock: the material as the program removes it (spec 32 §4.5). A mill with a stock
      // and a cutter per tool: the height field is carved by the moves as the playhead advances.
      if (props.program && props.toolpathDisplay?.liveStock !== false) {
        const millStock = props.machine?.kind === "mill" ? props.machine.stock : undefined
        const box = millStock !== undefined
          ? { minX: millStock.min.x, maxX: millStock.max.x, minY: millStock.min.y, maxY: millStock.max.y, minZ: millStock.min.z, maxZ: millStock.max.z }
          : props.stock !== undefined
            ? { minX: props.stock.origin.x, maxX: props.stock.origin.x + props.stock.size.x, minY: props.stock.origin.y, maxY: props.stock.origin.y + props.stock.size.y, minZ: props.stock.origin.z, maxZ: props.stock.origin.z + props.stock.size.z }
            : undefined
        const timeline = machineScene?.timeline ?? cam.viewer.buildTimeline(props.program, props.motion, cam.viewer.DEFAULT_RAPID_RATE, start)
        if (box !== undefined) {
          const simulation = createStockSimulation({
            program: props.program,
            timeline,
            ...(props.machine !== undefined ? { machine: props.machine } : {}),
            ...(props.toolModels !== undefined ? { toolModels: props.toolModels } : {}),
            ...(props.tools !== undefined ? { tools: props.tools } : {}),
            ...(props.defaultToolModel !== undefined ? { defaultToolModel: props.defaultToolModel } : {}),
            ...(props.defaultTool !== undefined ? { defaultTool: props.defaultTool } : {}),
            stock: box
          })
          if (simulation !== undefined) {
            liveStock = createLiveStock(simulation, { opacity: props.toolpathDisplay?.stockOpacity ?? 0.85 })
            liveStock.mesh.visible = props.toolpathDisplay?.stockVisible ?? true
            content.add(liveStock.mesh)
            props.onStockInfo?.({ removed: simulation.removedVolume, remaining: simulation.remainingVolume, cell: simulation.sim.cell, missingTools: simulation.missingTools })
          } else if (props.machine?.kind === "mill" && props.machine.rotary !== undefined) {
            voxelStock = createVoxelStock({ program: props.program, timeline, rotary: props.machine.rotary, stock: props.machine.stock, tools: props, opacity: props.toolpathDisplay?.stockOpacity ?? 0.85 })
            voxelStock.mesh.visible = props.toolpathDisplay?.stockVisible ?? true
            content.add(voxelStock.mesh)
            props.onStockInfo?.({ removed: voxelStock.sim.removedVolume(), remaining: voxelStock.sim.remainingVolume(), cell: voxelStock.sim.voxel, missingTools: [] })
          }
        }
      }
      // A tool setter stands on the table where the program measures (its pad top is the length reference, Z0).
      const setterModel = props.defaultToolModel?.family === "setter" ? props.defaultToolModel : undefined
      if (setterModel !== undefined && props.program) {
        const first = props.program.toolpaths.flatMap((tp) => tp.moves).find((m) => m._tag === "Rapid" || m._tag === "Linear")
        const at = first && (first._tag === "Rapid" || first._tag === "Linear") ? first.to : { x: 0, y: 0, z: 0 }
        const body = toolObject(setterModel)
        body.position.set(at.x, at.y, 0)
        content.add(body)
      }
      const track = machineScene?.timeline.track
      // Program -> display: the identity, except on a lathe (spindle axis horizontal, X as a radius).
      // Rotary mills: every point in the part frame (a machine-coordinate program is turned back by its move's angles).
      rotary = machine?.kind === "mill" ? machine.rotary : undefined
      anglesOf.clear()
      const timed = new Map<string, cam.viewer.TimedMove>()
      if (machineScene && (rotary || machine?.kind === "lathe" && machine.turnMill !== undefined)) for (const m of machineScene.timeline.moves) { anglesOf.set(`${m.path}:${m.index}`, m.angles); timed.set(`${m.path}:${m.index}`, m) }
      const shown = (p: Vec3, path: number, index: number, seconds?: number): Vec3 => {
        const m = timed.get(`${path}:${index}`)
        const angles = m !== undefined && seconds !== undefined ? cam.viewer.lerpAngles(m.anglesFrom, m.angles, m.duration > 0 ? Math.max(0, Math.min(1, (seconds - m.start) / m.duration)) : 1) : anglesOf.get(`${path}:${index}`) ?? {}
        if (machine?.kind === "lathe") {
          const xMode = track ? cam.viewer.stateAt(track, path, index).xMode : undefined
          return machine.turnMill !== undefined ? cam.viewer.turnMillDisplayPose(machine, p, angles, "part", xMode).tip : cam.viewer.displayPoint(machine, p, xMode)
        }
        return rotary ? cam.viewer.partPointOf(p, angles, rotary) : p
      }
      // Rapids dashed; cuts one colour per tool, so the operations of a multi-tool program read apart.
      const colors = props.program ? toolColors(props.program) : new Map<string, number>()
      disposeTools()
      toolColorOf = colors
      // A printer's path is drawn by the machine scene: deposited beads and travel, not cuts.
      const display = props.toolpathDisplay
      const mode = display?.colorMode ?? "tool"
      let classOf: ((path: number, index: number) => cam.viewer.MoveClass | undefined) | undefined
      if (mode === "move" && props.program) {
        const timeline = machineScene?.timeline ?? cam.viewer.buildTimeline(props.program, props.motion, cam.viewer.DEFAULT_RAPID_RATE, start)
        const classes = cam.viewer.classifyMoves(timeline, {
          ...(machine !== undefined ? { kind: machine.kind } : {}),
          ...(machine?.kind === "mill" ? { stockTop: machine.stock.max.z } : props.stock ? { stockTop: props.stock.origin.z + props.stock.size.z } : {}),
          ...(display?.cycleLines !== undefined ? { cycleLines: display.cycleLines } : {})
        })
        classOf = classLookup(timeline, classes)
      }
      const buffers = pathBuffers(machine?.kind === "3dprinter" ? emptyPlayback() : playback, {
        mode, toolColors: colors, shown,
        ...(classOf !== undefined ? { classOf } : {}),
        ...(display?.operationNames !== undefined ? { operationNames: display.operationNames } : {}),
        ...(display?.hiddenPaths !== undefined ? { hidden: new Set(display.hiddenPaths) } : {})
      }, TOOL_COLORS)
      // Thick lines while the tier and the segment budget allow it (one pixel wide otherwise); colours per vertex, rapids dashed.
      const lineObject = (positions: Float32Array, rapidLine: boolean, colorsOf?: Float32Array): THREE.Object3D | undefined => {
        if (positions.length === 0) return undefined
        const line = createLines(positions, rapidLine
          ? { color: mode === "move" ? cam.viewer.MOVE_CLASS_COLORS.rapid : 0xf59e0b, width: 1.4, dash: { dash: 2, gap: 1 } }
          : { ...(colorsOf !== undefined ? { colors: colorsOf } : {}), width: 2, ...(colorsOf === undefined ? { color: 0x38bdf8 } : {}) }, { quality: currentLookTier() })
        line.name = rapidLine ? "toolpath:rapids" : "toolpath:cuts"
        content.add(line)
        return line
      }
      const rapidLine = lineObject(buffers.rapid.positions, true)
      const cutLine = lineObject(buffers.cut.positions, false, buffers.cut.colors)
      // Feed direction and where the cutting starts and ends; a printer's deposits are the machine scene's.
      const arrows = display?.showDirection === false || machine?.kind === "3dprinter" ? undefined : createDirectionArrows(buffers.cut)
      if (arrows !== undefined) content.add(arrows.object)
      pathLines = { ...(cutLine ? { cut: cutLine } : {}), cutStarts: buffers.cut.starts, ...(rapidLine ? { rapid: rapidLine } : {}), rapidStarts: buffers.rapid.starts, ...(arrows !== undefined ? { arrows } : {}) }
      props.onPathLegend?.(buffers.legend)
      if (props.program && props.toolpathDisplay) {
        const overlay = toolpathOverlayModel(props.program)
        if (props.toolpathDisplay.showPoints) {
          for (const point of overlay.points) {
            if (props.toolpathDisplay.pointFilter !== "all" && props.toolpathDisplay.pointFilter !== point.kind) continue
            const geometry = new THREE.SphereGeometry(props.toolpathDisplay.pointSize, 10, 8)
            const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: pointColor[point.kind], depthTest: false }))
            const at = machine?.kind === "lathe" ? cam.viewer.displayPoint(machine, point.position) : point.position
            marker.position.set(at.x, at.y, at.z); marker.renderOrder = 20; content.add(marker)
            if (props.toolpathDisplay.showPointLabels) addPointLabel(String(point.index), at)
          }
        }
        if (props.toolpathDisplay.showArcCenters || props.toolpathDisplay.showArcRadii) {
          for (const arc of overlay.arcs) {
            if (props.toolpathDisplay.showArcCenters) {
              const center = new THREE.Mesh(new THREE.SphereGeometry(props.toolpathDisplay.pointSize * 1.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf97316, depthTest: false }))
              center.position.set(arc.center.x, arc.center.y, arc.center.z); center.renderOrder = 21; content.add(center)
            }
            if (props.toolpathDisplay.showArcRadii) addLines([arc.center.x, arc.center.y, arc.center.z, arc.from.x, arc.from.y, arc.from.z], false, 0xf97316)
          }
        }
      }
      appearance()
      if (!initialized) { fit(); initialized = true }
    }
      sphereCache = undefined
    let initialized = false
    fit = () => {
      const box = new THREE.Box3().setFromObject(content)
      if (machineScene) fitBounds(machineScene.root, box)
      if (!box.isEmpty()) { box.getCenter(controls.target); radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2) }
      setPreset()
    }
    const resize = () => {
      invalidate()
      if (!host) return
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); syncLineResolution(scene, width, height)
      const aspect = width / height
      orthographic.left = -radius * 1.4 * aspect; orthographic.right = radius * 1.4 * aspect
      orthographic.top = radius * 1.4; orthographic.bottom = -radius * 1.4; orthographic.updateProjectionMatrix()
    }
    rebuild(); resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const raycaster = new THREE.Raycaster()
    let pointerStart: readonly [number, number] = [0, 0]
    const down = (event: PointerEvent) => { pointerStart = [event.clientX, event.clientY] }
    const pick = (event: PointerEvent) => {
    // Zoom toward the cursor, orbit about the selection or the surface under it, near and far that follow the scene (no depth fighting).
    const rig = createCameraRig({
      controls, camera: () => activeCamera, surface: host, canvas: () => renderer.domElement,
      pick: (ndc, cam) => {
        // Only the solids are tested: a line or a voxel stock of a million triangles would make every wheel notch stall.
        raycaster.setFromCamera(ndc, cam)
        return raycaster.intersectObjects(content.children, false).find((hit) => hit.object instanceof THREE.Mesh && typeof hit.object.userData.solidIndex === "number")?.point
      },
      selectionCenter: () => selectedMesh ? new THREE.Box3().setFromObject(selectedMesh).getCenter(new THREE.Vector3()) : undefined,
      sceneSphere: () => {
        if (sphereCache === undefined) {
          const box = new THREE.Box3().setFromObject(content)
          if (machineScene) fitBounds(machineScene.root, box)
          sphereCache = box.isEmpty() ? new THREE.Sphere(controls.target.clone(), radius) : box.getBoundingSphere(new THREE.Sphere())
        }
        return { center: [sphereCache.center.x, sphereCache.center.y, sphereCache.center.z], radius: sphereCache.radius }
      },
      invalidate: () => invalidate(),
      reducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
      canNavigate: () => preset() !== "four-view" && !gizmo.dragging && !gizmo.axis
    })
      if (event.button !== 0 || gizmo.dragging || preset() === "four-view" || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 4 || gizmo.axis) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), activeCamera)
      const hit = raycaster.intersectObjects(content.children, false).find(hit => hit.object instanceof THREE.Mesh && typeof hit.object.userData.solidIndex === "number")
      if (selectedMesh && selectedMesh.material instanceof THREE.MeshStandardMaterial) selectedMesh.material.emissive.setHex(0)
      selectedMesh = hit?.object as THREE.Mesh | undefined
      if (selectedMesh && selectedMesh.material instanceof THREE.MeshStandardMaterial) selectedMesh.material.emissive.setHex(0x163653)
      outline.set("selected", selectedMesh, selectedMesh ? "selected" : "none")
      setSelected(selectedMesh?.userData.solidIndex as number | undefined); props.onSolidSelect?.(selected()); transform()
    }
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key.toLowerCase() === "f") { event.preventDefault(); fit() }
      if (event.key === "Escape") { setTransformMode("none"); gizmo.detach(); invalidate() }
    }
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointerup", pick)
    host.addEventListener("keydown", key)
    let previous: number | undefined
    controls.addEventListener("change", invalidate)
    gizmo.addEventListener("change", invalidate)
    const renderFrame = () => {
      if (preset() === "four-view") {
        renderer.setScissorTest(true)
        const width = host?.clientWidth ?? 1, height = host?.clientHeight ?? 1
        for (const [index, view] of (["top", "front", "right", "perspective"] as const).entries()) {
          const x = index % 2 * width / 2, y = index < 2 ? height / 2 : 0
          renderer.setViewport(x, y, width / 2, height / 2); renderer.setScissor(x, y, width / 2, height / 2)
          const paneCamera = view === "perspective" ? camera : orthographic
          orient(view, paneCamera); renderer.render(scene, paneCamera)
        }
        renderer.setScissorTest(false)
      } else { renderer.setViewport(0, 0, host?.clientWidth ?? 1, host?.clientHeight ?? 1); renderer.render(scene, activeCamera) }
    }
    const animate = () => {
      const now = performance.now()
      if (props.playing) {
        seconds = Math.min(playback.duration, seconds + Math.min(now - (previous ?? now), 100) / 1000 * Math.max(0, props.playbackRate ?? 1))
        props.onPlaybackTimeChange?.(seconds)
      }
      previous = now
      let p = positionAt(playback, seconds)
      if (machineScene?.update(seconds)) invalidate()
      // The live stock follows the playhead: the material the program has removed by now.
      if (liveStock !== undefined) {
        liveStock.simulation.advanceTo(seconds)
        if (liveStock.update()) {
          invalidate()
          props.onStockInfo?.({
            removed: liveStock.simulation.removedVolume,
            remaining: liveStock.simulation.remainingVolume,
            cell: liveStock.simulation.sim.cell,
            missingTools: liveStock.simulation.missingTools
          })
        }
      }
      if (voxelStock !== undefined && voxelStock.update(seconds)) {
        invalidate()
        props.onStockInfo?.({ removed: voxelStock.sim.removedVolume(), remaining: voxelStock.sim.remainingVolume(), cell: voxelStock.sim.voxel, missingTools: [] })
      }
      // "Only what has run": the path's draw ranges follow the playhead.
      if (pathLines !== undefined) {
        const done = props.toolpathDisplay?.progress === "done"
        const range = (line: THREE.Object3D | undefined, starts: Float64Array) => {
          if (line === undefined) return
          const count = done ? startedBy(starts, seconds) * 2 : Infinity
          if (setLineDrawRange(line, count)) invalidate()
        }
        range(pathLines.cut, pathLines.cutStarts)
        range(pathLines.rapid, pathLines.rapidStarts)
      }
      // A lathe tool or a printer nozzle is the machine scene's; the milling cutter and the marker are for mills only.
      const ownTool = machineScene !== undefined && props.machine?.kind !== "mill"
        if (pathLines.arrows?.update(done ? startedBy(pathLines.cutStarts, seconds) : Infinity)) invalidate()
      const visible = playback.segmentCount > 0 && !ownTool
      const activeId = visible ? toolAt(playback, seconds) : undefined
      const active = activeId !== undefined ? toolGroupFor(activeId) : null
      const lean = rotaryPose(seconds)
      if (placeTable(lean?.table)) invalidate()
      if (active && machineScene) {
        const angle = machineScene.spinAngle(seconds)
        // The tool's own turning about its axis, then its lean (rotary mills, part frame).
        const q = new THREE.Quaternion().setFromUnitVectors(zAxis, lean?.axis ?? zAxis).multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, angle))
        if (!active.quaternion.equals(q)) { active.quaternion.copy(q); invalidate() }
      }
      if (lean) p = lean.at
      for (const [id, g] of toolGroups) if (g && id !== activeId && g.visible) { g.visible = false; invalidate() }
      if (active) {
        if (!active.visible || active.position.x !== p.x || active.position.y !== p.y || active.position.z !== p.z) { active.position.set(p.x, p.y, p.z); active.visible = true; invalidate() }
        if (marker.visible) { marker.visible = false; invalidate() }
      } else {
        const moved = marker.position.x !== p.x || marker.position.y !== p.y || marker.position.z !== p.z
        if (moved || marker.visible !== visible) { marker.position.set(p.x, p.y, p.z); marker.visible = visible; invalidate() }
      }
      const rigAnimating = rig.beforeUpdate(performance.now())
      const cameraMoved = controls.update() || rigAnimating
      if (rig.afterUpdate(cameraMoved)) dirty = true
      if (!document.hidden && (dirty || cameraMoved || props.playing)) { dirty = false; renderFrame() }
      const playing = !!props.playing && seconds < playback.duration && (props.playbackRate ?? 1) > 0
      if (!playing && !cameraMoved) previous = undefined
      return playing || cameraMoved
    }
    frames = new FrameScheduler(animate, (callback) => window.requestAnimationFrame(callback), (id) => window.cancelAnimationFrame(id))
    const visibility = () => { previous = undefined; frames?.suspend(document.hidden) }
    document.addEventListener("visibilitychange", visibility)
    visibility()
    const unregisterCapture = registerViewportCapture(props.visionMode ?? "cad", () => {
      if (meshJobs.pending > 0 || meshError() || !renderer.domElement.isConnected || renderer.domElement.clientWidth === 0 || renderer.domElement.clientHeight === 0) return undefined
      renderFrame()
      return { canvas: renderer.domElement, camera: { position: [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z], target: [controls.target.x, controls.target.y, controls.target.z] }, ...(props.visionMode === "cam" && props.program ? { programText: cam.programGeometryText(props.program) } : {}), ...(machineScene && props.machine ? { spatial: machineSpatial(props.machine, machineScene, seconds) } : {}) }
    })
    onCleanup(() => { rig.dispose(); unregisterCapture(); disposeMachine(); disposeStock(); disposeVoxels(); frames?.dispose(); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); meshJobs.dispose(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", pick); host?.removeEventListener("keydown", key); gizmo.removeEventListener("dragging-changed", dragging); gizmo.removeEventListener("mouseUp", commit); gizmo.removeEventListener("change", invalidate); gizmo.dispose(); controls.dispose(); disposeGroup(content); disposeGroup(helpers); disposeTools(); marker.geometry.dispose(); marker.material.dispose(); look.dispose(); outline.dispose(); renderer.dispose(); renderer.domElement.remove(); rebuild = () => {}; setPreset = () => {}; appearance = () => {}; transform = () => {}; fit = () => {}; invalidate = () => {} })
  })
  return <div class="vp3-root">
    <div ref={host} class="vp3-canvas" tabIndex={0} aria-label={t("cam.preview")} />
    <Show when={props.showControls !== false}><ViewportControls footer={props.controlsFooter} preset={preset()} mode={mode()} grid={gridVisible()} axes={axesVisible()} enabled={!noWebGl()} transform={transformMode()} canTransform={selected() !== undefined && !!props.onTransformCommit && preset() !== "four-view"} onPreset={value => { updatePreset(value); props.onPresetChange?.(value) }} onMode={value => { updateMode(value); props.onRenderModeChange?.(value) }} onGrid={() => setGridVisible(v => !v)} onAxes={() => setAxesVisible(v => !v)} onFit={() => fit()} onTransform={setTransformMode} onFullscreen={() => { const root = host?.parentElement; if (document.fullscreenElement) void document.exitFullscreen(); else if (root?.requestFullscreen) void root.requestFullscreen() }} /></Show>
    <Show when={preset() === "four-view"}><div class="vp3-quadrants"><span>{viewportLabels.top}</span><span>{viewportLabels.front}</span><span>{viewportLabels.right}</span><span>{viewportLabels.perspective}</span></div></Show>
    <Show when={meshError()}>{message => <p role="alert" class="vp3-alert">{message()}</p>}</Show>
    <Show when={noWebGl()}><p role="alert" class="vp3-alert">{t("viewport.noWebgl")}</p></Show>
  </div>
}
