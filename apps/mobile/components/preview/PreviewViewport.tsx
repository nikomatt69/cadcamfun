import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { PreviewMachine, PreviewOperation } from "@cadcamfun/api"
import { hexToRgba, useTheme } from "@/lib/theme"
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
  operationColor,
  prepareOverlayLines,
  progressRange,
  sceneGuides,
  prepareActiveLine,
  prepareMeshUpload,
  prepareToolpathLines,
  rgbFromHex,
  toolMarkerLength,
  type PathStyle,
  type PreviewSegment,
} from "@/lib/preview-scene"
import { formatSize, partBounds, spinRateAt } from "@/lib/preview-sim"
import { TOOL_GLYPH_COLOR, prepareCutterSolid, prepareMachineSolids, toolGlyphLines, type MachineSolids, type SolidUpload } from "@/lib/machine-bodies"
import { type } from "@/lib/typography"

export interface PreviewMesh {
  readonly revision?: string
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
 * viewer: validating and packing a large mesh, finding its crease edges, and tessellating the machine, are the
 * expensive steps.
 */
interface PreparedScene {
  readonly mesh?: Prepared<ReturnType<typeof prepareMeshUpload>>
  readonly lines: Prepared<Float32Array>
  readonly edges: ReturnType<typeof meshFeatureEdges>
  readonly solids: Prepared<MachineSolids>
  /** How many segments the phone shows before each segment of the path (`shown[total]` is the whole path). */
  readonly shown: Int32Array
}

/** Below this card width the zoom buttons give way: pinch and the accessibility actions still zoom. */
const COMPACT_WIDTH = 340

export interface PreviewViewportProps {
  bounds: Bounds
  revision: string
  mesh?: PreviewMesh
  segments?: readonly PreviewSegment[]
  stock?: Bounds
  /** The machine around the program (spec 31 §5): bodies, tool glyph, spin and collisions; without it the preview stays bare. */
  machine?: PreviewMachine
  /** The program's operations (preview format 4): each owns a run of the path's segments. */
  operations?: readonly PreviewOperation[]
  /** The operations the user put away; their segments are left out of the path. */
  hiddenOperations?: ReadonlySet<number>
  /** Colour the path by move class (the default) or by operation, like the desktop. */
  colorMode?: "move" | "operation"
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
  const { mesh, segments, stock, machine, operations, hiddenOperations, colorMode } = props
  const meshUpload = useMemo(() => mesh ? prepare(() => prepareMeshUpload(mesh), PREVIEW_MESSAGE.meshInvalid) : undefined, [mesh])
  const machineUpload = useMemo(() => prepare(() => prepareMachineSolids(machine), PREVIEW_MESSAGE.machineTooLarge), [machine])
  // A machine scene carries its own bodies: the generic stock box would double the outline they already give.
  const collisions = useMemo(() => new Set(machine?.collisions ?? []), [machine])
  /** Which operation owns each segment; -1 when the payload names none. */
  const operationOfSegment = useMemo(() => {
    const map = new Int32Array(segments?.length ?? 0).fill(-1)
    for (const operation of operations ?? []) {
      for (let index = operation.startSegment; index <= operation.endSegment && index < map.length; index++) map[index] = operation.index
    }
    return map
  }, [operations, segments?.length])
  const style = useMemo<PathStyle>(() => {
    const hidden = hiddenOperations
    const byOperation = colorMode === "operation"
    return {
      colorOf: (index) => {
        const operation = operationOfSegment[index] ?? -1
        return operation >= 0 && byOperation ? operationColor(operation) : undefined
      },
      hidden: hidden !== undefined && hidden.size > 0
        ? (index) => {
          const operation = operationOfSegment[index] ?? -1
          return operation >= 0 && hidden.has(operation)
        }
        : undefined,
    }
  }, [operationOfSegment, colorMode, hiddenOperations])
  const lines = useMemo(() => prepare(() => prepareToolpathLines(segments ?? [], machine ? undefined : stock, collisions, style), PREVIEW_MESSAGE.pathInvalid), [segments, stock, machine, collisions, style])
  /**
   * How many segments the phone shows before each segment of the path.
   *
   * The playback asks for this on every tick, so it is counted once: `shown[i]` is the number of visible segments
   * before the segment `i`. The playhead's answer is then a lookup, not a walk over the program.
   */
  const shown = useMemo(() => {
    const total = segments?.length ?? 0
    const counts = new Int32Array(total + 1)
    for (let index = 0; index < total; index++) {
      counts[index + 1] = counts[index]! + (style.hidden?.(index) === true ? 0 : 1)
    }
    return counts
  }, [segments?.length, style])
  const edges = useMemo(() => {
    if (!mesh) return []
    try { return meshFeatureEdges(mesh.positions, mesh.indices) } catch { return [] }
  }, [mesh])
  const prepared = useMemo<PreparedScene>(() => ({ ...(meshUpload ? { mesh: meshUpload } : {}), lines, edges, solids: machineUpload, shown }), [meshUpload, lines, edges, machineUpload, shown])

  return <>
    {/* Covered by the full-screen viewer, the inline one stops following the playhead and the camera: no hidden redraws. */}
    <Viewport {...props} {...display} prepared={prepared} active={!fullscreen} onExpand={fullscreenTitle !== undefined ? () => setFullscreen(true) : undefined} />
    {fullscreenTitle !== undefined ? <Modal visible={fullscreen} animationType="slide" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]}
      onRequestClose={() => setFullscreen(false)}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: layout.gutter, paddingRight: 8, minHeight: layout.touchTarget + 8 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, minWidth: 0, color: palette.ink, ...type(17, { weight: "600" }) }}>{fullscreenTitle}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen viewer" onPress={() => { haptic("selection"); setFullscreen(false) }}
            style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
            <X size={22} color={palette.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>{fullscreen ? <Viewport {...props} {...display} prepared={prepared} /> : null}</View>
        {fullscreenFooter ? <View style={{ paddingHorizontal: layout.gutter, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>{fullscreenFooter}</View> : null}
      </SafeAreaView>
    </Modal> : null}
  </>
}

function Viewport({
  bounds,
  revision,
  mesh,
  segments,
  machine,
  operations,
  hiddenOperations,
  colorMode,
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
  const [machineError, setMachineError] = useState<string | undefined>()
  const [gpuError, setGpuError] = useState<string | undefined>()
  const [scene, setScene] = useState<PreviewScene | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const frame = useRef({ mesh, orbit, onSelectPart })
  frame.current = { mesh, orbit, onSelectPart }
  const gesture = useRef({ x: 0, y: 0, startX: 0, startY: 0, pinch: 0, two: false, moved: false })
  const lastTap = useRef<{ x: number; y: number; at: number } | undefined>(undefined)
  const linesOk = useRef(true)
  const failed = meshError ?? lineError ?? machineError ?? gpuError
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

  // The machine bodies are one upload each; scrubbing and the camera never touch them again.
  useEffect(() => {
    if (!scene) return
    const solids = prepared.solids
    if (solids.value) {
      scene.setSolids(solids.value.solids.vertices, solids.value.solids.indices, solids.value.solids.opaqueTriangles)
      scene.setSpindle(solids.value.spindle.vertices, solids.value.spindle.indices, solids.value.spindle.opaqueTriangles)
      setMachineError(undefined)
      return
    }
    scene.setSolids(new Float32Array(), new Uint32Array(), 0)
    scene.setSpindle(new Float32Array(), new Uint32Array(), 0)
    setMachineError(solids.error)
  }, [scene, prepared.solids])

  // Crease outline is a pure function of the mesh: computed once per mesh by the owner, not per viewer or frame.
  const edges = prepared.edges
  const boundsKey = `${bounds.min.join(",")}|${bounds.max.join(",")}`
  const guides = useMemo(() => sceneGuides(bounds, guideColor(palette.background, palette.ink)), [boundsKey, palette.background, palette.ink])

  useEffect(() => {
    if (!scene) return
    // The machine's wire bodies (mill stock outline, printer build volume) are the machine itself: the edge toggle
    // hides the CAD outline, never them.
    const wire = prepared.solids.value?.wire ?? []
    scene.setOverlay(prepareOverlayLines(showGrid ? guides : [], [...wire, ...(showEdges ? edges : [])]))
  }, [scene, guides, edges, showGrid, showEdges, prepared.solids])

  /** The segments the phone shows, and how many of them the playhead has passed. */
  const counts = useMemo(() => {
    const shown = prepared.shown
    const total = segments?.length ?? 0
    const visible = shown[total] ?? 0
    const travelled = shown[Math.min(total, Math.max(0, playhead + 1))] ?? 0
    return { visible, travelled }
  }, [prepared.shown, segments?.length, playhead])

  useEffect(() => {
    if (!scene || !active) return
    const range = progressRange(playhead, counts.visible, simulating, counts.travelled)
    scene.setProgress(simulating ? range.travelled : -1, range.path, REMAINING_PATH_FADE)
  }, [scene, active, playhead, counts, simulating])

  // What turns with the spindle: the native view accumulates the angle while the rate is not zero.
  // A covered viewer stops its spindle so the display link does not redraw a scene nobody sees.
  useEffect(() => {
    if (!scene) return
    scene.setSpin(active ? spinRateAt(machine?.spin ?? [], playhead, simulating) : 0)
  }, [scene, active, machine, playhead, simulating])

  const toolLength = useMemo(() => toolMarkerLength(bounds), [boundsKey])
  /** The real cutter of the operation at the playhead: the tool the program runs. */
  const cutter = useMemo(() => {
    const operation = (operations ?? []).find((item) => playhead >= item.startSegment && playhead <= item.endSegment)
    return operation?.cutter
  }, [operations, playhead])
  /** The cutter as a solid, standing on the tip of the current move. */
  const toolSolid = useMemo<SolidUpload>(() => {
    const segment = segments?.[playhead]
    if (!simulating || !cutter || !segment) return { vertices: new Float32Array(), indices: new Uint32Array(), opaqueTriangles: 0 }
    try {
      return prepareCutterSolid(cutter, [segment.to[0], segment.to[1], segment.to[2]])
    } catch {
      return { vertices: new Float32Array(), indices: new Uint32Array(), opaqueTriangles: 0 }
    }
  }, [cutter, segments, playhead, simulating])

  useEffect(() => {
    if (!scene || !active || !linesOk.current) return
    const segment = segments?.[playhead]
    const family = machine?.tool.family
    try {
      // A lathe or printer machine draws its own tool (the insert, the nozzle) instead of the mill marker.
      const machineGlyph = simulating && segment && machine && family !== undefined && family !== "mill"
        ? toolGlyphLines([segment.to[0], segment.to[1], segment.to[2]], machine.tool, toolLength, TOOL_GLYPH_COLOR[family])
        : []
      // The real cutter is a solid; the wireframe marker is the fallback for a server that names no tool.
      const marker = simulating && (family === undefined || family === "mill") && cutter === undefined ? toolLength : 0
      scene.setActiveLine(prepareActiveLine(segment, marker, rgbFromHex(palette.ink), machineGlyph))
    } catch {
      scene.setActiveLine(new Float32Array())
    }
    scene.setTool(toolSolid.vertices, toolSolid.indices, toolSolid.opaqueTriangles)
  }, [scene, active, segments, playhead, simulating, toolLength, palette.ink, machine, cutter, toolSolid])

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
      {!failed ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: 10, right: 10, bottom: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {/* A scrim behind each readout: the scene under it can be any colour, light or dark. */}
        <View style={{ flexShrink: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderCurve: "continuous", backgroundColor: hexToRgba(palette.background, 0.78) }}>
          <Text numberOfLines={2} style={{ color: palette.soft, ...type(11) }}>
            {viewLabel ? `${viewLabel} · ` : ""}Drag to orbit · pinch to zoom · double tap to frame
          </Text>
        </View>
        <View style={{ flexGrow: 1 }} />
        <View style={{ flexShrink: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderCurve: "continuous", backgroundColor: hexToRgba(palette.background, 0.78) }}>
          <Text numberOfLines={1} style={{ color: selectedBounds ? palette.accentStrong : palette.soft, fontVariant: ["tabular-nums"], ...type(11, { weight: "600" }) }}>
            {sizeLabel}
          </Text>
        </View>
      </View> : null}
      {failed ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Text accessibilityLiveRegion="polite" style={{ color: palette.soft, textAlign: "center", ...type(14) }}>
            {failed}
          </Text>
        </View>
      ) : null}
    </View>
    {!failed ? <>
      <AdaptiveBlur tint={isDark ? "dark" : "light"} fallbackColor={glass.shellStrong} opaqueFallbackColor={palette.surface}
        style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden" }}>
        {toggles.map(({ id, label, Icon, on, toggle }) => <Pressable key={id} accessibilityRole="switch" accessibilityLabel={`Show ${label.toLowerCase()}`} accessibilityState={{ checked: on }}
          onPress={() => { haptic("selection"); toggle() }} style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
          <Icon size={18} color={on ? palette.accentStrong : palette.muted} />
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
