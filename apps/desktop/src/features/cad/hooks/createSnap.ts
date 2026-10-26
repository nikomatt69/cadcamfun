import { createEffect, createSignal } from "solid-js"
import { defaultSnapSettings, snapPoint, SnapType } from "../lib/enanchedSnapService.ts"
import { useElementsStore } from "../store/elementsStore.ts"

export interface SnapIndicatorState { x: number; y: number; z: number; type: SnapType; visible: boolean }
type SnapSettings = typeof defaultSnapSettings

// Shared on purpose: the canvas and the snap-settings panel must see the same settings and indicator.
const [settings, setSettings] = createSignal<SnapSettings>(defaultSnapSettings)
const [indicator, setIndicator] = createSignal<SnapIndicatorState>({ x: 0, y: 0, z: 0, type: SnapType.NEAREST, visible: false })
const [isSnapping, setIsSnapping] = createSignal(false)

/** Snapping for the canvas: settings, the point snapper and the on-screen indicator. Port of the legacy `useSnap`. */
export function createSnap() {
  const elements = useElementsStore()

  const updateSnapSettings = (update: Partial<SnapSettings>) =>
    setSettings((prev) => ({ ...prev, ...update, types: { ...prev.types, ...(update.types || {}) } }))
  const toggleSnapType = (type: SnapType) =>
    setSettings((prev) => ({ ...prev, types: { ...prev.types, [type]: !prev.types[type] } }))

  /** `anchor` is the point the user draws or moves from; perpendicular, tangent and parallel are relative to it. */
  const snapToPoint = (point: { x: number; y: number; z?: number }, anchor?: { x: number; y: number; z?: number }) => {
    const snapped = snapPoint({ x: point.x, y: point.y, z: point.z || 0 }, elements.elements, settings(), anchor ? { x: anchor.x, y: anchor.y, z: anchor.z || 0 } : undefined)
    // `nearest` is also what an unsnapped point reports; only one that sits on an element counts as a snap.
    if (snapped.type !== SnapType.NEAREST || snapped.source !== undefined) {
      setIndicator({ x: snapped.x, y: snapped.y, z: snapped.z, type: snapped.type, visible: true })
      setIsSnapping(true)
    } else {
      setIndicator((prev) => ({ ...prev, visible: false }))
      setIsSnapping(false)
    }
    return snapped
  }

  createEffect(() => {
    if (!settings().enabled) {
      setIndicator((prev) => ({ ...prev, visible: false }))
      setIsSnapping(false)
    }
  })
  void isSnapping

  return { snapSettings: settings, updateSnapSettings, toggleSnapType, snapToPoint, snapIndicator: indicator, isSnapping }
}
