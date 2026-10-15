import { useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { GLView } from "expo-gl"
import { useTheme } from "@/lib/theme"
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

type GL = WebGLRenderingContext & { readonly drawingBufferWidth: number; readonly drawingBufferHeight: number; endFrameEXP(): void }

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

const MESH_VS = `
attribute vec3 position;
attribute vec3 normal;
uniform mat4 mvp;
varying vec3 vNormal;
void main() {
  vNormal = normal;
  gl_Position = mvp * vec4(position, 1.0);
}`

const MESH_FS = `
precision mediump float;
varying vec3 vNormal;
uniform vec3 color;
void main() {
  vec3 light = normalize(vec3(0.3, 0.5, 0.8));
  float shade = max(dot(normalize(vNormal), light), 0.22);
  gl_FragColor = vec4(color * shade, 1.0);
}`

const LINE_VS = `
attribute vec3 position;
attribute vec3 color;
uniform mat4 mvp;
varying vec3 vColor;
void main() {
  vColor = color;
  gl_Position = mvp * vec4(position, 1.0);
}`

const LINE_FS = `
precision mediump float;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`

interface MeshBuffer {
  readonly key: string
  readonly program: WebGLProgram
  readonly position: WebGLBuffer
  readonly normal: WebGLBuffer
  readonly index: WebGLBuffer
  readonly indexType: number
  readonly indexBytes: number
  readonly mvp: WebGLUniformLocation
  readonly color: WebGLUniformLocation
}

interface LineBuffer {
  readonly key: string
  readonly program: WebGLProgram
  readonly buffer: WebGLBuffer
  readonly count: number
  readonly mvp: WebGLUniformLocation
}

const compile = (gl: GL, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("Could not create a shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader failed")
  return shader
}

const link = (gl: GL, vertex: string, fragment: string): WebGLProgram => {
  const program = gl.createProgram()
  if (!program) throw new Error("Could not create a program")
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Program failed")
  return program
}

const uploadMesh = (gl: GL, mesh: PreviewMesh): MeshBuffer => {
  const program = link(gl, MESH_VS, MESH_FS)
  const position = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, position)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW)
  const normal = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, normal)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.normals), gl.STATIC_DRAW)
  let max = 0
  for (const index of mesh.indices) if (index > max) max = index
  const webgl2 = typeof (gl as unknown as { drawBuffers?: unknown }).drawBuffers === "function" || String(gl.getParameter(gl.VERSION)).includes("WebGL 2")
  const uint = webgl2 || gl.getExtension("OES_element_index_uint")
  if (max > 65535 && !uint) throw new Error("This preview is too detailed for the phone GPU")
  const indexType = max > 65535 ? 0x1405 : gl.UNSIGNED_SHORT
  const index = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, max > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices), gl.STATIC_DRAW)
  return {
    key: mesh.revision,
    program,
    position,
    normal,
    index,
    indexType,
    indexBytes: max > 65535 ? 4 : 2,
    mvp: gl.getUniformLocation(program, "mvp")!,
    color: gl.getUniformLocation(program, "color")!,
  }
}

const linePositions = (segments: readonly PreviewSegment[], stock: Bounds | undefined, playhead: number): Float32Array => {
  const stockEdges = stock ? boxEdges(stock) : []
  const count = (segments.length + stockEdges.length) * 2
  const data = new Float32Array(count * 6)
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

const uploadLines = (gl: GL, key: string, data: Float32Array): LineBuffer => {
  const program = link(gl, LINE_VS, LINE_FS)
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  return { key, program, buffer, count: data.length / 6, mvp: gl.getUniformLocation(program, "mvp")! }
}

const bindMeshAttribs = (gl: GL, mesh: MeshBuffer) => {
  const position = gl.getAttribLocation(mesh.program, "position")
  const normal = gl.getAttribLocation(mesh.program, "normal")
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal)
  gl.enableVertexAttribArray(normal)
  gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index)
}

/**
 * Orbitable mesh and toolpath lines. One finger rotates, two fingers zoom and pan.
 * A tap reports the part under the finger. The GPU context stays here; the math is tested without it.
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
  const [size, setSize] = useState({ width: 1, height: 1 })
  const glRef = useRef<GL | null>(null)
  const meshRef = useRef<MeshBuffer | null>(null)
  const lineRef = useRef<LineBuffer | null>(null)
  const scene = useRef({ bounds, revision, mesh, segments, stock, playhead, selectedPartId, orbit, onSelectPart })
  scene.current = { bounds, revision, mesh, segments, stock, playhead, selectedPartId, orbit, onSelectPart }
  const gesture = useRef({ x: 0, y: 0, pinch: 0, two: false, moved: false })

  useEffect(() => {
    setOrbit(fitOrbit(bounds))
  }, [revision, bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]])

  const draw = () => {
    const gl = glRef.current
    if (!gl) return
    const current = scene.current
    try {
      const width = gl.drawingBufferWidth || size.width
      const height = gl.drawingBufferHeight || size.height
      gl.viewport(0, 0, width, height)
      const clear = palette.background
      const rgb: readonly [number, number, number] = clear.startsWith("#") ? hex(clear) : [0.08, 0.09, 0.1]
      gl.clearColor(rgb[0], rgb[1], rgb[2], 1)
      gl.enable(gl.DEPTH_TEST)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      const mvp = new Float32Array(mvpOf(current.orbit, width / Math.max(height, 1)))
      if (current.mesh && current.mesh.indices.length >= 3) {
        if (!meshRef.current || meshRef.current.key !== current.mesh.revision) meshRef.current = uploadMesh(gl, current.mesh)
        const buffer = meshRef.current
        gl.useProgram(buffer.program)
        gl.uniformMatrix4fv(buffer.mvp, false, mvp)
        bindMeshAttribs(gl, buffer)
        const drawRange = (part: PreviewMesh["parts"][number] | undefined, color: [number, number, number]) => {
          gl.uniform3f(buffer.color, color[0], color[1], color[2])
          if (!part) gl.drawElements(gl.TRIANGLES, current.mesh!.indices.length, buffer.indexType, 0)
          else gl.drawElements(gl.TRIANGLES, part.triangleCount * 3, buffer.indexType, part.triangleStart * 3 * buffer.indexBytes)
        }
        if (current.selectedPartId) {
          drawRange(undefined, MESH_COLOR)
          const part = current.mesh.parts.find((item) => item.id === current.selectedPartId && item.triangleCount > 0)
          if (part) drawRange(part, SELECTED_COLOR)
        } else drawRange(undefined, MESH_COLOR)
      }
      if (current.segments && current.segments.length > 0) {
        const key = `${current.revision}:${current.playhead}:${current.segments.length}`
        if (!lineRef.current || lineRef.current.key !== key) {
          lineRef.current = uploadLines(gl, key, linePositions(current.segments, current.stock, current.playhead))
        }
        const lines = lineRef.current
        gl.useProgram(lines.program)
        gl.uniformMatrix4fv(lines.mvp, false, mvp)
        const position = gl.getAttribLocation(lines.program, "position")
        const color = gl.getAttribLocation(lines.program, "color")
        gl.bindBuffer(gl.ARRAY_BUFFER, lines.buffer)
        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0)
        gl.enableVertexAttribArray(color)
        gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 24, 12)
        gl.drawArrays(gl.LINES, 0, lines.count)
      }
      gl.endFrameEXP()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The 3D preview could not start")
    }
  }

  useEffect(() => {
    draw()
  })

  const pick = (x: number, y: number) => {
    const current = scene.current
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
      <GLView
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onContextCreate={(context) => {
          glRef.current = context as unknown as GL
          draw()
        }}
      />
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

const distance = (a: { locationX: number; locationY: number }, b: { locationX: number; locationY: number }): number =>
  Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY)

const hex = (value: string): [number, number, number] => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
