import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme } from "@/lib/theme"
import { Box, Focus, Grid3x3, Maximize2, Minus, PenLine, Plus, X } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { cadPreview, PreviewView, type PreviewScene } from "@/modules/preview"
import {
  cameraBasis,
  fitOrbit,
  frameOrbit,
  hitMeshPart,
  isDoubleTap,
  mvpOf,
  orbitDrag,
  orbitPan,
  orbitZoom,
  rayFromScreen,
  screenToNdc,
  STANDARD_VIEWS,
  viewOrbit,
  type Bounds,
  type Orbit,
  type StandardView,
} from "@/lib/preview-math"
import {
  MESH_COLOR,
  PREVIEW_MESSAGE,
  REMAINING_PATH_FADE,
  SELECTED_COLOR,
  finiteMatrix,
  guideColor,
  highlightRange,
  meshFeatureEdges,
  prepareOverlayLines,
  progressRange,
  sceneGuides,
  prepareActiveLine,
  prepareMeshUpload,
  prepareToolpathLines,
  rgbFromHex,
  toolMarkerLength,
  type PreviewSegment,
} from "@/lib/preview-scene"
import { formatSize, partBounds } from "@/lib/preview-sim"
import { type } from "@/lib/typography"

export interface PreviewMesh {
  readonly revision: string
  readonly positions: readonly number[]
  readonly indices: readonly number[]
  readonly normals: readonly number[]
  readonly parts: readonly { readonly id: string; readonly triangleStart: number; readonly triangleCount: number }[]
}

const PAYLOAD_MESSAGES = new Set<string>(Object.values(PREVIEW_MESSAGE))

/** A validated GPU payload or the sentence explaining why it was refused. */
type Prepared<T> = { readonly value: T; readonly error?: undefined } | { readonly value?: undefined; readonly error: string }
const prepare = <T,>(build: () => T, fallback: string): Prepared<T> => {
  try { return { value: build() } } catch (error) { return { error: error instanceof Error ? error.message : fallback } }
}

/**
 * Everything derived from the payload, computed once per mesh/path and shared by the inline and the full-screen
 * viewer: validating and packing a large mesh, and finding its crease edges, are the expensive steps.
 */
interface PreparedScene {
  readonly mesh?: Prepared<ReturnType<typeof prepareMeshUpload>>
  readonly lines: Prepared<Float32Array>
  readonly edges: ReturnType<typeof meshFeatureEdges>
}

/** Below this card width the zoom buttons give way: pinch and the accessibility actions still zoom. */
const COMPACT_WIDTH = 340

export interface PreviewViewportProps {
  bounds: Bounds
  revision: string
  mesh?: PreviewMesh
  segments?: readonly PreviewSegment[]
  stock?: Bounds
  playhead?: number
  /** Fade the not-yet-cut path and show the tool at the playhead (toolpath simulation). */
  simulating?: boolean
  selectedPartId?: string
  onSelectPart?: (id: string | undefined) => void
  accessibilityLabel?: string
  accessibilityHint?: string
  /** Title of the full-screen viewer; omit `fullscreenTitle` to hide the expand control. */
  fullscreenTitle?: string
  /** Controls shown under the full-screen viewer, e.g. the simulation bar. */
  fullscreenFooter?: ReactNode
}

/**
 * Orbitable mesh and toolpath lines. One finger rotates, two fingers zoom and pan, a double tap frames
 * the selection (or the whole scene). A tap reports the part under the finger. Drawing is the local
 * `preview` Expo module (Metal). Camera, picking and upload checks stay in `lib/preview-*` so they can
 * be tested without a device.
 */
export function PreviewViewport(props: PreviewViewportProps) {
  const { fullscreenTitle, fullscreenFooter } = props
  const { palette } = useTheme()
  const [fullscreen, setFullscreen] = useState(false)
  // Display toggles are shared by the inline and the full-screen viewer.
  const [showEdges, setShowEdges] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const display = { showEdges, showGrid, onToggleEdges: () => setShowEdges((value) => !value), onToggleGrid: () => setShowGrid((value) => !value) }
  const { mesh, segments, stock } = props
  const meshUpload = useMemo(() => mesh ? prepare(() => prepareMeshUpload(mesh), PREVIEW_MESSAGE.meshInvalid) : undefined, [mesh])
  const lines = useMemo(() => prepare(() => prepareToolpathLines(segments ?? [], stock), PREVIEW_MESSAGE.pathInvalid), [segments, stock])
  const edges = useMemo(() => {
    if (!mesh) return []
    try { return meshFeatureEdges(mesh.positions, mesh.indices) } catch { return [] }
  }, [mesh])
  const prepared = useMemo<PreparedScene>(() => ({ ...(meshUpload ? { mesh: meshUpload } : {}), lines, edges }), [meshUpload, lines, edges])

  return <>
    {/* Covered by the full-screen viewer, the inline one stops following the playhead and the camera: no hidden redraws. */}
    <Viewport {...props} {...display} prepared={prepared} active={!fullscreen} onExpand={fullscreenTitle !== undefined ? () => setFullscreen(true) : undefined} />
    {fullscreenTitle !== undefined ? <Modal visible={fullscreen} animationType="slide" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]}
      onRequestClose={() => setFullscreen(false)}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 20, paddingRight: 8, minHeight: layout.touchTarget + 8 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: palette.ink, fontSize: 17, fontWeight: "600" }}>{fullscreenTitle}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen viewer" onPress={() => { haptic("selection"); setFullscreen(false) }}
            style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
            <X size={22} color={palette.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>{fullscreen ? <Viewport {...props} {...display} prepared={prepared} /> : null}</View>
        {fullscreenFooter ? <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, borderTopWidth: 0.5, borderTopColor: palette.border }}>{fullscreenFooter}</View> : null}
      </SafeAreaView>
    </Modal> : null}
  </>
}

function Viewport({
  bounds,
  revision,
  mesh,
  segments,
  playhead = 0,
  simulating = false,
  selectedPartId,
  onSelectPart,
  accessibilityLabel = "3D preview",
  accessibilityHint = "Drag to orbit. Pinch to zoom. Double tap to frame.",
  showEdges,
  showGrid,
  onToggleEdges,
  onToggleGrid,
  onExpand,
  active = true,
  prepared,
}: PreviewViewportProps & {
  prepared: PreparedScene
  /** False while another viewer covers this one: per-frame updates (playhead, camera) wait until it is visible again. */
  active?: boolean
  showEdges: boolean
  showGrid: boolean
  onToggleEdges: () => void
  onToggleGrid: () => void
  onExpand?: () => void
}) {
  const { palette, glass, isDark } = useTheme()
  const [orbit, setOrbit] = useState<Orbit>(() => fitOrbit(bounds))
  const [view, setView] = useState<StandardView | undefined>("iso")
  const [meshError, setMeshError] = useState<string | undefined>()
  const [lineError, setLineError] = useState<string | undefined>()
  const [gpuError, setGpuError] = useState<string | undefined>()
  const [scene, setScene] = useState<PreviewScene | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const frame = useRef({ mesh, orbit, onSelectPart })
  frame.current = { mesh, orbit, onSelectPart }
  const gesture = useRef({ x: 0, y: 0, startX: 0, startY: 0, pinch: 0, two: false, moved: false })
  const lastTap = useRef<{ x: number; y: number; at: number } | undefined>(undefined)
  const linesOk = useRef(true)
  const failed = meshError ?? lineError ?? gpuError
  const compact = size.width < COMPACT_WIDTH
  const aspect = size.width / Math.max(size.height, 1)
  // True while the camera is at a fitted view: a resize or rotation re-fits it. Any orbit, zoom or pan clears it.
  const autoFit = useRef(true)
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    autoFit.current = true
    setOrbit(fitOrbit(bounds, aspect))
    setView("iso")
  }, [revision, bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]])

  useEffect(() => {
    if (autoFit.current) setOrbit(viewOrbit(bounds, viewRef.current ?? "iso", aspect))
  }, [aspect])

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
    const upload = prepared.mesh
    if (upload?.value) {
      scene.setMesh(upload.value.positions, upload.value.normals, upload.value.indices)
      setMeshError(undefined)
      setGpuError((current) => (current && PAYLOAD_MESSAGES.has(current) ? undefined : current))
      return
    }
    scene.setMesh(new Float32Array(), new Float32Array(), new Uint32Array())
    setMeshError(upload?.error)
  }, [scene, prepared.mesh])

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
    const lines = prepared.lines
    if (lines.value) {
      scene.setLines(lines.value)
      linesOk.current = true
      setLineError(undefined)
      setGpuError((current) => (current && PAYLOAD_MESSAGES.has(current) ? undefined : current))
      return
    }
    linesOk.current = false
    scene.setLines(new Float32Array())
    scene.setActiveLine(new Float32Array())
    setLineError(lines.error)
  }, [scene, prepared.lines])

  // Crease outline is a pure function of the mesh: computed once per mesh by the owner, not per viewer or frame.
  const edges = prepared.edges
  const boundsKey = `${bounds.min.join(",")}|${bounds.max.join(",")}`
  const guides = useMemo(() => sceneGuides(bounds, guideColor(palette.background, palette.ink)), [boundsKey, palette.background, palette.ink])

  useEffect(() => {
    if (!scene) return
    scene.setOverlay(prepareOverlayLines(showGrid ? guides : [], showEdges ? edges : []))
  }, [scene, guides, edges, showGrid, showEdges])

  const segmentCount = segments?.length ?? 0
  useEffect(() => {
    if (!scene || !active) return
    const range = progressRange(playhead, segmentCount, simulating)
    scene.setProgress(simulating ? range.travelled : -1, range.path, REMAINING_PATH_FADE)
  }, [scene, active, playhead, segmentCount, simulating])

  const toolLength = useMemo(() => toolMarkerLength(bounds), [boundsKey])
  useEffect(() => {
    if (!scene || !active || !linesOk.current) return
    const segment = segments?.[playhead]
    try {
      scene.setActiveLine(prepareActiveLine(segment, simulating ? toolLength : 0, rgbFromHex(palette.ink)))
    } catch {
      scene.setActiveLine(new Float32Array())
    }
  }, [scene, active, segments, playhead, simulating, toolLength, palette.ink])

  useEffect(() => {
    if (!scene || !active) return
    const mvp = mvpOf(orbit, size.width / Math.max(size.height, 1))
    if (!finiteMatrix(mvp)) return
    const rgb = palette.background.startsWith("#") ? rgbFromHex(palette.background) : rgbFromHex("")
    const { eye } = cameraBasis(orbit)
    scene.setCamera(Float32Array.from(mvp), rgb[0], rgb[1], rgb[2], eye[0], eye[1], eye[2])
  }, [scene, active, orbit, size.width, size.height, palette.background])

  const selectedBounds = useMemo(() => {
    const part = mesh?.parts.find((item) => item.id === selectedPartId)
    return mesh && part ? partBounds(mesh.positions, mesh.indices, part) : undefined
  }, [mesh, selectedPartId])

  const pick = (x: number, y: number) => {
    const current = frame.current
    if (!current.mesh || !current.onSelectPart) return
    const ndc = screenToNdc(x, y, size.width, size.height)
    const ray = rayFromScreen(current.orbit, size.width / Math.max(size.height, 1), ndc.nx, ndc.ny)
    current.onSelectPart(hitMeshPart(ray, current.mesh.positions, current.mesh.indices, current.mesh.parts))
  }

  const showView = (next: StandardView) => {
    autoFit.current = true
    setOrbit(viewOrbit(bounds, next, aspect))
    setView(next)
  }
  const nextView = STANDARD_VIEWS[(STANDARD_VIEWS.findIndex((item) => item.id === view) + 1) % STANDARD_VIEWS.length]!
  const viewLabel = STANDARD_VIEWS.find((item) => item.id === view)?.label

  /** Frame the selected part when there is one, the whole scene otherwise; the viewing direction stays. */
  const frameSelection = () => {
    autoFit.current = false
    setOrbit((current) => frameOrbit(current, selectedBounds ?? bounds, aspect))
  }

  const cameraAction = (action: string) => {
    if (failed) return
    const manual = (change: (current: Orbit) => Orbit, keepView = true) => {
      autoFit.current = false
      setOrbit(change)
      if (!keepView) setView(undefined)
    }
    if (action === "reset") showView("iso")
    else if (action === "view") showView(nextView.id)
    else if (action.startsWith("view:")) showView(action.slice(5) as StandardView)
    else if (action === "frame") frameSelection()
    else if (action === "increment") manual((current) => orbitZoom(current, 0.8))
    else if (action === "decrement") manual((current) => orbitZoom(current, 1.25))
    else if (action === "rotateLeft") manual((current) => orbitDrag(current, -40, 0), false)
    else if (action === "rotateRight") manual((current) => orbitDrag(current, 40, 0), false)
    else return
    haptic("selection")
  }

  const frameLabel = selectedBounds ? "Frame selection" : "Fit all"
  const tools: ReadonlyArray<{ action: string; label: string; Icon: typeof Box; hidden?: boolean }> = [
    { action: "view", label: `Show ${nextView.label.toLowerCase()} view`, Icon: Box },
    { action: "frame", label: frameLabel, Icon: Focus },
    { action: "decrement", label: "Zoom out", Icon: Minus, hidden: compact },
    { action: "increment", label: "Zoom in", Icon: Plus, hidden: compact },
  ]
  const toggles = [
    ...(mesh ? [{ id: "edges", label: "Edges", Icon: PenLine, on: showEdges, toggle: onToggleEdges }] : []),
    { id: "grid", label: "Grid", Icon: Grid3x3, on: showGrid, toggle: onToggleGrid },
  ]
  const sizeLabel = formatSize(selectedBounds ?? bounds)

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
    <View
      accessible
      accessibilityRole={failed ? "image" : "adjustable"}
      accessibilityActions={failed ? [] : [
        { name: "increment", label: "Zoom in" }, { name: "decrement", label: "Zoom out" },
        { name: "rotateLeft", label: "Rotate left" }, { name: "rotateRight", label: "Rotate right" },
        { name: "reset", label: "Reset camera" }, { name: "frame", label: frameLabel },
        ...STANDARD_VIEWS.map((item) => ({ name: `view:${item.id}`, label: `${item.label} view` })),
      ]}
      onAccessibilityAction={(event) => cameraAction(event.nativeEvent.actionName)}
      style={StyleSheet.absoluteFill}
      accessibilityLabel={failed ? `${accessibilityLabel}. ${failed}` : `${accessibilityLabel}. ${selectedBounds ? "Selection" : "Size"} ${sizeLabel}`}
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
            autoFit.current = false
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
        if (dx !== 0 || dy !== 0) autoFit.current = false
        setOrbit((current) => orbitDrag(current, dx, dy))
        if (dx !== 0 || dy !== 0) setView(undefined)
        gesture.current.x = event.nativeEvent.locationX
        gesture.current.y = event.nativeEvent.locationY
      }}
      onResponderRelease={(event) => {
        if (gesture.current.moved || gesture.current.two) return
        const tap = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, at: Date.now() }
        if (isDoubleTap(lastTap.current, tap)) {
          lastTap.current = undefined
          cameraAction("frame")
          return
        }
        lastTap.current = tap
        pick(tap.x, tap.y)
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
      {!failed ? <View pointerEvents="none" accessibilityElementsHidden style={{ position: "absolute", left: 12, right: 12, bottom: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <Text numberOfLines={2} style={{ flex: 1, color: palette.muted, ...type(11) }}>
          {viewLabel ? `${viewLabel} · ` : ""}Drag to orbit · pinch to zoom · double tap to frame
        </Text>
        <Text numberOfLines={1} style={{ color: selectedBounds ? palette.accent : palette.soft, fontVariant: ["tabular-nums"], ...type(11), fontWeight: "600" }}>
          {sizeLabel}
        </Text>
      </View> : null}
      {failed ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Text accessibilityLiveRegion="polite" style={{ color: palette.soft, textAlign: "center" }}>
            {failed}
          </Text>
        </View>
      ) : null}
    </View>
    {!failed ? <>
      <AdaptiveBlur tint={isDark ? "dark" : "light"} fallbackColor={glass.shellStrong} opaqueFallbackColor={palette.surface}
        style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden" }}>
        {toggles.map(({ id, label, Icon, on, toggle }) => <Pressable key={id} accessibilityRole="switch" accessibilityLabel={`Show ${label.toLowerCase()}`} accessibilityState={{ checked: on }}
          onPress={() => { haptic("selection"); toggle() }} style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : on ? 1 : 0.45 })}>
          <Icon size={18} color={on ? palette.accent : palette.ink} />
        </Pressable>)}
      </AdaptiveBlur>
      <AdaptiveBlur tint={isDark ? "dark" : "light"} fallbackColor={glass.shellStrong} opaqueFallbackColor={palette.surface}
        style={{ position: "absolute", top: 10, right: 10, flexDirection: "row", borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden" }}>
        {[...tools.filter((tool) => !tool.hidden), ...(onExpand ? [{ action: "expand", label: "Open full-screen viewer", Icon: Maximize2 }] : [])].map(({ action, label, Icon }) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={label}
          onPress={() => { if (action === "expand") { haptic("selection"); onExpand?.() } else cameraAction(action) }} style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
          <Icon size={18} color={palette.ink} />
        </Pressable>)}
      </AdaptiveBlur>
    </> : null}
    </View>
  )
}

const distance = (a: { locationX: number; locationY: number }, b: { locationX: number; locationY: number }): number =>
  Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY)
