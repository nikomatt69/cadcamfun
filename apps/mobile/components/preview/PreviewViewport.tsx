import { useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { cadPreview, PreviewView, type PreviewScene } from "@/modules/preview"
import {
  boxEdges,
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

export interface PreviewMesh {
  readonly revision: string
  readonly positions: readonly number[]
  readonly indices: readonly number[]
  readonly normals: readonly number[]
  readonly parts: readonly { readonly id: string; readonly triangleStart: number; readonly triangleCount: number }[]
}

export interface PreviewSegment {
  readonly kind: "rapid" | "linear" | "circular"
  readonly from: readonly [number, number, number]
  readonly to: readonly [number, number, number]
}

const MESH_COLOR: [number, number, number] = [0.72, 0.75, 0.8]
const SELECTED_COLOR: [number, number, number] = [0.95, 0.55, 0.22]
const LINE_COLOR = {
  rapid: [0.38, 0.58, 0.96],
  linear: [0.28, 0.78, 0.46],
  circular: [0.66, 0.46, 0.94],
  stock: [0.48, 0.5, 0.55],
  active: [1, 0.86, 0.32],
} as const

/**
 * Orbitable mesh and toolpath lines. One finger rotates, two fingers zoom and pan.
 * A tap reports the part under the finger. Drawing is the local `preview` Expo module (Metal).
 * Camera, picking and line colours stay here so they can be tested without a device.
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
}: {
  bounds: Bounds
  revision: string
  mesh?: PreviewMesh
  segments?: readonly PreviewSegment[]
  stock?: Bounds
  playhead?: number
  selectedPartId?: string
  onSelectPart?: (id: string | undefined) => void
}) {
  const { palette } = useTheme()
  const [orbit, setOrbit] = useState<Orbit>(() => fitOrbit(bounds))
  const [failed, setFailed] = useState<string | undefined>()
  const [scene, setScene] = useState<PreviewScene | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const frame = useRef({ mesh, orbit, onSelectPart })
  frame.current = { mesh, orbit, onSelectPart }
  const gesture = useRef({ x: 0, y: 0, pinch: 0, two: false, moved: false })

  useEffect(() => {
    setOrbit(fitOrbit(bounds))
  }, [revision, bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]])

  useEffect(() => {
    if (!cadPreview) {
      setFailed("3D preview is part of the CADCAMFUN app")
      return
    }
    setScene(cadPreview.createScene())
  }, [])

  useEffect(() => {
    if (!scene) return
    if (!mesh || mesh.indices.length < 3) {
      scene.setMesh(new Float32Array(), new Float32Array(), new Uint32Array())
      return
    }
    scene.setMesh(Float32Array.from(mesh.positions), Float32Array.from(mesh.normals), Uint32Array.from(mesh.indices))
  }, [scene, mesh])

  useEffect(() => {
    if (!scene) return
    const part = mesh?.parts.find((item) => item.id === selectedPartId && item.triangleCount > 0)
    scene.setHighlight(part?.triangleStart ?? 0, part?.triangleCount ?? 0, MESH_COLOR[0], MESH_COLOR[1], MESH_COLOR[2], SELECTED_COLOR[0], SELECTED_COLOR[1], SELECTED_COLOR[2])
  }, [scene, mesh, selectedPartId])

  useEffect(() => {
    if (!scene) return
    scene.setLines(linePositions(segments ?? [], stock, playhead))
  }, [scene, segments, stock, playhead])

  useEffect(() => {
    if (!scene) return
    const rgb: readonly [number, number, number] = palette.background.startsWith("#") ? hex(palette.background) : [0.08, 0.09, 0.1]
    scene.setCamera(Float32Array.from(mvpOf(orbit, size.width / Math.max(size.height, 1))), rgb[0], rgb[1], rgb[2])
  }, [scene, orbit, size.width, size.height, palette.background])

  const pick = (x: number, y: number) => {
    const current = frame.current
    if (!current.mesh || !current.onSelectPart) return
    const ndc = screenToNdc(x, y, size.width, size.height)
    const ray = rayFromScreen(current.orbit, size.width / Math.max(size.height, 1), ndc.nx, ndc.ny)
    current.onSelectPart(hitMeshPart(ray, current.mesh.positions, current.mesh.indices, current.mesh.parts))
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.background }}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        const touches = event.nativeEvent.touches
        const two = touches.length >= 2
        gesture.current = {
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
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
            setOrbit((current) => orbitPan(orbitZoom(current, previous.pinch / pinch), midX - previous.x, midY - previous.y, size.height))
          }
          gesture.current = { x: midX, y: midY, pinch, two: true, moved: true }
          return
        }
        if (previous.two) return
        const dx = event.nativeEvent.locationX - previous.x
        const dy = event.nativeEvent.locationY - previous.y
        if (Math.hypot(dx, dy) > 2) gesture.current.moved = true
        setOrbit((current) => orbitDrag(current, dx, dy))
        gesture.current.x = event.nativeEvent.locationX
        gesture.current.y = event.nativeEvent.locationY
      }}
      onResponderRelease={(event) => {
        if (!gesture.current.moved && !gesture.current.two) pick(event.nativeEvent.locationX, event.nativeEvent.locationY)
      }}
    >
      {scene ? (
        <PreviewView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          scene={scene}
          onError={(event) => setFailed(event.nativeEvent.message)}
        />
      ) : null}
      <Text style={{ position: "absolute", left: 12, bottom: 8, color: palette.muted, fontSize: 11 }} pointerEvents="none">
        Drag to orbit · pinch to zoom
      </Text>
      {failed ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Text style={{ color: palette.soft, textAlign: "center" }}>{failed}</Text>
        </View>
      ) : null}
    </View>
  )
}

const linePositions = (segments: readonly PreviewSegment[], stock: Bounds | undefined, playhead: number): Float32Array => {
  const stockEdges = stock ? boxEdges(stock) : []
  const data = new Float32Array((segments.length + stockEdges.length) * 12)
  let cursor = 0
  const push = (point: readonly [number, number, number], color: readonly [number, number, number]) => {
    data[cursor++] = point[0]
    data[cursor++] = point[1]
    data[cursor++] = point[2]
    data[cursor++] = color[0]
    data[cursor++] = color[1]
    data[cursor++] = color[2]
  }
  segments.forEach((segment, index) => {
    const color = index === playhead ? LINE_COLOR.active : LINE_COLOR[segment.kind]
    push(segment.from, color)
    push(segment.to, color)
  })
  for (const edge of stockEdges) {
    push(edge.from, LINE_COLOR.stock)
    push(edge.to, LINE_COLOR.stock)
  }
  return data
}

const distance = (a: { locationX: number; locationY: number }, b: { locationX: number; locationY: number }): number =>
  Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY)

const hex = (value: string): [number, number, number] => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
