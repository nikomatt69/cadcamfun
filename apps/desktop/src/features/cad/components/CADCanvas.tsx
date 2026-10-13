import { registerViewportCapture } from "../../ai/lib/viewport-capture.ts"
import { spatialEvidence } from "../../ai/lib/spatial-evidence.ts"
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"
import { Cog, HelpCircle, Layers, Maximize, Maximize2, Minimize2, Move, RotateCw, Sliders } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useTransformControlsStore } from "../store/transformControlsStore.ts"
import { createSnap } from "../hooks/createSnap.ts"
import { createTransformControls } from "../hooks/createTransformControls.ts"
import { createCadKeyboardShortcuts } from "../hooks/createCadKeyboardShortcuts.ts"
import { applyControlPointDrag, beginControlPointDrag, createControlPointsForElement, endControlPointDrag } from "../lib/controlPoints.ts"
import { createComponentPreview, transformLibraryItemToCADElement } from "../lib/libraryTransform.ts"
import { predefinedComponents } from "../lib/predefinedLibraries.ts"
import { ALL_SHORTCUTS } from "../lib/shortcutsData.ts"
import {
  applyDragDelta, applyElementTransform, applyHighlight, booleanElement, buildElementObject, disposeObject, isDrawn, commitDrag,
  createCustomAxes, createOriginIndicator, deltaFrom, exportGLTF, exportOBJ, exportSTL, fitCameraToObjects,
  type BooleanOperation, type DragStart, type ElementTransformFields
} from "../lib/sceneHelpers.ts"
import { booleanFormed } from "../lib/createThreeObject.ts"
import { FrameScheduler } from "../lib/frame-scheduler.ts"
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
import ShortcutsDialog from "./ShortcutsDialog.tsx"

type TransformMode = "translate" | "rotate" | "scale"
type Point3 = { x: number; y: number; z: number }

/** What the page around the canvas can call (toolbar buttons, menus). */
export interface CADCanvasApi {
  readonly scene: () => THREE.Scene | undefined
  readonly camera: () => THREE.PerspectiveCamera | undefined
  readonly fitToView: () => void
  readonly zoom: (factor: number) => void
  readonly boolean: (operation: BooleanOperation) => void
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
  readonly children?: JSX.Element
}

const size = (value: string | number) => (typeof value === "number" ? `${value}px` : value)
const round2 = (value: number) => Math.round(value * 100) / 100
const BG = "#2A2A2A"
/** Front-right-above, in millimetres: the default 3D view of a Z-up scene (fit-to-view keeps this direction). */
const ISO_VIEW = new THREE.Vector3(300, -300, 240)
const QUICK_BUTTON = "padding:6px 8px;background-color:#374151;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px"
const modeButton = (active: boolean) =>
  `padding:6px 12px;background-color:${active ? "#3b82f6" : "#374151"};color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px`

/**
 * The 3D editor canvas: scene, camera and orbit controls, every element rendered through `createThreeObject`,
 * hover/click/box/multi selection, a transform gizmo for single and multiple elements (committed to the stores as
 * one history step), control-point editing, component placement and library drag & drop, boolean operations,
 * exports and the editor overlays. Port of the legacy `CADCanvas`.
 */
export default function CADCanvas(props: CADCanvasProps): JSX.Element {
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
  let gizmo: TransformControls | undefined
  let frames: FrameScheduler | undefined
  let dirty = true
  const invalidate = (): void => { dirty = true; frames?.invalidate() }
  const pivot = new THREE.Object3D()
  const raycaster = new THREE.Raycaster()
  raycaster.params.Line = { threshold: 0.4 }
  const mouse = new THREE.Vector2()
  let controlPoints: THREE.Object3D[] = []
  let preview: THREE.Object3D | undefined
  let dragStart: DragStart | undefined
  let activeDragPoint: { elementId: string; pointIndex: number } | undefined
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
  const [showShortcuts, setShowShortcuts] = createSignal(false)
  const [showPerformance, setShowPerformance] = createSignal(false)
  const [isPlacing, setPlacing] = createSignal(false)
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

  const screenToWorld = (screenX: number, screenY: number) => {
    if (!container || !camera) return null
    const rect = container.getBoundingClientRect()
    const ndc = new THREE.Vector3((screenX / rect.width) * 2 - 1, -(screenY / rect.height) * 2 + 1, 0).unproject(camera)
    const ray = new THREE.Raycaster(camera.position, ndc.sub(camera.position).normalize())
    const hit = new THREE.Vector3()
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit) ?? null
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
    return !!element && !!layers.layers.find((layer) => layer.id === element.layerId)?.locked
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(-5, -7.5, 10)
    scene.add(sun)
    const grid = new THREE.GridHelper(500, 500)
    grid.rotation.x = Math.PI / 2
    grid.userData.isGrid = true
    scene.add(grid)
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
      const moved = orbit?.update() === true
      if ((moved || dirty) && renderer && scene && camera) {
        dirty = false
        renderer.render(scene, camera)
      }
      return moved
    }, (callback) => window.requestAnimationFrame(callback), (id) => window.cancelAnimationFrame(id))
    orbit.addEventListener("change", invalidate)
    gizmo.addEventListener("change", invalidate)
    const visibility = () => frames?.suspend(document.hidden)
    document.addEventListener("visibilitychange", visibility)
    visibility()
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
    const release = () => finishInteraction()
    window.addEventListener("mouseup", release)

    onCleanup(() => {
      unregisterCapture()
      frames?.dispose()
      frames = undefined
      cancelAnimationFrame(mouseFrame)
      cancelAnimationFrame(hoverFrame)
      clearTimeout(fullscreenTimer)
      document.removeEventListener("visibilitychange", visibility)
      observer?.disconnect()
      window.removeEventListener("resize", resize)
      document.removeEventListener("fullscreenchange", fullscreen)
      window.removeEventListener("mouseup", release)
      gizmo?.getHelper().removeFromParent()
      gizmo?.dispose()
      orbit?.dispose()
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
    if (center) { orbit.target.copy(center); orbit.update() }
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

  const runBoolean = (operation: BooleanOperation) => {
    const ids = selectedIds()
    if (ids.length < 2) return
    const result = booleanElement(operation, ids.flatMap((id) => objectOf(id) ?? []), layers.activeLayer)
    if (!result) return
    batch(() => {
      const id = elements.addElement(result)
      for (const original of ids) elements.deleteElement(original)
      selection.selectElement(id)
    })
  }

  const api: CADCanvasApi = {
    scene: () => scene, camera: () => camera, fitToView, zoom, boolean: runBoolean,
    exportSTL: () => { if (scene) exportSTL(scene) },
    exportOBJ: () => { if (scene) exportOBJ(scene) },
    exportGLTF: () => (scene ? exportGLTF(scene) : Promise.resolve()),
    toggleFullscreen, showShortcuts: () => setShowShortcuts(true)
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
    const grid = scene.children.find((child) => child.userData.isGrid) as THREE.GridHelper | undefined
    if (mode === "2d") {
      camera.position.set(0, 0, 50)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      orbit.target.set(0, 0, 0)
      orbit.enableRotate = false
      orbit.enablePan = true
      if (grid) { (grid.material as THREE.Material).opacity = 0.2; (grid.material as THREE.Material).transparent = true }
      axes?.children.forEach((child, index) => { child.visible = index !== 2 })
    } else {
      camera.up.set(0, 0, 1)
      camera.position.copy(ISO_VIEW)
      camera.lookAt(0, 0, 0)
      orbit.target.set(0, 0, 0)
      orbit.enableRotate = true
      orbit.enablePan = true
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
        const built = buildElementObject(element)
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
    if (objects.length === 0 || isSelectionMode()) { gizmo.detach(); gizmo.getHelper().visible = false; return }
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
  function updateDrag(): void {
    if (!dragStart) return
    applyDragDelta(dragStart, deltaFrom(dragStart, pivot))
    invalidate()
  }
  function endDrag(): void {
    if (!dragStart) return
    const start = dragStart
    dragStart = undefined
    commitDrag(start, deltaFrom(start, pivot))
    useElementsStore.getState().endEdit()
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
    if (!scene || !element || transformStore.mode !== "none") return
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
    if (selection.isBoxSelecting) {
      selection.endBoxSelection(boxSelectionHits(), additive)
      if (orbit) orbit.enabled = !isPlacing()
    }
  }

  const boxSelectionHits = (): string[] => {
    const start = selection.boxStartPosition
    const end = selection.boxEndPosition
    if (!start || !end || !camera || !container || !scene) return []

    const rect = container.getBoundingClientRect()
    const activeCamera = camera!
    const fromScreen = worldToScreen({ ...start, z: 0 })
    const toScreen = worldToScreen({ ...end, z: 0 })
    if (!fromScreen || !toScreen) return []
    const leftToRight = toScreen.x >= fromScreen.x
    const boxLeft = Math.min(fromScreen.x, toScreen.x) + rect.left
    const boxRight = Math.max(fromScreen.x, toScreen.x) + rect.left
    const boxTop = Math.min(fromScreen.y, toScreen.y) + rect.top
    const boxBottom = Math.max(fromScreen.y, toScreen.y) + rect.top
    const bounds = new THREE.Box3()
    // One pass over the elements instead of a layer lookup per candidate object.
    const lockedIds = new Set<string>()
    for (const element of elements.elements) {
      if (element.locked || layers.layers.find((layer) => layer.id === element.layerId)?.locked) lockedIds.add(element.id)
    }
    const entities = cadObjects().filter((object) => !lockedIds.has(object.userData.elementId as string))
    const corner = new THREE.Vector3()
    return entities.filter((object) => {
      object.updateMatrixWorld(true)
      bounds.setFromObject(object)
      if (bounds.isEmpty()) return false
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
      for (let index = 0; index < 8; index++) {
        corner.set(
          index & 4 ? bounds.max.x : bounds.min.x,
          index & 2 ? bounds.max.y : bounds.min.y,
          index & 1 ? bounds.max.z : bounds.min.z
        ).project(activeCamera)
        const x = rect.left + (corner.x + 1) * rect.width / 2
        const y = rect.top + (1 - corner.y) * rect.height / 2
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
      return leftToRight
        ? left >= boxLeft && right <= boxRight && top >= boxTop && bottom <= boxBottom
        : right >= boxLeft && left <= boxRight && bottom >= boxTop && top <= boxBottom
    }).map((object) => object.userData.elementId as string)
  }

  const snapped = (point: Point3): Point3 => (snap.snapSettings().enabled ? snap.snapToPoint(point) ?? point : point)

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

    if (isPlacing() && preview) {
      const hit = planePoint()
      if (!hit) return
      const at = snapped({ x: hit.x, y: hit.y, z: hit.z })
      preview.position.set(at.x, at.y, at.z)
      setPreviewPosition(at)
      publishMousePosition({ x: round2(at.x), y: round2(at.y), z: round2(at.z) })
      invalidate()
      return
    }
    if (selection.isBoxSelecting) {
      const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
      if (world) selection.updateBoxSelection({ x: world.x, y: world.y })
      return
    }
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
    if (!container || !scene || !camera) return
    if (isPlacing()) { placeComponent(); return }
    if (event.button !== 0) return
    if (gizmo && (gizmo.dragging || gizmo.axis)) return
    const rect = container.getBoundingClientRect()
    if (isSelectionMode()) {
      const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
      if (world) {
        selection.startBoxSelection({ x: world.x, y: world.y })
        if (orbit) orbit.enabled = false
        event.preventDefault()
        return
      }
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
    const down = pointerDown
    finishInteraction(down?.additive ?? (event.shiftKey || event.ctrlKey || event.metaKey || isMultiSelectMode()))
    pointerDown = undefined
    if (!down || !container || !camera || isPlacing()) return
    if (gizmo && (gizmo.dragging || gizmo.axis)) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return // an orbit drag, not a click
    setPointer(event)
    const id = elementIdAt()
    if (id && !isLocked(id)) selection.selectElement(id, down.additive)
    else if (!id && !down.additive) selection.clearSelection()
  }

  const placeComponent = () => {
    const name = props.previewComponent
    if (!name || !preview) return
    const position = previewPosition()
    const component = props.previewLibraryItem ?? predefinedComponents.find((candidate: any) => candidate.data === name || candidate.name === name)
    if (!component) return
    const offset = originOffset()
    const id = elements.addElement(transformLibraryItemToCADElement(component, { x: position.x - offset.x, y: position.y - offset.y, z: position.z - offset.z }))
    if (!id) return
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
    if (hits.length > 0) target = { x: hits[0]!.point.x, y: hits[0]!.point.y, z: hits[0]!.point.z }
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
    if (component) elements.addElement(transformLibraryItemToCADElement(component, dropPosition()))
  }

  // ---------------------------------------------------------------------------------------------------- keyboard
  createCadKeyboardShortcuts(props.keyboard === false ? {} : {
    onDelete: () => { if (selectedIds().length > 0) selection.deleteSelection() },
    onEscape: () => { if (isPlacing()) cancelPlacement(); else if (selectedIds().length > 0) selection.clearSelection() },
    onSelectAll: () => selection.selectMultiple(elements.elements.filter((element) => !isLocked(element.id)).map((element) => element.id)),
    onDeselectAll: () => selection.clearSelection(),
    onCopy: () => elements.copySelectedElement(),
    onPaste: () => elements.pasteElement(),
    onDuplicate: () => selection.duplicateSelection(),
    onUndo: () => elements.undo(),
    onRedo: () => elements.redo(),
    onZoomIn: () => zoom(1 / 1.2),
    onZoomOut: () => zoom(1.2),
    onZoomToFit: fitToView,
    onViewModeToggle: (mode) => cad.setViewMode(mode),
    onToggleGrid: () => cad.toggleGrid(),
    onToggleAxis: () => cad.toggleAxis(),
    onToggleFullscreen: toggleFullscreen,
    onToggleSnap: () => snap.updateSnapSettings({ enabled: !snap.snapSettings().enabled }),
    onShowShortcuts: () => setShowShortcuts(true),
    onSave: () => props.onSave?.()
  })
  onMount(() => {
    if (props.keyboard === false) return
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.ctrlKey && event.key.toLowerCase() === "u") { event.preventDefault(); runBoolean("union") }
      else if (event.ctrlKey && event.key.toLowerCase() === "i") { event.preventDefault(); runBoolean("intersect") }
      else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); runBoolean("subtract") }
      else if (event.ctrlKey && event.key.toLowerCase() === "t") { event.preventDefault() }
    }
    window.addEventListener("keydown", down)
    onCleanup(() => window.removeEventListener("keydown", down))
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

  const singleSelected = () => (selectedIds().length === 1 ? selectedIds()[0]! : undefined)

  return (
    <div
      ref={container}
      style={{ width: size(props.width ?? "100%"), height: size(props.height ?? "100%") }}
      class={`relative bg-gradient-to-b rounded-xl from-[#2A2A2A] to-[#303030] overflow-hidden ${isPlacing() || isDraggingComponent() ? "cursor-cell" : ""}`}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => setDraggingComponent(false)}
    >
      <Show when={webglFailed()}>
        <div class="absolute inset-0 flex items-center justify-center text-sm text-gray-300 px-6 text-center">{t("viewport.noWebgl")}</div>
      </Show>

      {props.children}

      {/* Quick transform toolbar */}
      <Show when={selectedIds().length > 0}>
        <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background-color:rgba(0,0,0,0.8);padding:8px 12px;border-radius:8px;z-index:1001">
          <button onClick={() => setMode("translate")} style={modeButton(transformMode() === "translate")}><Move size={14} />Move (G)</button>
          <button onClick={() => setMode("rotate")} style={modeButton(transformMode() === "rotate")}><RotateCw size={14} />Rotate (R)</button>
          <button onClick={() => setMode("scale")} style={modeButton(transformMode() === "scale")}><Maximize2 size={14} />Scale (S)</button>
          <div style="width:1px;background-color:#6b7280;margin:0 4px" />
          <button onClick={() => transformControls.resetToOrigin()} style={QUICK_BUTTON} title="Reset Position">Reset</button>
          <button onClick={() => transformControls.alignToGrid()} style={QUICK_BUTTON} title="Align to Grid">Grid</button>
          <button onClick={() => transformControls.duplicateInPlace()} style={QUICK_BUTTON} title="Duplicate">Dup</button>
        </div>
      </Show>

      <Show when={transformControls.isTransforming}>
        <div style="position:absolute;bottom:20px;left:20px;background-color:rgba(0,0,0,0.9);color:white;padding:12px 16px;border-radius:8px;font-size:12px;font-family:monospace;z-index:1002">
          <div>Mode: {transformStore.mode.toUpperCase()}</div>
          <div>Elements: {selectedIds().length}</div>
          <div style="font-size:10px;margin-top:4px;color:#9ca3af">Press ENTER to confirm, ESC to cancel</div>
        </div>
      </Show>

      <div class="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1" data-testid="section-control">
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
          <div class="flex items-center gap-2 rounded-md bg-black/80 px-2 py-1.5 text-[11px] text-white">
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

      <SnapIndicator x={snapScreen().x} y={snapScreen().y} type={snapScreen().type} visible={snapScreen().visible} />

      <div class="absolute top-4 left-4 z-10">
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

      <BoxSelection worldToScreen={worldToScreen} />

      <Show when={showElementsList()}>
        <div class="absolute top-16 cursor-pointer right-4 bottom-16 z-10"><ElementsListPanel onClose={() => setShowElementsList(false)} /></div>
      </Show>
      <Show when={singleSelected() !== undefined && showElementInfo()}>
        <div class="absolute cursor-pointer top-16 right-4 z-10 w-80"><ElementInfo elementId={singleSelected()!} onClose={() => setShowElementInfo(false)} /></div>
      </Show>
      <ComponentCreationModal isOpen={showComponentModal()} onClose={() => setShowComponentModal(false)} />

      <button onClick={() => setShowElementsList((open) => !open)} class="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10" title="Toggle Elements List">
        <Layers size={18} />
      </button>
      <Show when={singleSelected() !== undefined}>
        <button onClick={() => setShowElementInfo((open) => !open)} class="absolute top-4 right-16 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10" title="Show Element Properties">
          <Sliders size={18} />
        </button>
      </Show>

      <Show when={isPlacing()}>
        <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md shadow-lg z-100">
          <p class="text-sm font-medium">Click to place the component or press ESC to cancel</p>
        </div>
      </Show>
      <Show when={isDraggingComponent()}><DragDropIndicator position={dropPosition()} screenPosition={dropScreen()} /></Show>

      {/* Transformation tools */}
      <Show when={elements.selectedElement}>
        <div class="absolute top-14 right-4 flex space-x-2 bg-[#F8FBFF] dark:bg-gray-800 p-2 rounded-md shadow-md z-10">
          <button onClick={() => setMode("translate")} class={`p-2 rounded ${transformMode() === "translate" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`} title="Move (G)"><Move size={16} /></button>
          <button onClick={() => setMode("rotate")} class={`p-2 rounded ${transformMode() === "rotate" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`} title="Rotate (R)"><RotateCw size={16} /></button>
          <button onClick={() => setMode("scale")} class={`p-2 rounded ${transformMode() === "scale" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`} title="Scale (S)"><Maximize size={16} /></button>
          <For each={[
            { op: "union" as const, title: "Boolean Union (Ctrl+U)", extra: "" },
            { op: "subtract" as const, title: "Boolean Subtract (Ctrl+Shift+S)", extra: "M2 2l20 20" },
            { op: "intersect" as const, title: "Boolean Intersect (Ctrl+I)", extra: "M8 14a6 6 0 0 0 8-8" }
          ]}>{(entry) =>
            <button onClick={() => runBoolean(entry.op)} class="p-1 rounded-md hover:bg-gray-200 text-gray-800" title={entry.title} disabled={selectedIds().length < 2} classList={{ "opacity-40": selectedIds().length < 2 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="8" r="6" /><circle cx="16" cy="16" r="6" />
                <Show when={entry.extra}><path d={entry.extra} /></Show>
              </svg>
            </button>}
          </For>
        </div>
      </Show>

      {/* Performance */}
      <Show when={showPerformance()}>
        <div class="absolute top-16 right-40 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-10 w-80">
          <h3 class="text-lg font-semibold mb-3">Performance & Events</h3>
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
      <button onClick={() => { refreshMemory(); setShowPerformance((open) => !open) }} class="absolute top-4 right-28 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10" title="Performance Settings">
        <Cog size={18} />
      </button>

      <div class="absolute bottom-4 right-4 flex space-x-2">
        <button onClick={toggleFullscreen} class="p-2 bg-[#F8FBFF] dark:bg-black dark:text-white bg-opacity-80 rounded-md shadow-md hover:bg-opacity-100 z-10 transition-all duration-200" title={isFullscreen() ? "Exit fullscreen mode" : "Fullscreen view"}>
          <Show when={isFullscreen()} fallback={<Maximize2 size={20} class="text-gray-700" />}><Minimize2 size={20} class="text-gray-700" /></Show>
        </button>
      </div>
      <div class="absolute bottom-4 left-4">
        <button onClick={() => setShowShortcuts(true)} class="p-2 bg-[#F8FBFF] dark:bg-gray-800 bg-opacity-80 rounded-full text-gray-700 dark:text-gray-200 hover:bg-opacity-100 shadow-md hover:shadow-lg transition-all duration-200" title="Show keyboard shortcuts (? or F2)">
          <HelpCircle size={18} />
        </button>
      </div>
      <ShortcutsDialog isOpen={showShortcuts()} onClose={() => setShowShortcuts(false)} shortcuts={ALL_SHORTCUTS} />
    </div>
  )
}
