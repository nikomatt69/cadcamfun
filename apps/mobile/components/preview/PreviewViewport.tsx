import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { Minus, Plus, RotateCcw } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { cadPreview, PreviewView, type PreviewScene } from "@/modules/preview"
import {
  fitOrbit,
  hitMeshPart,
  mvpOf,
  orbitDrag,
  orbitPan,
  orbitZoom,
  rayFromScreen,
  screenToNdc,
  type Bounds,
  type Orbit,
} from "@/lib/preview-math"
import {
  MESH_COLOR,
  PREVIEW_MESSAGE,
  SELECTED_COLOR,
  finiteMatrix,
  highlightRange,
  prepareActiveLine,
  prepareMeshUpload,
  prepareToolpathLines,
  rgbFromHex,
  type PreviewSegment,
} from "@/lib/preview-scene"
import { type } from "@/lib/typography"

export interface PreviewMesh {
  readonly revision: string
  readonly positions: readonly number[]
  readonly indices: readonly number[]
  readonly normals: readonly number[]
  readonly parts: readonly { readonly id: string; readonly triangleStart: number; readonly triangleCount: number }[]
}

const PAYLOAD_MESSAGES = new Set<string>(Object.values(PREVIEW_MESSAGE))

/**
 * Orbitable mesh and toolpath lines. One finger rotates, two fingers zoom and pan.
 * A tap reports the part under the finger. Drawing is the local `preview` Expo module (Metal).
 * Camera, picking and upload checks stay here so they can be tested without a device.
 */
export function PreviewViewport({
  bounds,
  revision,
  mesh,
  segments,
  stock,
  playhead = 0,
  selectedPartId,
  onSelectPart,
  accessibilityLabel = "3D preview",
  accessibilityHint = "Drag to orbit. Pinch to zoom.",
}: {
  bounds: Bounds
  revision: string
  mesh?: PreviewMesh
  segments?: readonly PreviewSegment[]
  stock?: Bounds
  playhead?: number
  selectedPartId?: string
  onSelectPart?: (id: string | undefined) => void
  accessibilityLabel?: string
  accessibilityHint?: string
}) {
  const { palette, glass, isDark } = useTheme()
  const [orbit, setOrbit] = useState<Orbit>(() => fitOrbit(bounds))
  const [meshError, setMeshError] = useState<string | undefined>()
  const [lineError, setLineError] = useState<string | undefined>()
  const [gpuError, setGpuError] = useState<string | undefined>()
  const [scene, setScene] = useState<PreviewScene | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const frame = useRef({ mesh, orbit, onSelectPart })
  frame.current = { mesh, orbit, onSelectPart }
  const gesture = useRef({ x: 0, y: 0, startX: 0, startY: 0, pinch: 0, two: false, moved: false })
  const linesOk = useRef(true)
  const failed = meshError ?? lineError ?? gpuError

  useEffect(() => {
    setOrbit(fitOrbit(bounds))
  }, [revision, bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]])

  useEffect(() => {
    if (!cadPreview) {
      setGpuError("3D preview is part of the CADCAMFUN app")
      return
    }
    let next: PreviewScene
    try {
      next = cadPreview.createScene()
    } catch (error) {
      setGpuError(error instanceof Error ? error.message : "The preview could not be displayed")
      return
    }
    setScene(next)
    return () => {
      next.release()
    }
  }, [])

  useEffect(() => {
    if (!scene) return
    if (!mesh) {
      scene.setMesh(new Float32Array(), new Float32Array(), new Uint32Array())
      setMeshError(undefined)
      return
    }
    try {
      const upload = prepareMeshUpload(mesh)
      scene.setMesh(upload.positions, upload.normals, upload.indices)
      setMeshError(undefined)
      setGpuError((current) => (current && PAYLOAD_MESSAGES.has(current) ? undefined : current))
    } catch (error) {
      scene.setMesh(new Float32Array(), new Float32Array(), new Uint32Array())
      setMeshError(error instanceof Error ? error.message : PREVIEW_MESSAGE.meshInvalid)
    }
  }, [scene, mesh])

  useEffect(() => {
    if (!scene) return
    const triangles = mesh ? Math.floor(mesh.indices.length / 3) : 0
    const part = mesh?.parts.find((item) => item.id === selectedPartId && item.triangleCount > 0)
    const range = highlightRange(triangles, part?.triangleStart ?? 0, part?.triangleCount ?? 0)
    scene.setHighlight(
      range.start,
      range.count,
      MESH_COLOR[0],
      MESH_COLOR[1],
      MESH_COLOR[2],
      SELECTED_COLOR[0],
      SELECTED_COLOR[1],
      SELECTED_COLOR[2],
    )
  }, [scene, mesh, selectedPartId])

  useEffect(() => {
    if (!scene) return
    try {
      scene.setLines(prepareToolpathLines(segments ?? [], stock))
      linesOk.current = true
      setLineError(undefined)
      setGpuError((current) => (current && PAYLOAD_MESSAGES.has(current) ? undefined : current))
    } catch (error) {
      linesOk.current = false
      scene.setLines(new Float32Array())
      scene.setActiveLine(new Float32Array())
      setLineError(error instanceof Error ? error.message : PREVIEW_MESSAGE.pathInvalid)
    }
  }, [scene, segments, stock])

  useEffect(() => {
    if (!scene || !linesOk.current) return
    const segment = segments?.[playhead]
    try {
      scene.setActiveLine(prepareActiveLine(segment))
    } catch {
      scene.setActiveLine(new Float32Array())
    }
  }, [scene, segments, playhead])

  useEffect(() => {
    if (!scene) return
    const mvp = mvpOf(orbit, size.width / Math.max(size.height, 1))
    if (!finiteMatrix(mvp)) return
    const rgb = palette.background.startsWith("#") ? rgbFromHex(palette.background) : rgbFromHex("")
    scene.setCamera(Float32Array.from(mvp), rgb[0], rgb[1], rgb[2])
  }, [scene, orbit, size.width, size.height, palette.background])

  const pick = (x: number, y: number) => {
    const current = frame.current
    if (!current.mesh || !current.onSelectPart) return
    const ndc = screenToNdc(x, y, size.width, size.height)
    const ray = rayFromScreen(current.orbit, size.width / Math.max(size.height, 1), ndc.nx, ndc.ny)
    current.onSelectPart(hitMeshPart(ray, current.mesh.positions, current.mesh.indices, current.mesh.parts))
  }

  const cameraAction = (action: string) => {
    if (failed) return
    if (action === "reset") setOrbit(fitOrbit(bounds))
    else if (action === "increment") setOrbit((current) => orbitZoom(current, 0.8))
    else if (action === "decrement") setOrbit((current) => orbitZoom(current, 1.25))
    else if (action === "rotateLeft") setOrbit((current) => orbitDrag(current, -40, 0))
    else if (action === "rotateRight") setOrbit((current) => orbitDrag(current, 40, 0))
    else return
    haptic("selection")
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
    <View
      accessible
      accessibilityRole={failed ? "image" : "adjustable"}
      accessibilityActions={failed ? [] : [
        { name: "increment", label: "Zoom in" }, { name: "decrement", label: "Zoom out" },
        { name: "rotateLeft", label: "Rotate left" }, { name: "rotateRight", label: "Rotate right" },
        { name: "reset", label: "Reset camera" },
      ]}
      onAccessibilityAction={(event) => cameraAction(event.nativeEvent.actionName)}
      style={StyleSheet.absoluteFill}
      accessibilityLabel={failed ? `${accessibilityLabel}. ${failed}` : accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityLiveRegion="polite"
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      onStartShouldSetResponder={() => !failed}
      onMoveShouldSetResponder={() => !failed}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        const touches = event.nativeEvent.touches
        const two = touches.length >= 2
        gesture.current = {
          x: two ? (touches[0]!.locationX + touches[1]!.locationX) / 2 : event.nativeEvent.locationX,
          y: two ? (touches[0]!.locationY + touches[1]!.locationY) / 2 : event.nativeEvent.locationY,
          startX: event.nativeEvent.locationX,
          startY: event.nativeEvent.locationY,
          pinch: two ? distance(touches[0]!, touches[1]!) : 0,
          two,
          moved: false,
        }
      }}
      onResponderMove={(event) => {
        const touches = event.nativeEvent.touches
        const previous = gesture.current
        if (touches.length >= 2) {
          const pinch = distance(touches[0]!, touches[1]!)
          const midX = (touches[0]!.locationX + touches[1]!.locationX) / 2
          const midY = (touches[0]!.locationY + touches[1]!.locationY) / 2
          if (previous.two && previous.pinch > 0) {
            setOrbit((current) => orbitPan(orbitZoom(current, previous.pinch / Math.max(pinch, 1)), midX - previous.x, midY - previous.y, size.height))
          }
          gesture.current = { ...previous, x: midX, y: midY, pinch, two: true, moved: true }
          return
        }
        if (previous.two) {
          gesture.current = { ...previous, x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, two: false, moved: true }
          return
        }
        const dx = event.nativeEvent.locationX - previous.x
        const dy = event.nativeEvent.locationY - previous.y
        if (Math.hypot(event.nativeEvent.locationX - previous.startX, event.nativeEvent.locationY - previous.startY) > 6) gesture.current.moved = true
        setOrbit((current) => orbitDrag(current, dx, dy))
        gesture.current.x = event.nativeEvent.locationX
        gesture.current.y = event.nativeEvent.locationY
      }}
      onResponderRelease={(event) => {
        if (!gesture.current.moved && !gesture.current.two) pick(event.nativeEvent.locationX, event.nativeEvent.locationY)
      }}
      onResponderTerminate={() => {
        gesture.current.moved = true
      }}
    >
      {scene ? (
        <PreviewView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          scene={scene}
          onError={(event) => setGpuError(event.nativeEvent.message)}
        />
      ) : null}
      <Text accessibilityElementsHidden numberOfLines={1} style={{ position: "absolute", left: 12, right: 12, bottom: 10, color: palette.muted, ...type(11) }} pointerEvents="none">
        Drag to orbit · pinch to zoom
      </Text>
      {failed ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Text accessibilityLiveRegion="polite" style={{ color: palette.soft, textAlign: "center" }}>
            {failed}
          </Text>
        </View>
      ) : null}
    </View>
    {!failed ? <AdaptiveBlur tint={isDark ? "dark" : "light"} fallbackColor={glass.shellStrong} opaqueFallbackColor={palette.surface}
      style={{ position: "absolute", top: 10, right: 10, flexDirection: "row", borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden" }}>
      {[
        { action: "reset", label: "Reset camera", Icon: RotateCcw },
        { action: "decrement", label: "Zoom out", Icon: Minus },
        { action: "increment", label: "Zoom in", Icon: Plus },
      ].map(({ action, label, Icon }) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={label}
        onPress={() => cameraAction(action)} style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
        <Icon size={18} color={palette.ink} />
      </Pressable>)}
    </AdaptiveBlur> : null}
    </View>
  )
}

const distance = (a: { locationX: number; locationY: number }, b: { locationX: number; locationY: number }): number =>
  Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY)
