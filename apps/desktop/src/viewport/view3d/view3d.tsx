import { FrameScheduler } from "../../features/cad/lib/frame-scheduler.ts"
import { MeshWorkerQueue } from "./mesh-jobs.ts"
import { registerViewportCapture } from "../../features/ai/lib/viewport-capture.ts"
import { Show, createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { TransformControls } from "three/addons/controls/TransformControls.js"
import { ViewportControls, viewportLabels } from "./viewport-controls.tsx"
import { creasedNormals, isClosedShape, meshOf, tessellate, cam, type Drawing, type Solid, type Vec3 } from "@cadcamfun/core"
import { entityPaths, renderEntity } from "../editor2d/render.ts"
import { t } from "../../i18n/index.ts"
import { buildPlayback, positionAt, type Playback } from "./playback.ts"
import { toolpathOverlayModel, type ToolpathPointKind } from "./toolpath-overlays.ts"

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
  readonly onPresetChange?: (preset: ViewPreset) => void
  readonly onRenderModeChange?: (mode: RenderMode) => void
  readonly onSolidSelect?: (index: number | undefined) => void
  readonly onTransformCommit?: (transform: ViewportTransform) => void
  readonly lighting?: ViewportLighting
  readonly material?: ViewportMaterial
  readonly section?: ViewportSection
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
  }
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
  let playback: Playback = { segments: [], duration: 0, end: { x: 0, y: 0, z: 0 } }
  let seconds = 0
  createEffect(() => { props.drawing; props.solids; props.extrusionHeight; props.program; props.stock; props.toolpathDisplay; untrack(rebuild) })
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
    const grid = new THREE.GridHelper(500, 500, 0x777777, 0x444444)
    grid.rotation.x = Math.PI / 2
    const axes = new THREE.Group()
    for (const [end, color] of [[new THREE.Vector3(500, 0, 0), 0x0000ff], [new THREE.Vector3(0, 500, 0), 0xff00ff], [new THREE.Vector3(0, 0, 500), 0x00ff7f]] as const) {
      axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([end.clone().negate(), end]), new THREE.LineBasicMaterial({ color })))
    }
    const origin = new THREE.AxesHelper(12)
    helpers.add(grid, axes, origin)
    const ambient = new THREE.AmbientLight(0xffffff, props.lighting?.ambient ?? 0.4)
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x334155, props.lighting?.hemisphere ?? 1)
    const directional = new THREE.DirectionalLight(0xffffff, props.lighting?.directional ?? 1.5); directional.position.set(100, 100, 200)
    scene.add(ambient, hemisphere, directional)
    applyLighting = () => {
      invalidate()
      const l = props.lighting
      if (l === undefined) return
      ambient.intensity = l.ambient
      hemisphere.intensity = l.hemisphere
      directional.intensity = l.directional
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
    let radius = 100
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
      grid.visible = gridVisible(); axes.visible = axesVisible(); origin.visible = axesVisible()
      origin.position.set(props.origin?.x ?? 0, props.origin?.y ?? 0, props.origin?.z ?? 0)
      content.traverse(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.wireframe = mode() === "wireframe"
          object.material.transparent = mode() === "xray"; object.material.opacity = mode() === "xray" ? .3 : 1
          object.material.depthWrite = mode() !== "xray"
          for (const child of object.children) child.visible = mode() === "shaded-edges"
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
      object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0x202830 })))
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
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      const line = new THREE.LineSegments(geometry, rapid ? new THREE.LineDashedMaterial({ color: color ?? 0xf59e0b, dashSize: 2, gapSize: 1 }) : new THREE.LineBasicMaterial({ color: color ?? 0x38bdf8 }))
      line.computeLineDistances(); content.add(line)
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
      gizmo.detach(); selectedMesh = undefined; setSelected(undefined)
      disposeGroup(content)
      for (const [index, solid] of (props.solids ?? []).entries()) addSolid(solid, index)
      if (props.stock) {
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
      playback = props.program ? buildPlayback(props.program, 5000, props.toolpathDisplay?.arcTolerance ?? .1) : { segments: [], duration: 0, end: { x: 0, y: 0, z: 0 } }
      const rapid: number[] = [], cuts: number[] = []
      for (const s of playback.segments) (s.rapid ? rapid : cuts).push(s.from.x, s.from.y, s.from.z, s.to.x, s.to.y, s.to.z)
      addLines(rapid, true); addLines(cuts, false)
      if (props.program && props.toolpathDisplay) {
        const overlay = toolpathOverlayModel(props.program)
        if (props.toolpathDisplay.showPoints) {
          for (const point of overlay.points) {
            if (props.toolpathDisplay.pointFilter !== "all" && props.toolpathDisplay.pointFilter !== point.kind) continue
            const geometry = new THREE.SphereGeometry(props.toolpathDisplay.pointSize, 10, 8)
            const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: pointColor[point.kind], depthTest: false }))
            marker.position.set(point.position.x, point.position.y, point.position.z); marker.renderOrder = 20; content.add(marker)
            if (props.toolpathDisplay.showPointLabels) addPointLabel(String(point.index), point.position)
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
    let initialized = false
    fit = () => {
      const box = new THREE.Box3().setFromObject(content)
      if (!box.isEmpty()) { box.getCenter(controls.target); radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2) }
      setPreset()
    }
    const resize = () => {
      invalidate()
      if (!host) return
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix()
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
      if (event.button !== 0 || gizmo.dragging || preset() === "four-view" || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 4 || gizmo.axis) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), activeCamera)
      const hit = raycaster.intersectObjects(content.children, false).find(hit => hit.object instanceof THREE.Mesh && typeof hit.object.userData.solidIndex === "number")
      if (selectedMesh && selectedMesh.material instanceof THREE.MeshStandardMaterial) selectedMesh.material.emissive.setHex(0)
      selectedMesh = hit?.object as THREE.Mesh | undefined
      if (selectedMesh && selectedMesh.material instanceof THREE.MeshStandardMaterial) selectedMesh.material.emissive.setHex(0x163653)
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
      const p = positionAt(playback, seconds)
      const moved = marker.position.x !== p.x || marker.position.y !== p.y || marker.position.z !== p.z
      const visible = playback.segments.length > 0
      if (moved || marker.visible !== visible) { marker.position.set(p.x, p.y, p.z); marker.visible = visible; invalidate() }
      const cameraMoved = controls.update()
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
      return { canvas: renderer.domElement, camera: { position: [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z], target: [controls.target.x, controls.target.y, controls.target.z] }, ...(props.visionMode === "cam" && props.program ? { programText: cam.programGeometryText(props.program) } : {}) }
    })
    onCleanup(() => { unregisterCapture(); frames?.dispose(); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); meshJobs.dispose(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", pick); host?.removeEventListener("keydown", key); gizmo.removeEventListener("dragging-changed", dragging); gizmo.removeEventListener("mouseUp", commit); gizmo.removeEventListener("change", invalidate); gizmo.dispose(); controls.dispose(); disposeGroup(content); disposeGroup(helpers); marker.geometry.dispose(); marker.material.dispose(); renderer.dispose(); renderer.domElement.remove(); rebuild = () => {}; setPreset = () => {}; appearance = () => {}; transform = () => {}; fit = () => {}; invalidate = () => {} })
  })
  return <div class="vp3-root">
    <div ref={host} class="vp3-canvas" tabIndex={0} aria-label={t("cam.preview")} />
    <Show when={props.showControls !== false}><ViewportControls preset={preset()} mode={mode()} grid={gridVisible()} axes={axesVisible()} enabled={!noWebGl()} transform={transformMode()} canTransform={selected() !== undefined && !!props.onTransformCommit && preset() !== "four-view"} onPreset={value => { updatePreset(value); props.onPresetChange?.(value) }} onMode={value => { updateMode(value); props.onRenderModeChange?.(value) }} onGrid={() => setGridVisible(v => !v)} onAxes={() => setAxesVisible(v => !v)} onFit={() => fit()} onTransform={setTransformMode} onFullscreen={() => { const root = host?.parentElement; if (document.fullscreenElement) void document.exitFullscreen(); else if (root?.requestFullscreen) void root.requestFullscreen() }} /></Show>
    <Show when={preset() === "four-view"}><div class="vp3-quadrants"><span>{viewportLabels.top}</span><span>{viewportLabels.front}</span><span>{viewportLabels.right}</span><span>{viewportLabels.perspective}</span></div></Show>
    <Show when={meshError()}>{message => <p role="alert" class="vp3-alert">{message()}</p>}</Show>
    <Show when={noWebGl()}><p role="alert" class="vp3-alert">{t("viewport.noWebgl")}</p></Show>
  </div>
}
