import { boxSelectionIncludes, projectedSelectionBounds, type ScreenBox } from "../lib/box-selection.ts"
import "../../../styles/viewport-chrome.css"
import { registerViewportCapture } from "../../ai/lib/viewport-capture.ts"
import { spatialEvidence } from "../../ai/lib/spatial-evidence.ts"
import { LOOK_TIERS } from "../../../viewport/render-look.ts"
import { attachRenderLook, currentLookTier, lookTier, setLookTier } from "../../../viewport/render-look-setting.ts"
import { IdleAmbientOcclusion, aoRadiusFor } from "../../../viewport/ao.ts"
import { Outline, type OutlineState } from "../../../viewport/outline.ts"
import { createAdaptiveGrid } from "../../../viewport/adaptive-grid.ts"
import { formatGridStep } from "../../../viewport/grid-lod.ts"
import { createCameraRig, type CameraRig } from "../../../viewport/camera-rig.ts"
import { ViewCube, type ViewCubeApi } from "../../../viewport/view3d/view-cube.tsx"
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"
import { Cog, HelpCircle, Layers, Maximize2, Minimize2, Move, RotateCw, Sliders } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"
import { createSnap } from "../hooks/createSnap.ts"
import { createTransformControls } from "../hooks/createTransformControls.ts"
import { applyControlPointDrag, beginControlPointDrag, createControlPointsForElement, endControlPointDrag } from "../lib/controlPoints.ts"
import { createComponentPreview, transformLibraryItemToCADElement } from "../lib/libraryTransform.ts"
import { predefinedComponents } from "../lib/predefinedLibraries.ts"
import {
  applyDragDelta, applyElementTransform, applyHighlight, booleanElement, buildElementObject, disposeObject, isDrawn, commitDrag,
  createCustomAxes, createOriginIndicator, deltaFrom, exportGLTF, exportOBJ, exportSTL, fitCameraToObjects,
  type BooleanOperation, type DragStart, type ElementTransformFields
} from "../lib/sceneHelpers.ts"
import { booleanFormed } from "../lib/createThreeObject.ts"
import { FrameScheduler } from "../lib/frame-scheduler.ts"
import { ExplodedView } from "../lib/exploded-view.ts"
import { shapeFingerprint } from "../lib/fingerprint.ts"
import { SECTION_AXES, clipPlaneFor } from "../lib/section.ts"
import { createSectionHelper } from "../lib/sectionHelper.ts"
import SnapIndicator from "./SnapIndicator.tsx"
import DragDropIndicator from "./DragDropIndicator.tsx"
import SelectionControls from "./SelectionControls.tsx"
import BoxSelection from "./BoxSelection.tsx"
import ElementsListPanel from "./ElementsListPanel.tsx"
import ElementInfo from "./ElementInfo.tsx"
import ComponentCreationModal from "./ComponentCreationModal.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { SNAP_TYPES } from "../../../shared/keybindings/catalog.ts"
import { displayChord } from "../../../shared/keybindings/chord.ts"
import { CUBE_FACES } from "../../../viewport/view-cube-model.ts"
import { anchorOf, elementFromPoints, nextStart, previewOutline, type DrawTool, type Point3 as DrawPoint } from "../lib/draw-tools.ts"
import type { SnapType } from "../lib/enanchedSnapService.ts"

type TransformMode = "translate" | "rotate" | "scale"
type Point3 = { x: number; y: number; z: number }

/** What the page around the canvas can call (toolbar buttons, menus). */
export interface CADCanvasApi {
  readonly scene: () => THREE.Scene | undefined
  readonly camera: () => THREE.PerspectiveCamera | undefined
  readonly fitToView: () => void
  readonly zoom: (factor: number) => void
  readonly boolean: (operation: BooleanOperation) => boolean
  readonly exportSTL: () => void
  readonly exportOBJ: () => void
  readonly exportGLTF: () => Promise<void>
  readonly toggleFullscreen: () => void
  readonly showShortcuts: () => void
}

export interface CADCanvasProps {
  readonly width?: string | number
  readonly height?: string | number
  readonly previewLibraryItem?: Record<string, unknown> | null
  readonly previewComponent?: string | null
  readonly onComponentPlaced?: (component: string, position: Point3) => void
  readonly allowDragDrop?: boolean
  readonly onElementsChange?: (elements: unknown[]) => void
  readonly onReady?: (api: CADCanvasApi) => void
  readonly onSave?: () => void
  /** A second canvas (for example in a dialog) leaves the global shortcuts to the main one. */
  readonly keyboard?: boolean
  /** Overlays the page adds on top of the viewport (transform panel, simulation toolbar, ...). */
  readonly footerActions?: JSX.Element
  /** Above the section control and the actions in the same bottom-right stack, so it cannot lie over them (the title block). */
  readonly footerDock?: JSX.Element
  readonly children?: JSX.Element
}

const size = (value: string | number) => (typeof value === "number" ? `${value}px` : value)
const round2 = (value: number) => Math.round(value * 100) / 100
const BG = "#2A2A2A"
const ORIGIN = new THREE.Vector3()
/** Front-right-above, in millimetres: the default 3D view of a Z-up scene (fit-to-view keeps this direction). */
const ISO_VIEW = new THREE.Vector3(300, -300, 240)

/**
 * The 3D editor canvas: scene, camera and orbit controls, every element rendered through `createThreeObject`,
 * hover/click/box/multi selection, a transform gizmo for single and multiple elements (committed to the stores as
 * one history step), control-point editing, component placement and library drag & drop, boolean operations,
 * exports and the editor overlays. Port of the legacy `CADCanvas`.
 */
export default function CADCanvas(props: CADCanvasProps): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const transformStore = useTransformControlsStore()
  const snap = createSnap()
  const transformControls = createTransformControls({ enableKeyboardShortcuts: props.keyboard !== false })

  let container!: HTMLDivElement
  let scene: THREE.Scene | undefined
  let camera: THREE.PerspectiveCamera | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let orbit: OrbitControls | undefined
  /** Zoom toward the cursor, orbit about the selection or the surface under the pointer, near and far that follow the scene. */
  let rig: CameraRig | undefined
  let cubeApi: ViewCubeApi | undefined
  /** Cancels a box selection in flight; set once the canvas is mounted. */
  let cancelBox: () => boolean = () => false
  const [flatView, setFlatView] = createSignal(false)
  /** Top, front, right and the working perspective view at once; read-only, like the toolpath view's. */
  const [fourView, setFourView] = createSignal(false)
  const [gridStep, setGridStep] = createSignal(0)
  let fourViewOn = false
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1e6)
  const quadPerspective = new THREE.PerspectiveCamera(45, 1, 0.01, 1e6)
  const QUADS: ReadonlyArray<{ readonly direction: readonly [number, number, number]; readonly up: readonly [number, number, number] }> = [
    { direction: [0, 0, 1], up: [0, 1, 0] }, { direction: [0, -1, 0], up: [0, 0, 1] }, { direction: [1, 0, 0], up: [0, 0, 1] }
  ]
  /** The four panes: three orthographic views framing the drawing, and the perspective camera the person was working with. */
  const renderFourViews = (view: THREE.WebGLRenderer, drawn: THREE.Scene, working: THREE.PerspectiveCamera, sphere: THREE.Sphere) => {
    const width = container.clientWidth || 1, height = container.clientHeight || 1
    const paneW = width / 2, paneH = height / 2
    const half = Math.max(sphere.radius, 1) * 1.35
    view.setScissorTest(true)
    for (let index = 0; index < 4; index++) {
      const x = (index % 2) * paneW, y = index < 2 ? paneH : 0
      view.setViewport(x, y, paneW, paneH); view.setScissor(x, y, paneW, paneH)
      if (index === 3) {
        // The direction the person is looking from, at the distance that frames the whole drawing in this pane.
        const away = working.position.clone().sub(orbit?.target ?? sphere.center).normalize()
        const reach = (sphere.radius / Math.sin((Math.min(quadPerspective.fov, quadPerspective.fov * (paneW / paneH)) * Math.PI) / 360)) * 1.15
        quadPerspective.aspect = paneW / paneH
        quadPerspective.up.set(0, 0, 1)
        quadPerspective.position.copy(sphere.center).addScaledVector(away, Math.max(reach, 1))
        quadPerspective.near = Math.max(reach / 1000, 0.01); quadPerspective.far = reach * 20
        quadPerspective.updateProjectionMatrix(); quadPerspective.lookAt(sphere.center)
        view.render(drawn, quadPerspective)
        continue
      }
      const quad = QUADS[index]!
      const aspect = paneW / paneH
      quadCamera.left = -half * Math.max(aspect, 1); quadCamera.right = half * Math.max(aspect, 1)
      quadCamera.top = half * Math.max(1 / aspect, 1); quadCamera.bottom = -half * Math.max(1 / aspect, 1)
      quadCamera.up.set(...quad.up)
      quadCamera.position.set(sphere.center.x + quad.direction[0] * half * 4, sphere.center.y + quad.direction[1] * half * 4, sphere.center.z + quad.direction[2] * half * 4)
      quadCamera.near = 0.01; quadCamera.far = half * 12
      quadCamera.updateProjectionMatrix(); quadCamera.lookAt(sphere.center)
      view.render(drawn, quadCamera)
    }
    view.setScissorTest(false)
    view.setViewport(0, 0, width, height)
  }
  let gizmo: TransformControls | undefined
  let frames: FrameScheduler | undefined
  let ambientOcclusion: IdleAmbientOcclusion | undefined
  // Selection / hover outline (inverted hull, see viewport/outline.ts): one extra draw of the outlined parts, nothing otherwise.
  const outline = new Outline({ quality: currentLookTier })
  const exploded = new ExplodedView()
  const [explosionActive, setExplosionActive] = createSignal(false)
  let reducedMotion: MediaQueryList | undefined
  let dirty = true
  let cubeStale = true
  const invalidate = (): void => { dirty = true; frames?.invalidate() }
  const pivot = new THREE.Object3D()
  const raycaster = new THREE.Raycaster()
  raycaster.params.Line = { threshold: 0.4 }
  // Thick (screen-space) lines, B-rep edges: picked within a few pixels of the ray.
  raycaster.params.Line2 = { threshold: 4 }
  const mouse = new THREE.Vector2()
  let controlPoints: THREE.Object3D[] = []
  let preview: THREE.Object3D | undefined
  let dragStart: DragStart | undefined
  let activeDragPoint: { elementId: string; pointIndex: number } | undefined
  const [screenBox, setScreenBox] = createSignal<ScreenBox>()
  let pointerDown: { x: number; y: number; additive: boolean } | undefined
  /** One Three object per drawn element, with the shape it was built for. The canvas owns this map. */
  const objectsById = new Map<string, { object: THREE.Object3D; shape: number }>()
  /** The drawn objects that pass the layer visibility test: the raycast candidate list, kept in step with the map. */
  let visibleObjects: THREE.Object3D[] = []

  const [ready, setReady] = createSignal(false)
  const [webglFailed, setWebglFailed] = createSignal(false)
  const [rebuilds, setRebuilds] = createSignal(0)
  const [hoveredId, setHoveredId] = createSignal<string | null>(null)
  const [isSelectionMode, setSelectionMode] = createSignal(false)
  const [isMultiSelectMode, setMultiSelectMode] = createSignal(false)
  const [isFullscreen, setFullscreen] = createSignal(false)
  const [transformMode, setTransformMode] = createSignal<TransformMode>("translate")
  const [showElementsList, setShowElementsList] = createSignal(false)
  const [showElementInfo, setShowElementInfo] = createSignal(false)
  const [showComponentModal, setShowComponentModal] = createSignal(false)
  const [showPerformance, setShowPerformance] = createSignal(false)
  const [isPlacing, setPlacing] = createSignal(false)
  /** The two-click drawing tool in use (line, circle, rectangle) and the first point of the shape being drawn. */
  const [drawTool, setDrawTool] = createSignal<DrawTool | undefined>(undefined)
  const [drawStart, setDrawStart] = createSignal<DrawPoint | undefined>(undefined)
  let drawPreview: THREE.Line | undefined
  const [previewPosition, setPreviewPosition] = createSignal<Point3>({ x: 0, y: 0, z: 0 })
  const [isDraggingComponent, setDraggingComponent] = createSignal(false)
  const [dropPosition, setDropPosition] = createSignal<Point3>({ x: 0, y: 0, z: 0 })
  const [dropScreen, setDropScreen] = createSignal<{ x: number; y: number }>()
  const [memory, setMemory] = createSignal({ used: 0, total: 0, geometries: 0, textures: 0 })
  const [frame, setFrame] = createSignal(0)

  const selectedIds = () => selection.selectedElementIds
  /** Every drawn object, in insertion order. */
  const cadObjects = (): THREE.Object3D[] => Array.from(objectsById.values(), (entry) => entry.object)
  const objectOf = (id: string) => objectsById.get(id)?.object
  const originOffset = () => cad.originOffset

  const worldToScreen = (position: Point3) => {
    if (!container || !camera) return null
    const vector = new THREE.Vector3(position.x, position.y, position.z).project(camera)
    const rect = container.getBoundingClientRect()
    return { x: ((vector.x + 1) / 2) * rect.width, y: ((-vector.y + 1) / 2) * rect.height }
  }

  const setPointer = (event: { clientX: number; clientY: number }) => {
    const rect = container.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    if (camera) raycaster.setFromCamera(mouse, camera)
  }

  const planePoint = (): THREE.Vector3 | null => {
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1)), hit)
  }

  const elementIdAt = (): string | null => {
    if (visibleObjects.length === 0) return null
    // `visibleObjects` is already filtered by layer visibility, and the first hit is the one that counts.
    const hits = raycaster.intersectObjects(visibleObjects, true)
    for (const hit of hits) {
      for (let current: THREE.Object3D | null = hit.object; current; current = current.parent) {
        const id = current.userData.elementId as string | undefined
        if (id) return id
      }
    }
    return null
  }

  const isLocked = (id: string) => {
    const element = elements.elements.find((candidate) => candidate.id === id)
    return !!element && (element.locked === true || !!layers.layers.find((layer) => layer.id === element.layerId)?.locked)
  }

  // ---------------------------------------------------------------------------------------------------- scene setup
  const resize = () => {
    if (!container || !camera || !renderer) return
    const { clientWidth, clientHeight } = container
    if (clientWidth === 0 || clientHeight === 0) return
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(clientWidth, clientHeight)
    invalidate()
  }

  onMount(() => {
    const nextScene = new THREE.Scene()
    nextScene.background = new THREE.Color(BG)
    const nextCamera = new THREE.PerspectiveCamera(75, (container.clientWidth || 1) / (container.clientHeight || 1), 0.01, 5000)
    // The scene is Z-up (the grid lies on XY, cylinders stand along Z, the assistant and the toolpath work that way), and
    // OrbitControls reads `up` once at construction: set it first or the solids lie on their side and orbit turns about Y.
    nextCamera.up.set(0, 0, 1)
    nextCamera.position.copy(ISO_VIEW)
    try {
      // MSAA only where it is cheap: at a 2x device pixel ratio the canvas is already 4x the pixels.
      renderer = new THREE.WebGLRenderer({
        antialias: (window.devicePixelRatio || 1) <= 1.5,
        powerPreference: "high-performance",
        stencil: false,
      })
    } catch {
      setWebglFailed(true)
      return
    }
    scene = nextScene
    camera = nextCamera
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    container.insertBefore(renderer.domElement, container.firstChild)

    orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.minDistance = 0.01
    orbit.maxDistance = 5000
    orbit.zoomSpeed = 1.5
    orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    // The bounds of the drawing change with every edit and cost a walk of the scene: recomputed at most a few times a second.
    let sphere: { readonly at: number; readonly value: THREE.Sphere } | undefined
    const drawingSphere = (): THREE.Sphere => {
      const now = performance.now()
      if (sphere === undefined || now - sphere.at > 250) {
        const box = new THREE.Box3()
        for (const object of cadObjects()) box.expandByObject(object)
        sphere = { at: now, value: box.isEmpty() ? new THREE.Sphere(orbit!.target.clone(), 100) : box.getBoundingSphere(new THREE.Sphere()) }
      }
      return sphere.value
    }
    rig = createCameraRig({
      controls: orbit, camera: () => nextCamera, surface: container, canvas: () => renderer!.domElement,
      pick: (ndc, view) => {
        // Solids and sketches only; a thick line or a control point under the cursor must not decide where a wheel notch zooms to.
        raycaster.setFromCamera(ndc, view)
        const hit = raycaster.intersectObjects(visibleObjects, true).find(({ object }) => !object.userData.isControlPoint && !(object as { isLine?: boolean; isLineSegments2?: boolean }).isLine && !(object as { isLineSegments2?: boolean }).isLineSegments2)
        return hit?.point
      },
      selectionCenter: () => {
        const objects = selectedIds().flatMap((id) => objectOf(id) ?? [])
        if (objects.length === 0) return undefined
        const box = new THREE.Box3()
        for (const object of objects) box.expandByObject(object)
        return box.isEmpty() ? undefined : box.getCenter(new THREE.Vector3())
      },
      sceneSphere: () => { const value = drawingSphere(); return { center: [value.center.x, value.center.y, value.center.z], radius: value.radius } },
      invalidate: () => invalidate(),
      reducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    })

    // Studio environment, tone mapping and a key/fill/rim rig that follows the camera; the `low` tier keeps the old ambient + sun.
    const look = attachRenderLook(renderer, scene, { ambient: 0.5, hemisphere: 0, key: 0.8, keyPosition: [-5, -7.5, 10] }, invalidate)
    const ground = createAdaptiveGrid({ focus: () => orbit?.target ?? ORIGIN, half: 5000, onSpacing: setGridStep })
    ground.object.userData.setOpacity = ground.setOpacity
    scene.add(ground.object)
    scene.add(createCustomAxes(30))
    scene.add(createOriginIndicator())
    scene.add(pivot)

    gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.size = 0.8
    gizmo.addEventListener("dragging-changed", (event) => { if (orbit) orbit.enabled = !(event as unknown as { value: boolean }).value })
    gizmo.addEventListener("mouseDown", beginDrag)
    gizmo.addEventListener("objectChange", updateDrag)
    gizmo.addEventListener("mouseUp", endDrag)
    scene.add(gizmo.getHelper())

    frames = new FrameScheduler(() => {
      const wasExploded = exploded.active
      const animating = exploded.tick(performance.now())
      if (wasExploded) dirty = true
      if (!exploded.active) setExplosionActive(false)
      const rigAnimating = rig?.beforeUpdate(performance.now()) === true
      const moved = (orbit?.update() === true) || rigAnimating
      if (rig?.afterUpdate(moved) === true) dirty = true
      if (cubeApi !== undefined && camera && (moved || cubeStale)) { camera.updateMatrixWorld(); cubeApi.setBasis(camera.matrixWorld.elements); cubeStale = false }
      if ((moved || dirty) && renderer && scene && camera) {
        dirty = false
        if (fourViewOn) renderFourViews(renderer, scene, camera, drawingSphere())
        else renderer.render(scene, camera)
        // The occlusion is for a scene at rest: every frame restarts the quiet period, one extra frame is drawn after it.
        if (!fourViewOn) ambientOcclusion?.arm()
      }
      return moved || animating
    }, (callback) => window.requestAnimationFrame(callback), (id) => window.cancelAnimationFrame(id))
    ambientOcclusion = new IdleAmbientOcclusion({
      renderer, scene, camera,
      render: () => renderer?.render(scene!, camera!),
      quality: currentLookTier,
      busy: () => dirty || fourViewOn,
      exclude: (object) => object === gizmo?.getHelper() || object.userData.isControlPoint === true,
      radius: () => {
        const box = new THREE.Box3()
        for (const object of cadObjects()) box.expandByObject(object)
        return aoRadiusFor(box)
      }
    })
    orbit.addEventListener("change", invalidate)
    gizmo.addEventListener("change", invalidate)
    // A canvas that was hidden (another tab, a collapsed panel, a minimized window) can come back with an emptied drawing
    // buffer or a lost GL context: mark the scene dirty on every return so the next frame draws it again, immediately.
    const visibility = () => {
      if (!document.hidden) dirty = true
      frames?.suspend(document.hidden)
    }
    document.addEventListener("visibilitychange", visibility)
    visibility()
    const glCanvas = renderer.domElement
    const contextLost = (event: Event) => event.preventDefault()
    const contextRestored = () => { resize(); invalidate() }
    glCanvas.addEventListener("webglcontextlost", contextLost)
    glCanvas.addEventListener("webglcontextrestored", contextRestored)
    const shown = typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { resize(); invalidate() } })
    shown?.observe(container)
    reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    const motionChange = () => {
      if (reducedMotion?.matches) exploded.setTarget(cad.explodedView.enabled ? cad.explodedView.amount : 0, true)
      invalidate()
    }
    reducedMotion?.addEventListener("change", motionChange)
    const unregisterCapture = registerViewportCapture("cad", () => {
      if (!renderer || !scene || !camera || !orbit || !renderer.domElement.isConnected || renderer.domElement.clientWidth === 0 || renderer.domElement.clientHeight === 0) return undefined
      renderer.render(scene, camera)
      return { canvas: renderer.domElement, spatial: spatialEvidence(cadObjects(), selectedIds()), camera: { position: [camera.position.x, camera.position.y, camera.position.z], target: [orbit.target.x, orbit.target.y, orbit.target.z] } }
    })

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { resize(); invalidate() })
    observer?.observe(container)
    window.addEventListener("resize", resize)
    let fullscreenTimer: ReturnType<typeof setTimeout> | undefined
    const fullscreen = () => {
      setFullscreen(!!document.fullscreenElement)
      clearTimeout(fullscreenTimer)
      fullscreenTimer = setTimeout(() => { resize(); invalidate() }, 100)
    }
    document.addEventListener("fullscreenchange", fullscreen)
    const release = (event: MouseEvent) => onMouseUp(event)
    const moveOutside = (event: MouseEvent) => {
      if (screenBox() && !(event.target instanceof Node && container.contains(event.target))) updateScreenBox(event)
    }
    const stopOrbitSelection = (event: PointerEvent) => {
      if (isSelectionMode() && event.button === 0 && event.target === renderer?.domElement) event.stopPropagation()
    }
    const cancelSelection = () => {
      if (screenBox()) { selection.endBoxSelection(); setScreenBox(undefined); pointerDown = undefined; if (orbit) orbit.enabled = !isPlacing() }
    }
    cancelBox = () => { if (!screenBox()) return false; cancelSelection(); return true }
    container.addEventListener("pointerdown", stopOrbitSelection, true)
    window.addEventListener("mousemove", moveOutside)
    window.addEventListener("mouseup", release)
    window.addEventListener("blur", cancelSelection)

    onCleanup(() => {
      clearDrawPreview()
      unregisterCapture()
      reducedMotion?.removeEventListener("change", motionChange)
      exploded.dispose()
      if (props.keyboard !== false) {
        cad.setExplodedView({ enabled: false })
        useCADStore.setState({ explodablePartCount: 0 })
      }
      frames?.dispose()
      frames = undefined
      ambientOcclusion?.dispose()
      ambientOcclusion = undefined
      outline.dispose()
      cancelAnimationFrame(mouseFrame)
      cancelAnimationFrame(hoverFrame)
      clearTimeout(fullscreenTimer)
      document.removeEventListener("visibilitychange", visibility)
      glCanvas.removeEventListener("webglcontextlost", contextLost)
      glCanvas.removeEventListener("webglcontextrestored", contextRestored)
      shown?.disconnect()
      observer?.disconnect()
      window.removeEventListener("resize", resize)
      document.removeEventListener("fullscreenchange", fullscreen)
      window.removeEventListener("mouseup", release)
      window.removeEventListener("mousemove", moveOutside)
      window.removeEventListener("blur", cancelSelection)
      cancelBox = () => false
      container.removeEventListener("pointerdown", stopOrbitSelection, true)
      if (screenBox()) selection.endBoxSelection()
      gizmo?.getHelper().removeFromParent()
      gizmo?.dispose()
      rig?.dispose()
      rig = undefined
      orbit?.dispose()
      look.dispose()
      // Dispose the entire owned scene once, including helper textures.
      if (scene) disposeObject(scene)
      objectsById.clear()
      visibleObjects = []
      controlPoints = []
      preview = undefined
      renderer?.domElement.parentElement?.removeChild(renderer.domElement)
      renderer?.dispose()
      scene = undefined
      renderer = undefined
      camera = undefined
      orbit = undefined
      gizmo = undefined
    })

    setReady(true)
    invalidate()
    props.onReady?.(api)
  })

  // ---------------------------------------------------------------------------------------------------- helpers
  const fitToView = () => {
    if (!camera || !orbit) return
    const ids = selectedIds()
    const targets = ids.length > 0 ? ids.flatMap((id) => objectOf(id) ?? []) : cadObjects()
    const center = fitCameraToObjects(camera, orbit.target, targets)
    if (center) { orbit.target.copy(center); orbit.update(); rig?.updateClip() }
  }

  const zoom = (factor: number) => {
    if (!camera || !orbit) return
    const offset = camera.position.clone().sub(orbit.target).multiplyScalar(factor)
    camera.position.copy(orbit.target.clone().add(offset))
    orbit.update()
  }

  const toggleFullscreen = () => {
    if (!container) return
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void container.requestFullscreen?.()
  }

  /** Combines the selection; false when there was nothing to combine (fewer than two parts, or no result). */
  const runBoolean = (operation: BooleanOperation): boolean => {
    const ids = selectedIds()
    if (ids.length < 2) return false
    const result = booleanElement(operation, ids.flatMap((id) => objectOf(id) ?? []), layers.activeLayer)
    if (!result) return false
    batch(() => {
      const id = elements.addElement(result)
      for (const original of ids) elements.deleteElement(original)
      selection.selectElement(id)
    })
    return true
  }

  const api: CADCanvasApi = {
    scene: () => scene, camera: () => camera, fitToView, zoom, boolean: runBoolean,
    exportSTL: () => { if (scene) exploded.assembled(() => exportSTL(scene!)) },
    exportOBJ: () => { if (scene) exploded.assembled(() => exportOBJ(scene!)) },
    exportGLTF: () => (scene ? exploded.assembled(() => exportGLTF(scene!)) : Promise.resolve()),
    toggleFullscreen, showShortcuts: () => app.keys.setHelpOpen(true)
  }

  // ---------------------------------------------------------------------------------------------------- scene sync
  // Grid / axes / origin.
  createEffect(() => {
    if (!ready() || !scene) return
    const { x, y, z } = originOffset()
    const visibleGrid = cad.gridVisible
    const visibleAxes = cad.axisVisible
    for (const child of scene.children) {
      if (child.userData.isGrid) { child.visible = visibleGrid; child.position.set(x, y, z) }
      if (child.userData.isCustomAxes) { child.visible = visibleAxes; child.position.set(x, y, z) }
      if (child.userData.isOriginIndicator) child.position.set(x, y, z)
    }
    invalidate()
  })

  // Section view: the renderer clips everything past the plane; a sheet shows where the cut is.
  const modelBox = (): THREE.Box3 => {
    const box = new THREE.Box3()
    for (const object of cadObjects()) box.expandByObject(object)
    return box
  }
  createEffect(() => {
    const section = cad.section
    rebuilds()
    if (!ready() || !scene || !renderer) return
    for (const old of scene.children.filter((child) => child.userData.isSectionHelper)) {
      scene.remove(old)
      old.traverse((object) => {
        const part = object as THREE.Mesh
        part.geometry?.dispose?.()
        const material = part.material as THREE.Material | undefined
        material?.dispose?.()
      })
    }
    if (!section.enabled) { renderer.clippingPlanes = []; invalidate(); return }
    const { normal, constant } = clipPlaneFor(section)
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(...normal), constant)]
    scene.add(createSectionHelper(section.axis, section.position, section.inverted, modelBox()))
    invalidate()
  })
  /** The extent of the model along the section axis: the slider's range. */
  const sectionRange = createMemo((): { min: number; max: number } => {
    rebuilds(); elements.elements
    const box = scene ? modelBox() : new THREE.Box3()
    const axis = cad.section.axis
    if (box.isEmpty()) return { min: -500, max: 500 }
    return { min: Math.floor(box.min[axis]) - 1, max: Math.ceil(box.max[axis]) + 1 }
  })

  // 2D / 3D view mode.
  createEffect(on([ready, () => cad.viewMode], ([isReady, mode]) => {
    if (!isReady || !camera || !orbit || !scene) return
    scene.background = new THREE.Color(BG)
    const axes = scene.children.find((child) => child.userData.isCustomAxes)
    const grid = scene.children.find((child) => child.userData.isGrid)
    const setGridOpacity = (opacity: number) => (grid?.userData.setOpacity as ((value: number) => void) | undefined)?.(opacity)
    if (mode === "2d") {
      camera.position.set(0, 0, 50)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      orbit.target.set(0, 0, 0)
      orbit.enableRotate = false
      orbit.enablePan = true
      setGridOpacity(0.5)
      axes?.children.forEach((child, index) => { child.visible = index !== 2 })
    } else {
      camera.up.set(0, 0, 1)
      camera.position.copy(ISO_VIEW)
      camera.lookAt(0, 0, 0)
      orbit.target.set(0, 0, 0)
      orbit.enableRotate = true
      orbit.enablePan = true
      setGridOpacity(1)
      axes?.children.forEach((child) => { child.visible = true })
    }
    orbit.update()
    invalidate()
  }))

  // Elements -> Three objects, reconciled rather than rebuilt.
  //
  // An edit must not cost the whole drawing: adding one part to an assembly of three hundred used to
  // dispose and recreate every geometry. Each element keeps its object, and the geometry is rebuilt
  // only when `shapeFingerprint` says the shape itself changed — a move or a turn is a matrix update.
  createEffect(() => {
    if (!ready() || !scene) return
    exploded.release()
    const all = elements.elements
    const known = layers.layers
    cad.originOffset
    cad.tolerance
    // A Boolean draws its result; the operands it consumes are not drawn on their own. One that cannot be formed (an operand
    // that is not a solid, a missing one) consumes nothing, so the assistant's parts never vanish behind a wireframe marker.
    const isBoolean = (element: { type: string }) => element.type.startsWith("boolean-")
    const consumed = cam.model.consumedOperands(all.filter((element) => !isBoolean(element) || booleanFormed(element)) as never)

    const live = new Set<string>()
    const drawn: THREE.Object3D[] = []
    for (const element of all) {
      if (consumed.has(element.id)) continue
      if (!isDrawn(element, known)) continue
      live.add(element.id)
      const shape = shapeFingerprint(element)
      const cached = objectsById.get(element.id)
      let object: THREE.Object3D | undefined
      if (cached) {
        if (cached.shape === shape) {
          // Same geometry, new placement: replay the position and the gizmo transform.
          applyElementTransform(cached.object, element as ElementTransformFields)
          object = cached.object
        } else {
          disposeObject(cached.object)
          objectsById.delete(element.id)
        }
      }
      if (!object) {
        const built = buildElementObject(element, invalidate)
        if (!built) continue
        objectsById.set(element.id, { object: built, shape })
        scene.add(built)
        object = built
      }
      drawn.push(object)
    }
    for (const [id, entry] of [...objectsById]) {
      if (live.has(id)) continue
      disposeObject(entry.object)
      objectsById.delete(id)
    }

    // The raycast list is a view of the map, refreshed here instead of being rebuilt on every hover query.
    visibleObjects = drawn
    setRebuilds((count) => count + 1)
    invalidate()
    props.onElementsChange?.(all)
  })

  createEffect(() => {
    rebuilds()
    if (!ready()) return
    const state = cad.explodedView
    const excluded = new Set(elements.elements.filter(element => element.type === "workpiece").map(element => element.id))
    exploded.configure(cadObjects().filter(object => !excluded.has(String(object.userData.elementId))), state.axis)
    if (props.keyboard !== false) useCADStore.setState({ explodablePartCount: exploded.count })
    const enabled = state.enabled && cad.viewMode === "3d"
    // 2D needs assembled bounds immediately, rather than a closing 3D transition.
    exploded.setTarget(enabled ? state.amount : 0, reducedMotion?.matches === true || cad.viewMode === "2d")
    setExplosionActive(exploded.active)
    invalidate()
  })

  // Hover / selection tint, applied to the delta only: moving the cursor between two parts must not
  // rewrite the material of every object in the drawing.
  let lastHighlight: string | null = null
  let lastSelected = new Set<string>()
  createEffect(() => {
    rebuilds()
    const hovered = hoveredId()
    const selected = new Set(selectedIds())
    const tint = (id: string, state: "none" | "hover" | "selected") => {
      const object = objectsById.get(id)?.object
      if (!object) return
      applyHighlight(object, state)
      invalidate()
    }
    for (const id of lastSelected) if (!selected.has(id) && id !== hovered) tint(id, "none")
    for (const id of selected) if (!lastSelected.has(id)) tint(id, "selected")
    if (hovered && hovered !== lastHighlight && !selected.has(hovered)) tint(hovered, "hover")
    if (lastHighlight && lastHighlight !== hovered && !selected.has(lastHighlight)) tint(lastHighlight, "none")
    lastHighlight = hovered
    lastSelected = selected
    // The outline follows the same state, re-asserted every time (a rebuilt object gets its outline back). A very large
    // selection keeps only the tint: one hull per part would cost more than the outline is worth.
    const wanted = new Map<string, OutlineState>()
    if (selected.size <= 40) for (const id of selected) wanted.set(id, "selected")
    if (hovered && !selected.has(hovered)) wanted.set(hovered, "hover")
    for (const key of outline.keys()) if (!wanted.has(key)) { outline.set(key, undefined, "none"); invalidate() }
    for (const [id, state] of wanted) if (outline.set(id, objectsById.get(id)?.object, state)) invalidate()
  })

  // Selection store -> elements store (the legacy panels read `selectedElement`).
  createEffect(on(selectedIds, (ids) => {
    const next = ids.length === 1 ? ids[0]! : null
    if ((elements.selectedElement?.id ?? null) !== next) elements.selectElement(next)
  }, { defer: true }))
  createEffect(on(() => elements.selectedElement?.id, (id) => {
    const ids = selection.selectedElementIds
    if (id === undefined) { if (ids.length === 1) selection.clearSelection() }
    else if (!ids.includes(id)) selection.selectElement(id)
  }, { defer: true }))

  // Gizmo mode follows the transform store (G/R/S, toolbar) and the local buttons.
  createEffect(() => {
    const mode = transformStore.mode
    if (mode === "translate" || mode === "rotate" || mode === "scale") setTransformMode(mode)
  })
  const setMode = (mode: TransformMode) => {
    setTransformMode(mode)
    transformControls.setMode(mode)
    useCADStore.getState().setActiveTool(mode)
  }

  // Gizmo attachment: pivot at the centre of the selection.
  createEffect(() => {
    rebuilds()
    const mode = transformMode()
    if (!ready() || !gizmo || !scene) return
    const objects = selectedIds().flatMap((id) => objectOf(id) ?? [])
    if (objects.length === 0 || isSelectionMode() || explosionActive() || cad.explodedView.enabled) { gizmo.detach(); gizmo.getHelper().visible = false; invalidate(); return }
    const center = new THREE.Vector3()
    if (objects.length === 1) center.copy(objects[0]!.userData.pivot as THREE.Vector3)
    else {
      const box = new THREE.Box3()
      for (const object of objects) box.union(new THREE.Box3().setFromObject(object))
      box.getCenter(center)
    }
    pivot.position.copy(center)
    pivot.quaternion.identity()
    pivot.scale.set(1, 1, 1)
    pivot.updateMatrixWorld(true)
    gizmo.attach(pivot)
    gizmo.setMode(mode)
    gizmo.getHelper().visible = true
    invalidate()
  })

  function beginDrag(): void {
    if (explosionActive() || cad.explodedView.enabled) return
    useElementsStore.getState().beginEdit()
    pivot.updateMatrix()
    dragStart = {
      pivotMatrix: pivot.matrix.clone(),
      items: selectedIds().flatMap((id) => {
        const object = objectOf(id)
        if (!object) return []
        object.updateMatrix()
        return [{ id, object, matrix: object.matrix.clone(), center: (object.userData.pivot as THREE.Vector3).clone() }]
      })
    }
  }
  /**
   * While a part is moved with the gizmo its pivot catches the named points of the other parts (endpoint, midpoint, centre,
   * quadrant, crossings...) on the axes being dragged, and the snap marker shows which one. Only a move snaps: a rotation
   * or a scale has no position to catch.
   */
  function snapDragPivot(): void {
    if (transformMode() !== "translate" || !snap.snapSettings().enabled) { snap.clearIndicator(); return }
    const axes = (gizmo?.axis ?? "").toLowerCase().split("").filter((letter): letter is "x" | "y" | "z" => letter === "x" || letter === "y" || letter === "z")
    if (axes.length === 0) { snap.clearIndicator(); return }
    const offset = originOffset()
    const model = { x: pivot.position.x - offset.x, y: pivot.position.y - offset.y, z: pivot.position.z - offset.z }
    // Where the drag began is the start point: perpendicular, tangent and parallel are relative to it.
    const from = dragStart ? new THREE.Vector3().setFromMatrixPosition(dragStart.pivotMatrix) : undefined
    const anchor = from ? { x: from.x - offset.x, y: from.y - offset.y, z: from.z - offset.z } : undefined
    const hit = snap.snapAlongAxes(model, axes, new Set(selectedIds()), unitsPerPixel(), anchor)
    if (!hit) return
    for (const axis of axes) pivot.position[axis] = hit[axis] + offset[axis]
    pivot.updateMatrix()
  }
  function updateDrag(): void {
    if (!dragStart) return
    snapDragPivot()
    applyDragDelta(dragStart, deltaFrom(dragStart, pivot))
    invalidate()
  }
  function endDrag(): void {
    if (!dragStart) return
    const start = dragStart
    dragStart = undefined
    commitDrag(start, deltaFrom(start, pivot))
    useElementsStore.getState().endEdit()
    snap.clearIndicator()
  }

  // Control points for a single selected element.
  const clearControlPoints = () => {
    for (const point of controlPoints) disposeObject(point)
    controlPoints = []
  }
  const refreshControlPoints = () => {
    clearControlPoints()
    const ids = selectedIds()
    const element = ids.length === 1 ? elements.elements.find((candidate) => candidate.id === ids[0]) : undefined
    if (!scene || !element || transformStore.mode !== "none" || explosionActive() || cad.explodedView.enabled) return
    const e = element as Record<string, unknown>
    if (e.rotation || e.scale || e.translateX !== undefined) return
    controlPoints = createControlPointsForElement(element)
    for (const point of controlPoints) scene.add(point)
    invalidate()
  }
  createEffect(() => {
    rebuilds()
    transformStore.mode
    if (ready()) refreshControlPoints()
  })

  // Component preview placement.
  createEffect(() => {
    const name = props.previewComponent
    if (!ready() || !scene) return
    if (preview) { disposeObject(preview); preview = undefined }
    setPlacing(false)
    if (!name) { if (orbit) orbit.enabled = true; invalidate(); return }
    const component = props.previewLibraryItem ?? predefinedComponents.find((candidate: any) => candidate.data === name || candidate.name === name)
    const object = component ? createComponentPreview(component) : null
    if (!object) return
    if (object instanceof THREE.Mesh) {
      const material = object.material as THREE.MeshStandardMaterial
      material.transparent = true
      material.opacity = 0.7
      material.color.set(0x4a90e2)
    }
    const at = untrackedPreviewPosition()
    object.position.set(at.x, at.y, at.z)
    object.userData.isPreview = true
    scene.add(object)
    preview = object
    setPlacing(true)
    if (orbit) orbit.enabled = false
    invalidate()
  })
  const untrackedPreviewPosition = () => previewPosition()

  const cancelPlacement = () => {
    lastPlaced = undefined
    if (preview) disposeObject(preview)
    preview = undefined
    setPlacing(false)
    if (orbit) orbit.enabled = true
    invalidate()
  }

  // ---------------------------------------------------------------------------------------------------- pointer
  const finishInteraction = (additive = pointerDown?.additive ?? false) => {
    if (activeDragPoint) {
      activeDragPoint = undefined
      // One history step for the whole drag, not one per pointer move.
      endControlPointDrag()
      if (orbit) orbit.enabled = true
    }
    const box = screenBox()
    if (box) {
      const moved = Math.hypot(box.end.x - box.start.x, box.end.y - box.start.y) > 4
      const hits = moved ? boxSelectionHits(box) : []
      selection.endBoxSelection()
      setScreenBox(undefined)
      if (moved) selection.selectMultiple(additive ? [...selection.selectedElementIds, ...hits] : hits)
      if (orbit) orbit.enabled = !isPlacing()
    }
  }

  const localScreenPoint = (event: { clientX: number; clientY: number }) => {
    const rect = container.getBoundingClientRect()
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }
  }
  const updateScreenBox = (event: { clientX: number; clientY: number }) => {
    const box = screenBox()
    if (!box) return
    setScreenBox({ start: box.start, end: localScreenPoint(event) })
  }
  const boxSelectionHits = (box: ScreenBox): string[] => {
    if (!camera || !container) return []
    const rect = container.getBoundingClientRect()
    return visibleObjects.filter(object => {
      if (isLocked(String(object.userData.elementId))) return false
      const bounds = projectedSelectionBounds(object, camera!, rect.width, rect.height)
      return bounds !== undefined && boxSelectionIncludes(box, bounds)
    }).map(object => String(object.userData.elementId))
  }

  /** How many model units one screen pixel covers at the orbit target: the snap tolerance of the panel is in pixels. */
  const unitsPerPixel = (): number => {
    if (!camera || !container || container.clientHeight === 0) return 1
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = orbit ? camera.position.distanceTo(orbit.target) : camera.position.length()
      return Math.max((2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / container.clientHeight, 1e-6)
    }
    return 1
  }
  /**
   * How many model units one pixel covers on the work plane right under the cursor. A tilted view stretches the plane, so
   * it is measured on the plane itself (one pixel to the right, one down) and the larger step counts; the estimate from the
   * orbit distance is the fallback when the cursor is off the plane.
   */
  const unitsPerPixelOnPlane = (): number => {
    const fallback = unitsPerPixel()
    if (!camera || !container) return fallback
    const here = planePoint()
    if (!here) return fallback
    const rect = container.getBoundingClientRect()
    const reach = (dx: number, dy: number): number => {
      raycaster.setFromCamera(new THREE.Vector2(mouse.x + (dx * 2) / rect.width, mouse.y - (dy * 2) / rect.height), camera!)
      const other = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1)), new THREE.Vector3())
      return other ? other.distanceTo(here) : 0
    }
    const step = Math.max(reach(1, 0), reach(0, 1))
    raycaster.setFromCamera(mouse, camera)
    return step > 1e-9 ? step : fallback
  }
  /** Where the last part was placed in this session: the next placement snaps relative to it (perpendicular, parallel...). */
  let lastPlaced: Point3 | undefined
  const snapped = (point: Point3): Point3 => (snap.snapSettings().enabled ? snap.snapToPoint(point, lastPlaced, unitsPerPixelOnPlane()) ?? point : point)

  /**
   * The cursor readout the status bar shows. Published once per frame at most: a pointer can emit
   * hundreds of moves a second and every publish walks the store (see `state/zustand.ts`), which no
   * readout benefits from.
   */
  let mouseFrame = 0
  let pendingMouse: { x: number; y: number; z: number } | undefined
  const publishMousePosition = (position: { x: number; y: number; z: number }): void => {
    pendingMouse = position
    if (mouseFrame) return
    mouseFrame = requestAnimationFrame(() => {
      mouseFrame = 0
      if (!pendingMouse) return
      elements.setMousePosition(pendingMouse)
      pendingMouse = undefined
    })
  }

  /**
   * Hover picking, once per frame. `elementIdAt` is a full raycast over the drawing, and a pointer
   * reports far more moves than the display has frames.
   */
  let hoverFrame = 0
  let pendingHover: MouseEvent | undefined
  const scheduleHover = (event: MouseEvent): void => {
    pendingHover = event
    if (hoverFrame) return
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      const move = pendingHover
      pendingHover = undefined
      if (!move || !container || !scene || !camera) return
      setPointer(move)
      if (raycaster.intersectObjects(controlPoints).length > 0) { container.style.cursor = "pointer"; return }
      const id = gizmo?.axis ? null : elementIdAt()
      if (id !== hoveredId()) {
        setHoveredId(id)
        container.style.cursor = id ? "pointer" : "default"
      }
      const hit = planePoint()
      if (hit) publishMousePosition({ x: round2(hit.x), y: round2(hit.y), z: round2(hit.z) })
    })
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!container || !scene || !camera) return
    setPointer(event)
    const rect = container.getBoundingClientRect()

    if (drawTool()) { drawMove(); return }
    if (isPlacing() && preview) {
      const hit = planePoint()
      if (!hit) return
      // The snap points are in model units; the scene is shifted by the origin offset.
      const offset = originOffset()
      const model = snapped({ x: hit.x - offset.x, y: hit.y - offset.y, z: hit.z - offset.z })
      const at = { x: model.x + offset.x, y: model.y + offset.y, z: model.z + offset.z }
      preview.position.set(at.x, at.y, at.z)
      setPreviewPosition(at)
      publishMousePosition({ x: round2(at.x), y: round2(at.y), z: round2(at.z) })
      invalidate()
      return
    }
    if (screenBox()) { updateScreenBox(event); return }
    if (activeDragPoint) {
      const hit = planePoint()
      if (hit) {
        applyControlPointDrag(controlPoints, activeDragPoint.elementId, activeDragPoint.pointIndex, hit.x, hit.y, hit.z)
        refreshControlPoints()
        publishMousePosition({ x: round2(hit.x), y: round2(hit.y), z: round2(hit.z) })
      }
      return
    }
    if (event.buttons > 0) return
    scheduleHover(event)
  }

  const onMouseDown = (event: MouseEvent) => {
    if (!container || !scene || !camera || event.target !== renderer?.domElement) return
    if (drawTool()) { if (event.button === 0) { setPointer(event); drawClick() } return }
    if (isPlacing()) { placeComponent(); return }
    if (event.button !== 0) return
    if (gizmo && (gizmo.dragging || gizmo.axis)) return
    pointerDown = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.ctrlKey || event.metaKey || isMultiSelectMode() }
    if (isSelectionMode()) {
      const start = localScreenPoint(event)
      setScreenBox({ start, end: start })
      selection.startBoxSelection(start)
      if (orbit) orbit.enabled = false
      event.preventDefault()
      return
    }
    setPointer(event)
    const pointHit = raycaster.intersectObjects(controlPoints)[0]
    if (pointHit?.object.userData.isControlPoint) {
      activeDragPoint = { elementId: pointHit.object.userData.elementId, pointIndex: pointHit.object.userData.pointIndex }
      beginControlPointDrag()
      if (orbit) orbit.enabled = false
      return
    }
    pointerDown = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.ctrlKey || event.metaKey || isMultiSelectMode() }
  }

  const onMouseUp = (event: MouseEvent) => {
    // While a shape is drawn the clicks belong to the tool: they select nothing.
    if (drawTool()) { pointerDown = undefined; return }
    const down = pointerDown
    const box = screenBox()
    if (box) updateScreenBox(event)
    const boxMoved = box && Math.hypot(event.clientX - (down?.x ?? event.clientX), event.clientY - (down?.y ?? event.clientY)) > 4
    finishInteraction(down?.additive ?? (event.shiftKey || event.ctrlKey || event.metaKey || isMultiSelectMode()))
    pointerDown = undefined
    if (boxMoved) return
    if (!down || !container || !camera || isPlacing()) return
    if (gizmo && (gizmo.dragging || gizmo.axis)) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return // an orbit drag, not a click
    setPointer(event)
    const id = elementIdAt()
    if (id && !isLocked(id)) selection.selectElement(id, down.additive)
    else if (!id && !down.additive) selection.clearSelection()
  }

  // ---------------------------------------------------------------------------------------------------- drawing tools
  const canDraw = () => { const layer = layers.layers.find((candidate) => candidate.id === layers.activeLayer); return !!layer && layer.locked !== true }
  const clearDrawPreview = () => {
    if (drawPreview) { scene?.remove(drawPreview); disposeObject(drawPreview); drawPreview = undefined; invalidate() }
  }
  const stopDrawing = () => {
    setDrawTool(undefined); setDrawStart(undefined); clearDrawPreview(); snap.clearIndicator()
    if (orbit) orbit.enabled = !isPlacing()
    if (container) container.style.cursor = "default"
  }
  const startDrawing = (tool: DrawTool): boolean => {
    if (!canDraw() || !scene) return false
    if (isPlacing()) cancelPlacement()
    setDrawStart(undefined); clearDrawPreview()
    setDrawTool(tool)
    if (orbit) orbit.enabled = false
    if (container) container.style.cursor = "crosshair"
    return true
  }
  /** The point under the cursor on the work plane, in model units, snapped to the drawing's points when snapping is on. */
  const drawPoint = (): DrawPoint | undefined => {
    const hit = planePoint()
    if (!hit) return undefined
    const offset = originOffset()
    const raw = { x: hit.x - offset.x, y: hit.y - offset.y, z: hit.z - offset.z }
    const tool = drawTool()
    if (!tool || !snap.snapSettings().enabled) return raw
    const snappedPoint = snap.snapToPoint(raw, anchorOf(tool, drawStart()), unitsPerPixelOnPlane())
    return { x: snappedPoint.x, y: snappedPoint.y, z: snappedPoint.z }
  }
  const showDrawPreview = (tool: DrawTool, start: DrawPoint, end: DrawPoint) => {
    if (!scene) return
    const offset = originOffset()
    const points = previewOutline(tool, start, end).map((point) => new THREE.Vector3(point.x + offset.x, point.y + offset.y, point.z + offset.z))
    if (!drawPreview) {
      drawPreview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x00bcd4, depthTest: false }))
      drawPreview.renderOrder = 10
      scene.add(drawPreview)
    }
    drawPreview.geometry.setFromPoints(points)
    invalidate()
  }
  const drawMove = () => {
    const tool = drawTool(), start = drawStart(), at = drawPoint()
    if (!tool || !at) return
    publishMousePosition({ x: round2(at.x), y: round2(at.y), z: round2(at.z) })
    if (start) showDrawPreview(tool, start, at); else invalidate()
  }
  const drawClick = () => {
    const tool = drawTool(), at = drawPoint()
    if (!tool || !at) return
    const start = drawStart()
    if (!start) { setDrawStart(at); return }
    const element = elementFromPoints(tool, start, at)
    // Two clicks on the same spot make nothing: keep waiting for the second point.
    if (!element) return
    elements.addElement(element)
    clearDrawPreview()
    setDrawStart(nextStart(tool, at))
  }

  const placeComponent = () => {
    const name = props.previewComponent
    if (!name || !preview) return
    const position = previewPosition()
    const component = props.previewLibraryItem ?? predefinedComponents.find((candidate: any) => candidate.data === name || candidate.name === name)
    if (!component) return
    const offset = originOffset()
    const model = { x: position.x - offset.x, y: position.y - offset.y, z: position.z - offset.z }
    const id = elements.addElement(transformLibraryItemToCADElement(component, model))
    if (!id) return
    lastPlaced = model
    selection.selectElement(id)
    props.onComponentPlaced?.(name, position)
    cancelPlacementKeepPreview()
  }
  const cancelPlacementKeepPreview = () => { setPlacing(false); if (orbit) orbit.enabled = true }

  // Library drag & drop.
  const onDragOver = (event: DragEvent) => {
    if (props.allowDragDrop === false) return
    event.preventDefault()
    setDraggingComponent(true)
    if (!container || !camera || !scene) return
    setPointer(event)
    let target: Point3
    const hits = visibleObjects.length > 0 ? raycaster.intersectObjects(visibleObjects, true) : []
    if (hits.length > 0) { const shift = originOffset(); target = { x: hits[0]!.point.x - shift.x, y: hits[0]!.point.y - shift.y, z: hits[0]!.point.z - shift.z } }
    else {
      const hit = planePoint()
      const offset = originOffset()
      target = hit ? { x: hit.x - offset.x, y: hit.y - offset.y, z: hit.z - offset.z } : { x: 0, y: 0, z: 0 }
    }
    target = snapped(target)
    const offset = originOffset()
    setDropPosition(target)
    setDropScreen(worldToScreen({ x: target.x + offset.x, y: target.y + offset.y, z: target.z + offset.z }) ?? undefined)
  }
  const onDrop = (event: DragEvent) => {
    if (props.allowDragDrop === false) return
    event.preventDefault()
    const componentId = event.dataTransfer?.getData("component/id")
    setDraggingComponent(false)
    if (!componentId) return
    const component = predefinedComponents.find((candidate: any) => candidate.data === componentId || candidate.name === componentId)
    if (component) { elements.addElement(transformLibraryItemToCADElement(component, dropPosition())); lastPlaced = dropPosition() }
  }

  // ---------------------------------------------------------------------------------------------------- keyboard
  // The canvas answers the editor's commands (`shared/keybindings/catalog.ts`); the chords are the user's keymap, so
  // nothing here names a key. A second canvas (a dialog's) leaves them to the main one.
  const toggleFourViews = () => { fourViewOn = !fourViewOn; setFourView(fourViewOn); if (orbit) orbit.enabled = !fourViewOn && !isPlacing(); invalidate() }
  const toggleProjection = () => { if (!rig) return; rig.setFlat(!rig.flat()); setFlatView(rig.flat()) }
  const lookFrom = (direction: readonly [number, number, number]) => { rig?.snapTo([...direction]); invalidate() }
  const transforming = () => transformStore.isTransforming && transformStore.currentSession !== undefined
  const needsSelection = (run: () => void) => (): boolean | void => { if (selectedIds().length === 0) return false; run() }
  const needsTwo = (operation: BooleanOperation) => (): boolean => runBoolean(operation)
  const setTransformKind = (mode: TransformMode) => (): boolean | void => { if (cad.explodedView.enabled) return false; transformStore.setMode(mode) }
  const constrain = (axis: "x" | "y" | "z") => (): boolean | void => { if (transformStore.mode === "none") return false; transformStore.setActiveAxis(axis) }
  onMount(() => {
    if (props.keyboard === false) return
    const off = app.keys.register({
      // Escape undoes whatever is in flight, then deselects: one press clears the whole editing state.
      "edit.cancel": () => {
        // A shape being drawn goes first: Esc drops the point, a second Esc leaves the tool, and only then the selection.
        if (drawTool()) {
          if (drawStart()) { setDrawStart(undefined); clearDrawPreview() } else stopDrawing()
          return
        }
        const busy = transforming() || transformStore.mode !== "none" || isPlacing() || selectedIds().length > 0 || cancelBox()
        if (!busy) return false
        if (transforming()) transformStore.cancelTransform(transformStore.currentSession!.id)
        else transformStore.setMode("none")
        cancelBox()
        if (isPlacing()) cancelPlacement(); else if (selectedIds().length > 0) selection.clearSelection()
      },
      "file.save": () => { if (props.onSave === undefined) return false; props.onSave() },
      "edit.undo": () => { elements.undo() },
      "edit.redo": () => { elements.redo() },
      "view.zoomIn": () => { zoom(1 / 1.2) },
      "view.zoomOut": () => { zoom(1.2) },
      "view.zoomFit": () => { fitToView() },
      "cad.draw.line": () => startDrawing("line"),
      "cad.draw.circle": () => startDrawing("circle"),
      "cad.draw.rectangle": () => startDrawing("rectangle"),
      "cad.delete": needsSelection(() => selection.deleteSelection()),
      "cad.copy": needsSelection(() => elements.copySelectedElement()),
      "cad.paste": () => { elements.pasteElement() },
      "cad.duplicate": needsSelection(() => selection.duplicateSelection()),
      "cad.selectAll": () => { selection.selectMultiple(elements.elements.filter((element) => !isLocked(element.id)).map((element) => element.id)) },
      "cad.deselectAll": needsSelection(() => selection.clearSelection()),
      "cad.transform.translate": setTransformKind("translate"),
      "cad.transform.rotate": setTransformKind("rotate"),
      "cad.transform.scale": setTransformKind("scale"),
      "cad.transform.axisX": constrain("x"),
      "cad.transform.axisY": constrain("y"),
      "cad.transform.axisZ": constrain("z"),
      "cad.transform.commit": () => { if (!transforming()) return false; transformStore.commitTransform(transformStore.currentSession!.id) },
      "cad.view.mode3d": () => { cad.setViewMode("3d") },
      "cad.view.mode2d": () => { cad.setViewMode("2d") },
      "cad.view.grid": () => { cad.toggleGrid() },
      "cad.view.axes": () => { cad.toggleAxis() },
      "cad.view.fullscreen": () => { toggleFullscreen() },
      "cad.view.iso": () => { lookFrom([ISO_VIEW.x, ISO_VIEW.y, ISO_VIEW.z]) },
      "cad.view.projection": () => { toggleProjection() },
      "cad.view.fourViews": () => { toggleFourViews() },
      ...Object.fromEntries(CUBE_FACES.map((face) => [`cad.view.${face.name}`, () => { lookFrom(face.normal) }])),
      "cad.snap.toggle": () => { snap.updateSnapSettings({ enabled: !snap.snapSettings().enabled }) },
      ...Object.fromEntries(SNAP_TYPES.map(([type]) => [`cad.snap.type.${type}`, () => { snap.toggleSnapType(type as SnapType) }])),
      "cad.boolean.union": needsTwo("union"),
      "cad.boolean.subtract": needsTwo("subtract"),
      "cad.boolean.intersect": needsTwo("intersect")
    })
    onCleanup(off)
  })

  // ---------------------------------------------------------------------------------------------------- overlay data
  const bounds = createMemo(() => { selectedIds(); elements.elements; return selection.getSelectionBounds() })
  const snapScreen = createMemo(() => {
    frame()
    const indicator = snap.snapIndicator()
    const offset = originOffset()
    const at = indicator.visible ? worldToScreen({ x: indicator.x + offset.x, y: indicator.y + offset.y, z: indicator.z + offset.z }) : null
    return { x: at?.x ?? 0, y: at?.y ?? 0, type: indicator.type, visible: indicator.visible && at !== null }
  })
  const refreshMemory = () => {
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
    setMemory({ used: heap?.usedJSHeapSize ?? 0, total: heap?.totalJSHeapSize ?? 0, geometries: renderer?.info.memory.geometries ?? 0, textures: renderer?.info.memory.textures ?? 0 })
  }
  const cleanupMemory = () => {
    renderer?.renderLists.dispose()
    refreshMemory()
  }
  onMount(() => {
    const timer = setInterval(() => setFrame((n) => n + 1), 250)
    onCleanup(() => clearInterval(timer))
  })

  const shortcutsTitle = () => {
    const chords = app.keys.keymap().entry("app.shortcuts")?.chords ?? []
    return `${t("keys.title")} (${chords.map((chord) => displayChord(chord, app.keys.platform)).join(" / ")})`
  }
  const singleSelected = () => (selectedIds().length === 1 ? selectedIds()[0]! : undefined)

  return (
    <div
      ref={container}
      style={{ width: size(props.width ?? "100%"), height: size(props.height ?? "100%") }}
      class={`cad-viewport relative bg-[#2A2A2A] overflow-hidden ${isPlacing() || isDraggingComponent() ? "cursor-cell" : ""}`}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onDblClick={(event) => {
        // A double click on a selected part frames it (with the select tool: other tools use the double click themselves).
        if (cad.activeTool !== "select" || selectedIds().length === 0 || (event.target as HTMLElement).closest("button, input, select, textarea, [role='dialog']")) return
        if (elementIdAt() !== null) fitToView()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => setDraggingComponent(false)}
    >
      <Show when={webglFailed()}>
        <div class="absolute inset-0 flex items-center justify-center text-sm text-gray-300 px-6 text-center">{t("viewport.noWebgl")}</div>
      </Show>

      {props.children}

      <div class="panel cad-viewport-top">
        <div class="cad-viewport-selection">
          <SelectionControls
            isSelectionMode={isSelectionMode()}
            isMultiSelectMode={isMultiSelectMode()}
            onSelectionModeChange={(active) => { setSelectionMode(active); if (active) cad.setActiveTool("select") }}
            onMultiSelectModeToggle={() => setMultiSelectMode((on) => !on)}
            onDeleteSelected={() => selection.deleteSelection()}
            onDuplicateSelected={() => selection.duplicateSelection()}
            onMoveToLayer={(layerId) => selection.moveSelectionToLayer(layerId)}
            onCreateComponent={() => setShowComponentModal(true)}
            bounds={bounds()}
          />
        </div>
        <div class="cad-viewport-tools">
          <div class="cad-viewport-actions">
            <button type="button" onClick={() => { setShowElementInfo(false); setShowPerformance(false); setShowElementsList((open) => !open) }} class="cad-viewport-button" title="Toggle Elements List" aria-label="Toggle Elements List" aria-expanded={showElementsList()}><Layers size={18} /></button>
            <Show when={singleSelected() !== undefined}>
              <button type="button" onClick={() => { setShowElementsList(false); setShowPerformance(false); setShowElementInfo((open) => !open) }} class="cad-viewport-button" title="Show Element Properties" aria-label="Show Element Properties" aria-expanded={showElementInfo()}><Sliders size={18} /></button>
            </Show>
            <button type="button" onClick={() => { refreshMemory(); setShowElementsList(false); setShowElementInfo(false); setShowPerformance((open) => !open) }} class="cad-viewport-button" title="Performance Settings" aria-label="Performance Settings" aria-expanded={showPerformance()}><Cog size={18} /></button>
          </div>
          <Show when={selectedIds().length > 0 && !explosionActive() && !cad.explodedView.enabled}>
            <div class="cad-viewport-transforms" role="group" aria-label={t("cad.viewport.transforms")}>
              <button onClick={() => setMode("translate")} class="cad-viewport-button" aria-pressed={transformMode() === "translate"}><Move size={14} />Move (G)</button>
              <button onClick={() => setMode("rotate")} class="cad-viewport-button" aria-pressed={transformMode() === "rotate"}><RotateCw size={14} />Rotate (R)</button>
              <button onClick={() => setMode("scale")} class="cad-viewport-button" aria-pressed={transformMode() === "scale"}><Maximize2 size={14} />Scale (S)</button>
              <button onClick={() => transformControls.resetToOrigin()} class="cad-viewport-button" title="Reset Position">Reset</button>
              <button onClick={() => transformControls.alignToGrid()} class="cad-viewport-button" title="Align to Grid">Grid</button>
              <button onClick={() => transformControls.duplicateInPlace()} class="cad-viewport-button" title="Duplicate">Dup</button>
              <For each={[
                { op: "union" as const, title: "Boolean Union (Ctrl+U)", extra: "" },
                { op: "subtract" as const, title: "Boolean Subtract (Ctrl+Shift+S)", extra: "M2 2l20 20" },
                { op: "intersect" as const, title: "Boolean Intersect (Ctrl+I)", extra: "M8 14a6 6 0 0 0 8-8" }
              ]}>{(entry) =>
                <button onClick={() => runBoolean(entry.op)} class="cad-viewport-button" title={entry.title} disabled={selectedIds().length < 2} classList={{ "opacity-40": selectedIds().length < 2 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="6" /><circle cx="16" cy="16" r="6" />
                    <Show when={entry.extra}><path d={entry.extra} /></Show>
                  </svg>
                </button>}
              </For>
            </div>
          </Show>

          <Show when={showElementsList()}>
            <div class="cad-viewport-popover"><ElementsListPanel onClose={() => setShowElementsList(false)} /></div>
          </Show>
          <Show when={singleSelected() !== undefined && showElementInfo()}>
            <div class="cad-viewport-popover"><ElementInfo elementId={singleSelected()!} onClose={() => setShowElementInfo(false)} /></div>
          </Show>
          <Show when={showPerformance()}>
            <div class="cad-viewport-popover p-3">
              <h3 class="text-lg font-semibold mb-3">Performance & Events</h3>
              <div class="mb-4" data-testid="look-tier">
                <h4 class="text-sm font-medium mb-2">Visual quality</h4>
                <div class="flex gap-1" role="radiogroup" aria-label="Visual quality">
                  <For each={LOOK_TIERS}>{(tier) =>
                    <button type="button" role="radio" aria-checked={lookTier() === tier} onClick={() => setLookTier(tier)}
                      class={`flex-1 text-xs px-2 py-1 rounded capitalize ${lookTier() === tier ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>{tier}</button>}
                  </For>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Low: plain lights. Balanced: the classic look, refined. Standard: studio reflections and tone mapping. High: sharper reflections.</p>
              </div>
              <div class="mb-4">
                <h4 class="text-sm font-medium mb-2">Memory Usage</h4>
                <div class="text-xs space-y-1 text-gray-600 dark:text-gray-300">
                  <div>JS Heap: {(memory().used / 1024 / 1024).toFixed(1)}MB</div>
                  <div>Total Heap: {(memory().total / 1024 / 1024).toFixed(1)}MB</div>
                  <div>Geometries: {memory().geometries}</div>
                  <div>Textures: {memory().textures}</div>
                </div>
                <div class="mt-2 space-x-2">
                  <button onClick={cleanupMemory} class="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">Cleanup Memory</button>
                  <button onClick={refreshMemory} class="text-xs bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600">Refresh</button>
                </div>
              </div>
              <button onClick={() => setShowPerformance(false)} class="mt-4 w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600">Close</button>
            </div>
          </Show>
        </div>
      </div>
      <Show when={transformControls.isTransforming}>
        <div style="position:absolute;bottom:20px;left:20px;background-color:rgba(0,0,0,0.9);color:white;padding:12px 16px;border-radius:8px;font-size:12px;font-family:monospace;z-index:1002">
          <div>Mode: {transformStore.mode.toUpperCase()}</div>
          <div>Elements: {selectedIds().length}</div>
          <div style="font-size:10px;margin-top:4px;color:#9ca3af">Press ENTER to confirm, ESC to cancel</div>
        </div>
      </Show>

      <Show when={fourView()}>
        <div class="cad-quadrants" data-testid="cad-four-views" onMouseDown={(event) => event.stopPropagation()} onMouseMove={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDblClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
          <span>{t("viewport.view.top")}</span><span>{t("viewport.view.front")}</span><span>{t("viewport.view.right")}</span><span>{t("viewport.view.perspective")}</span>
        </div>
      </Show>

      <Show when={cad.gridVisible && gridStep() > 0}><div class="vp-grid-scale cad-grid-scale" data-testid="grid-scale">{t("viewport.gridSpacing", { step: formatGridStep(gridStep()) })}</div></Show>

      <div class="cad-viewcube-dock">
        <ViewCube
          enabled={ready() && cad.viewMode === "3d"}
          orthographic={flatView()}
          onSnap={(direction) => { rig?.snapTo(direction); invalidate() }}
          onOrbit={(dAzimuth, dPolar) => rig?.orbitBy(dAzimuth, dPolar)}
          onIsometric={() => rig?.snapTo([ISO_VIEW.x, ISO_VIEW.y, ISO_VIEW.z])}
          onFit={() => fitToView()}
          onProjection={toggleProjection}
          fourViews={fourView()}
          onFourViews={toggleFourViews}
          register={(api) => { cubeApi = api; cubeStale = true }}
        />
      </div>

      <SnapIndicator x={snapScreen().x} y={snapScreen().y} type={snapScreen().type} visible={snapScreen().visible} />

      <Show when={drawTool()}>
        <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-cyan-700 text-white px-4 py-2 rounded-md shadow-lg z-100" data-testid="draw-hint">
          <p class="text-sm font-medium">{drawStart() ? t("cad.draw.next") : t("cad.draw.first")}</p>
        </div>
      </Show>

      <Show when={isPlacing()}>
        <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md shadow-lg z-100">
          <p class="text-sm font-medium">Click to place the component or press ESC to cancel</p>
        </div>
      </Show>
      <Show when={isDraggingComponent()}><DragDropIndicator position={dropPosition()} screenPosition={dropScreen()} /></Show>

      <BoxSelection box={screenBox()} />
      <ComponentCreationModal isOpen={showComponentModal()} onClose={() => setShowComponentModal(false)} />

      <div class="panel cad-viewport-footer" data-testid="cad-viewport-footer">
      {props.footerDock}
      <div class="cad-viewport-footer__section" data-testid="section-control">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] text-white"
          style={{ "background-color": cad.section.enabled ? "#f57c00" : "rgba(0,0,0,0.7)" }}
          aria-pressed={cad.section.enabled}
          title={t("cad.section")}
          onClick={() => {
            const range = sectionRange()
            const inside = cad.section.position >= range.min && cad.section.position <= range.max
            cad.setSection({ enabled: !cad.section.enabled, ...(inside ? {} : { position: Math.round((range.min + range.max) / 2) }) })
          }}
        >{t("cad.section")}</button>
        <Show when={cad.section.enabled}>
          <div class="cad-viewport-footer__section-fields">
            <For each={SECTION_AXES}>{(axis) => (
              <button type="button" aria-pressed={cad.section.axis === axis} aria-label={`${t("cad.section.axis")} ${axis.toUpperCase()}`}
                class="rounded px-1.5 py-0.5 uppercase" style={{ "background-color": cad.section.axis === axis ? "#f57c00" : "#374151" }}
                onClick={() => cad.setSection({ axis })}>{axis}</button>
            )}</For>
            <input type="range" aria-label={t("cad.section.constant")} min={sectionRange().min} max={sectionRange().max} step="0.5" value={cad.section.position}
              onInput={(event) => cad.setSection({ position: Number(event.currentTarget.value) })} />
            <input type="number" aria-label={t("cad.section.constant")} class="w-16 rounded bg-gray-700 px-1 text-right" step="0.5" value={cad.section.position}
              onInput={(event) => { const next = Number(event.currentTarget.value); if (Number.isFinite(next)) cad.setSection({ position: next }) }} />
            <label class="flex items-center gap-1"><input type="checkbox" checked={cad.section.inverted} onChange={(event) => cad.setSection({ inverted: event.currentTarget.checked })} />{t("cad.section.invert")}</label>
          </div>
        </Show>
      </div>
        <div class="cad-viewport-footer__actions">
          {props.footerActions}
          <button type="button" onClick={toggleFullscreen} class="panel-icon-btn" title={isFullscreen() ? "Exit fullscreen mode" : "Fullscreen view"} aria-label={isFullscreen() ? "Exit fullscreen mode" : "Fullscreen view"}>
            <Show when={isFullscreen()} fallback={<Maximize2 size={18} />}><Minimize2 size={18} /></Show>
          </button>
        </div>
      </div>
      <div class="absolute bottom-4 left-4">
        <button onClick={() => app.keys.setHelpOpen(true)} class="p-2 bg-[#F8FBFF] dark:bg-gray-800 bg-opacity-80 rounded-full text-gray-700 dark:text-gray-200 hover:bg-opacity-100 shadow-md hover:shadow-lg transition-all duration-200" title={shortcutsTitle()}>
          <HelpCircle size={18} />
        </button>
      </div>
    </div>
  )
}
