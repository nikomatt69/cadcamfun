/**
 * Selection transforms driven by the transform store: modes, sessions, quick moves, alignment and distribution,
 * and the held-modifier constraints (the G / R / S / X / Y / Z / Esc / Enter keys are keymap commands). Port of the legacy `useTransformControls` hook.
 * Read `mode`, `isTransforming`, `selectedCount` and `canTransform` inside a tracking scope.
 */
import { onCleanup, onMount } from "solid-js"
import { useCADStore } from "../store/cadStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import {
  transformControlsUtils, useTransformControlsStore, type TransformAxis, type TransformMode
} from "../store/transformControlsStore.ts"

export interface UseTransformControlsOptions {
  readonly autoUpdateHandles?: boolean
  readonly enableKeyboardShortcuts?: boolean
  readonly enableSnapping?: boolean
}

type Delta = { x?: number; y?: number; z?: number }
type Axis = "x" | "y" | "z"

export function createTransformControls(options: UseTransformControlsOptions = {}) {
  const { autoUpdateHandles = true, enableKeyboardShortcuts = true, enableSnapping = true } = options
  const store = useTransformControlsStore()
  const selection = useSelectionStore()
  const cad = useCADStore()

  const selectedIds = () => selection.selectedElementIds
  const selectedCount = () => selectedIds().length
  const canTransform = () => selectedCount() > 0 && !store.isTransforming && !cad.explodedView.enabled

  const typing = (event: KeyboardEvent) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLElement && event.target.isContentEditable

  onMount(() => {
    if (autoUpdateHandles && selectedCount() > 0) store.updateHandles()
    if (!enableKeyboardShortcuts) return
    // G / R / S, the axis keys, Enter and Esc are keymap commands (`shared/keybindings`); what stays here is the held
    // modifier: Shift snaps to the grid and Ctrl frees all axes for as long as they are down.
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || typing(event) || event.altKey || cad.explodedView.enabled) return
      if (event.key === "Shift") store.setConstraints({ snapToGrid: true })
      else if (event.key === "Control") store.setActiveAxis("xyz")
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") { if (enableSnapping) store.setConstraints({ snapToGrid: false }) }
      else if (event.key === "Control") store.setActiveAxis("none")
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    onCleanup(() => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up) })
  })

  const setMode = (mode: TransformMode) => { if (!canTransform() && mode !== "none") return; store.setMode(mode) }
  const startTransform = (mode: TransformMode, axis: TransformAxis) => { if (canTransform()) store.startTransform(mode, axis, [...selectedIds()]) }
  const commitTransform = () => { if (store.currentSession) store.commitTransform(store.currentSession.id) }
  const cancelTransform = () => { if (store.currentSession) store.cancelTransform(store.currentSession.id) }

  const normalized = (delta: Delta, fallback: number) => ({ x: delta.x || fallback, y: delta.y || fallback, z: delta.z || fallback })
  const translateSelection = (delta: Delta) => { if (canTransform()) store.transformElements([...selectedIds()], { translate: normalized(delta, 0) }) }
  const rotateSelection = (delta: Delta) => { if (canTransform()) store.transformElements([...selectedIds()], { rotate: normalized(delta, 0) }) }
  const scaleSelection = (delta: Delta) => { if (canTransform()) store.transformElements([...selectedIds()], { scale: normalized(delta, 1) }) }

  const resetToOrigin = () => {
    if (!canTransform()) return
    const bounds = store.getSelectionBounds()
    if (!bounds) return
    translateSelection({ x: -bounds.centerX, y: -bounds.centerY, z: -bounds.centerZ })
  }
  const alignToGrid = () => {
    if (!canTransform() || !enableSnapping) return
    const grid = store.constraints.snapDistance
    for (const id of selectedIds()) {
      const b = store.getElementBounds(id)
      if (!b) continue
      store.translateRealTime([id], {
        x: Math.round(b.centerX / grid) * grid - b.centerX,
        y: Math.round(b.centerY / grid) * grid - b.centerY,
        z: Math.round(b.centerZ / grid) * grid - b.centerZ
      })
    }
  }
  const duplicateInPlace = () => { if (canTransform()) selection.duplicateSelection() }
  const moveToLayer = (layerId: string) => { if (canTransform()) selection.moveSelectionToLayer(layerId) }
  const centerOnOrigin = resetToOrigin

  const distributeEvenly = (axis: Axis) => {
    if (!canTransform() || selectedCount() < 3) return
    if (!store.getSelectionBounds()) return
    const centre = (b: { centerX: number; centerY: number; centerZ: number }) => axis === "x" ? b.centerX : axis === "y" ? b.centerY : b.centerZ
    const items = selectedIds().flatMap((id) => { const bounds = store.getElementBounds(id); return bounds ? [{ id, bounds }] : [] })
      .sort((a, b) => centre(a.bounds) - centre(b.bounds))
    if (items.length < 3) return
    const first = centre(items[0]!.bounds)
    const spacing = (centre(items[items.length - 1]!.bounds) - first) / (items.length - 1)
    items.forEach((item, index) => {
      if (index === 0 || index === items.length - 1) return
      const delta = { x: 0, y: 0, z: 0 }
      delta[axis] = first + spacing * index - centre(item.bounds)
      store.translateRealTime([item.id], delta)
    })
  }

  const onMouseDown = (event: MouseEvent) => {
    if (store.mode === "none" || !canTransform()) return
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    const handle = store.getHandleAtPosition(event.clientX - rect.left, event.clientY - rect.top)
    if (handle) startTransform(handle.type, handle.axis)
  }
  const onMouseMove = (event: MouseEvent) => {
    if (!store.isTransforming || !store.currentSession) return
    store.updateTransform(store.currentSession.id, transformControlsUtils.screenToWorld(event.movementX, event.movementY, null))
  }
  const onMouseUp = () => { if (store.isTransforming && store.currentSession) commitTransform() }

  return {
    get mode() { return store.mode },
    get isTransforming() { return store.isTransforming },
    get selectedCount() { return selectedCount() },
    get canTransform() { return canTransform() },
    setMode, startTransform, commitTransform, cancelTransform,
    translateSelection, rotateSelection, scaleSelection,
    resetToOrigin, alignToGrid, duplicateInPlace, moveToLayer, centerOnOrigin, distributeEvenly,
    onMouseDown, onMouseMove, onMouseUp,
    toggleGizmo: () => store.toggleGizmo(),
    setSnapMode: (mode: "none" | "grid" | "vertex" | "edge" | "center" | "angle") => store.setSnapMode(mode),
    setConstraints: (constraints: Parameters<typeof store.setConstraints>[0]) => store.setConstraints(constraints)
  }
}

export type TransformControlsApi = ReturnType<typeof createTransformControls>
