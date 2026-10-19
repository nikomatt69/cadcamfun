import ExpoModulesCore
import MetalKit
import UIKit

/// Column-major MVP, a colour, the world-space eye and the pose. Layout matches the Metal `Uniforms` struct (112 bytes).
/// `pose.x` is the spin angle in radians about the display x axis; the line draws use it as their tint.
struct PreviewUniforms {
  var mvp: simd_float4x4
  var color: SIMD4<Float>
  var eye: SIMD4<Float>
  var pose: SIMD4<Float>
}

/// Matches the Metal `LineParams` struct: drawable size in pixels, line width in pixels, clip-space depth pull.
struct PreviewLineParams {
  var viewport: SIMD2<Float>
  var width: Float
  var depthPull: Float
}

/// Line widths in points; the surface multiplies by the screen scale.
enum PreviewLineStyle {
  /// Dense programs (3D surfacing) thin out so passes stay distinguishable instead of merging into a block.
  static func path(segments: Int) -> (width: Float, pull: Float) {
    (width: segments > 6_000 ? 0.9 : segments > 1_500 ? 1.25 : 1.75, pull: 2e-5)
  }
  static let stock = (width: Float(1.1), pull: Float(2e-5))
  static let overlay = (width: Float(1.1), pull: Float(4e-5))
  static let active = (width: Float(3.5), pull: Float(8e-5))
  static let tool = (width: Float(1.5), pull: Float(8e-5))
}

/**
 * On-demand Metal view. Touches stay in JavaScript.
 * Shaders are compiled from source so the pod does not ship a separate metallib.
 * The command buffer is presented once; a GPU failure is logged and reported as one stable sentence.
 */
public final class PreviewSurface: ExpoView, MTKViewDelegate {
  let onError = EventDispatcher()
  let metalView: MTKView
  private var queue: MTLCommandQueue?
  private var library: MTLLibrary?
  private var meshPipeline: MTLRenderPipelineState?
  private var solidPipeline: MTLRenderPipelineState?
  private var linePipeline: MTLRenderPipelineState?
  private var depthLess: MTLDepthStencilState?
  private var depthEqual: MTLDepthStencilState?
  /// Translucent (assumed) bodies: tested against the opaque depth, never written.
  private var depthReadOnly: MTLDepthStencilState?
  private var scene: PreviewScene?
  private var reported = Set<String>()
  private var boundDevice: ObjectIdentifier?

  required init(appContext: AppContext? = nil) {
    let device = MTLCreateSystemDefaultDevice()
    metalView = MTKView(frame: .zero, device: device)
    super.init(appContext: appContext)
    metalView.delegate = self
    metalView.isPaused = true
    metalView.enableSetNeedsDisplay = true
    metalView.framebufferOnly = true
    metalView.isOpaque = true
    metalView.colorPixelFormat = .bgra8Unorm
    metalView.depthStencilPixelFormat = .depth32Float
    metalView.clearColor = MTLClearColor(red: 0.08, green: 0.09, blue: 0.1, alpha: 1)
    metalView.isUserInteractionEnabled = false
    metalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(metalView)
    isUserInteractionEnabled = false
  }

  func attach(_ scene: PreviewScene) {
    let same = self.scene === scene
    self.scene = scene
    scene.surface = self
    guard let device = scene.device else {
      report("This iPhone has no Metal device for the preview")
      return
    }
    if !same || queue == nil || boundDevice != ObjectIdentifier(device as AnyObject) {
      configure(device)
    }
    metalView.setNeedsDisplay()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    metalView.frame = bounds
    let scale = window?.screen.scale ?? traitCollection.displayScale
    if scale > 0 { metalView.contentScaleFactor = scale }
  }

  public func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  public func draw(in view: MTKView) {
    guard UIApplication.shared.applicationState != .background else { return }
    guard view.drawableSize.width >= 1, view.drawableSize.height >= 1 else { return }
    guard let scene, let queue else { return }
    do {
      try ensurePipelines(view)
    } catch {
      previewLog.error("Preview pipeline failed: \(error.localizedDescription, privacy: .public)")
      report("The preview could not be displayed")
      return
    }
    let frame = scene.snapshot()
    if let fault = frame.meshFault { report(fault) }
    if let fault = frame.lineFault { report(fault) }
    if let fault = frame.solidFault { report(fault) }
    let clear = frame.clear
    view.clearColor = MTLClearColor(red: Double(clear.x), green: Double(clear.y), blue: Double(clear.z), alpha: 1)
    guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable else { return }
    pass.colorAttachments[0].clearColor = view.clearColor
    pass.depthAttachment?.clearDepth = 1
    guard let command = queue.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: pass) else {
      report("The preview could not be displayed")
      return
    }
    command.label = "com.cadcamfun.preview.frame"
    var uniforms = PreviewUniforms(mvp: frame.mvp, color: frame.baseColor, eye: SIMD4(frame.eye, 1), pose: SIMD4(0, 0, 0, 0))
    encoder.setDepthBias(0, slopeScale: 0, clamp: 0)
    if meshIsDrawable(frame), let positions = frame.positions, let normals = frame.normals, let indices = frame.indices, let meshPipeline, let depthLess {
      encoder.setRenderPipelineState(meshPipeline)
      encoder.setDepthStencilState(depthLess)
      encoder.setVertexBuffer(positions, offset: 0, index: 0)
      encoder.setVertexBuffer(normals, offset: 0, index: 1)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 2)
      encoder.setFragmentBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 0)
      encoder.drawIndexedPrimitives(type: .triangle, indexCount: frame.indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
      let triangles = frame.indexCount / 3
      let start = min(max(frame.selectedStart, 0), triangles)
      let count = min(max(frame.selectedCount, 0), triangles - start)
      if count > 0, let depthEqual {
        uniforms.color = frame.selectedColor
        encoder.setDepthStencilState(depthEqual)
        encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 2)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 0)
        encoder.drawIndexedPrimitives(
          type: .triangle,
          indexCount: count * 3,
          indexType: .uint32,
          indexBuffer: indices,
          indexBufferOffset: start * 3 * MemoryLayout<UInt32>.size
        )
      }
    }
    // Machine bodies: opaque triangles write depth, the translucent (assumed) ones follow with the depth read-only.
    if let solidPipeline {
      if let vertices = frame.solids, let indices = frame.solidIndices,
         solidSetIsDrawable(vertices: vertices, indices: indices, vertexCount: frame.solidVertices, triangles: frame.solidTriangles) {
        drawSolidSet(encoder, mvp: frame.mvp, eye: frame.eye, vertices: vertices, indices: indices,
                     triangles: frame.solidTriangles, opaqueTriangles: frame.solidOpaqueTriangles, angle: 0, pipeline: solidPipeline)
      }
      if let vertices = frame.spindle, let indices = frame.spindleIndices,
         solidSetIsDrawable(vertices: vertices, indices: indices, vertexCount: frame.spindleVertices, triangles: frame.spindleTriangles) {
        drawSolidSet(encoder, mvp: frame.mvp, eye: frame.eye, vertices: vertices, indices: indices,
                     triangles: frame.spindleTriangles, opaqueTriangles: frame.spindleOpaqueTriangles, angle: frame.spinAngle, pipeline: solidPipeline)
      }
    }
    // Line draws read `color` as a tint: rgb is the target, alpha how far to move toward it (0 = vertex colour).
    var lineUniforms = PreviewUniforms(mvp: frame.mvp, color: SIMD4<Float>(0, 0, 0, 0), eye: SIMD4<Float>(frame.eye, 1), pose: SIMD4(0, 0, 0, 0))
    if linesAreDrawable(frame), let lines = frame.lines, let linePipeline, let depthLess {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthLess)
      // Negative bias pulls the path toward the camera so it stays visible on the mesh.
      encoder.setDepthBias(-1, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(lines, offset: 0, index: 0)
      let total = frame.lineVertices
      let path = min(frame.pathVertices, total)
      let travelled = frame.travelledVertices < 0 ? path : min(frame.travelledVertices, path)
      let ranges: [(start: Int, count: Int, faded: Bool)] = [
        (start: 0, count: travelled, faded: false),
        (start: travelled, count: path - travelled, faded: true),
        (start: path, count: total - path, faded: false),
      ]
      for range in ranges where range.count >= 2 {
        lineUniforms.color = range.faded ? SIMD4<Float>(frame.clear, frame.remainingFade) : SIMD4<Float>(0, 0, 0, 0)
        encoder.setVertexBytes(&lineUniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
        drawLines(encoder, view, start: range.start, count: range.count, style: range.start >= path ? PreviewLineStyle.stock : PreviewLineStyle.path(segments: path / 2))
      }
    }
    lineUniforms.color = SIMD4<Float>(0, 0, 0, 0)
    if frame.overlayVertices >= 2, frame.overlayVertices % 2 == 0, let overlay = frame.overlay, overlay.length >= frame.overlayVertices * 24, let linePipeline, let depthLess {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthLess)
      // Outline sits on the faces it bounds: pull it forward like the path.
      encoder.setDepthBias(-1, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(overlay, offset: 0, index: 0)
      encoder.setVertexBytes(&lineUniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      drawLines(encoder, view, start: 0, count: frame.overlayVertices, style: PreviewLineStyle.overlay)
    }
    if frame.activeVertices >= 2, frame.activeVertices % 2 == 0, let active = frame.active, active.length >= frame.activeVertices * 24, let linePipeline, let depthEqual {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthEqual)
      encoder.setDepthBias(-2, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(active, offset: 0, index: 0)
      encoder.setVertexBytes(&lineUniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      // The move first, then the wireframe tool in a finer stroke.
      drawLines(encoder, view, start: 0, count: 2, style: PreviewLineStyle.active)
      drawLines(encoder, view, start: 2, count: frame.activeVertices - 2, style: PreviewLineStyle.tool)
    }
    encoder.endEncoding()
    command.present(drawable)
    command.addCompletedHandler { [weak self] buffer in
      guard let error = buffer.error else { return }
      previewLog.error("Metal command failed: \(error.localizedDescription, privacy: .public)")
      DispatchQueue.main.async { self?.report("The preview could not be displayed") }
    }
    command.commit()
  }

  /// `start`/`count` are line vertices (two per segment); each segment becomes six quad vertices.
  private func drawLines(_ encoder: MTLRenderCommandEncoder, _ view: MTKView, start: Int, count: Int, style: (width: Float, pull: Float)) {
    let segments = count / 2
    guard segments > 0 else { return }
    let scale = Float(view.contentScaleFactor > 0 ? view.contentScaleFactor : 1)
    var params = PreviewLineParams(
      viewport: SIMD2(Float(view.drawableSize.width), Float(view.drawableSize.height)),
      width: style.width * scale,
      depthPull: style.pull
    )
    encoder.setVertexBytes(&params, length: MemoryLayout<PreviewLineParams>.stride, index: 2)
    encoder.drawPrimitives(type: .triangle, vertexStart: (start / 2) * 6, vertexCount: segments * 6)
  }

  /// One machine body set: the opaque range first, then the translucent (assumed) one, from the same index buffer.
  /// `angle` is the spin about the display x axis, zero for the bodies that stand still.
  private func drawSolidSet(_ encoder: MTLRenderCommandEncoder, mvp: simd_float4x4, eye: SIMD3<Float>, vertices: MTLBuffer, indices: MTLBuffer, triangles: Int, opaqueTriangles: Int, angle: Float, pipeline: MTLRenderPipelineState) {
    let opaque = min(max(opaqueTriangles, 0), triangles)
    var uniforms = PreviewUniforms(mvp: mvp, color: SIMD4<Float>(0, 0, 0, 0), eye: SIMD4(eye, 1), pose: SIMD4(angle, 0, 0, 0))
    encoder.setRenderPipelineState(pipeline)
    encoder.setVertexBuffer(vertices, offset: 0, index: 0)
    encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
    encoder.setFragmentBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 0)
    if opaque > 0, let depthLess {
      encoder.setDepthStencilState(depthLess)
      encoder.drawIndexedPrimitives(type: .triangle, indexCount: opaque * 3, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
    }
    let translucent = triangles - opaque
    if translucent > 0, let depthReadOnly {
      encoder.setDepthStencilState(depthReadOnly)
      encoder.drawIndexedPrimitives(
        type: .triangle,
        indexCount: translucent * 3,
        indexType: .uint32,
        indexBuffer: indices,
        indexBufferOffset: opaque * 3 * MemoryLayout<UInt32>.size
      )
    }
  }

  private func solidSetIsDrawable(vertices: MTLBuffer, indices: MTLBuffer, vertexCount: Int, triangles: Int) -> Bool {
    guard vertexCount > 0, triangles > 0 else { return false }
    let stride = PreviewLimits.solidVertexFloats * MemoryLayout<Float>.size
    return vertices.length >= vertexCount * stride && indices.length >= triangles * 3 * MemoryLayout<UInt32>.size
  }

  private func meshIsDrawable(_ frame: PreviewFrame) -> Bool {
    guard frame.indexCount >= 3, frame.indexCount % 3 == 0, frame.vertexCount > 0 else { return false }
    guard let positions = frame.positions, let normals = frame.normals, let indices = frame.indices else { return false }
    return positions.length >= frame.vertexCount * 12 && normals.length >= frame.vertexCount * 12 && indices.length >= frame.indexCount * MemoryLayout<UInt32>.size
  }

  private func linesAreDrawable(_ frame: PreviewFrame) -> Bool {
    guard frame.lineVertices >= 2, frame.lineVertices % 2 == 0, let lines = frame.lines else { return false }
    return lines.length >= frame.lineVertices * 24
  }

  private func configure(_ device: MTLDevice) {
    let incoming = ObjectIdentifier(device as AnyObject)
    if boundDevice != incoming {
      boundDevice = incoming
      library = nil
      meshPipeline = nil
      solidPipeline = nil
      linePipeline = nil
      depthLess = nil
      depthEqual = nil
      depthReadOnly = nil
      queue = nil
      metalView.device = device
    }
    let samples = device.supportsTextureSampleCount(4) ? 4 : 1
    if metalView.sampleCount != samples {
      meshPipeline = nil
      solidPipeline = nil
      linePipeline = nil
      metalView.sampleCount = samples
    }
    if queue == nil {
      queue = device.makeCommandQueue()
      queue?.label = "com.cadcamfun.preview"
      if queue == nil {
        previewLog.error("Metal command queue was not created")
        report("The preview could not be displayed")
      }
    }
    guard library == nil else { return }
    do {
      library = try device.makeLibrary(source: shaderSource, options: nil)
      depthLess = depthState(device, compare: .less)
      depthEqual = depthState(device, compare: .lessEqual)
      depthReadOnly = depthState(device, compare: .lessEqual, write: false)
    } catch {
      previewLog.error("Preview shaders failed: \(error.localizedDescription, privacy: .public)")
      report("The preview could not be displayed")
    }
  }

  private func ensurePipelines(_ view: MTKView) throws {
    if meshPipeline != nil, solidPipeline != nil, linePipeline != nil { return }
    guard let device = view.device, let library else { throw PreviewDrawError() }
    do {
      try buildPipelines(device, library, view)
    } catch {
      guard view.sampleCount > 1 else { throw error }
      previewLog.error("Multisample pipeline failed, drawing without it: \(error.localizedDescription, privacy: .public)")
      view.sampleCount = 1
      meshPipeline = nil
      solidPipeline = nil
      linePipeline = nil
      try buildPipelines(device, library, view)
    }
  }

  private func buildPipelines(_ device: MTLDevice, _ library: MTLLibrary, _ view: MTKView) throws {
    meshPipeline = try pipeline(device, library, view, vertex: "meshVertex", fragment: "meshFragment")
    solidPipeline = try pipeline(device, library, view, vertex: "solidVertex", fragment: "solidFragment", blending: true)
    linePipeline = try pipeline(device, library, view, vertex: "lineVertex", fragment: "lineFragment")
  }

  private func pipeline(_ device: MTLDevice, _ library: MTLLibrary, _ view: MTKView, vertex: String, fragment: String, blending: Bool = false) throws -> MTLRenderPipelineState {
    guard let vertexFunction = library.makeFunction(name: vertex), let fragmentFunction = library.makeFunction(name: fragment) else {
      throw PreviewDrawError()
    }
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = vertexFunction
    descriptor.fragmentFunction = fragmentFunction
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat
    descriptor.depthAttachmentPixelFormat = view.depthStencilPixelFormat
    descriptor.sampleCount = view.sampleCount
    descriptor.label = "com.cadcamfun.preview.\(vertex)"
    if blending, let color = descriptor.colorAttachments[0] {
      // The machine's assumed (translucent) bodies; an opaque vertex has alpha 1 and lands unchanged.
      color.isBlendingEnabled = true
      color.rgbBlendOperation = .add
      color.alphaBlendOperation = .add
      color.sourceRGBBlendFactor = .sourceAlpha
      color.sourceAlphaBlendFactor = .sourceAlpha
      color.destinationRGBBlendFactor = .oneMinusSourceAlpha
      color.destinationAlphaBlendFactor = .oneMinusSourceAlpha
    }
    return try device.makeRenderPipelineState(descriptor: descriptor)
  }

  private func depthState(_ device: MTLDevice, compare: MTLCompareFunction, write: Bool = true) -> MTLDepthStencilState? {
    let descriptor = MTLDepthStencilDescriptor()
    descriptor.depthCompareFunction = compare
    descriptor.isDepthWriteEnabled = write
    return device.makeDepthStencilState(descriptor: descriptor)
  }

  private func report(_ message: String) {
    guard reported.insert(message).inserted else { return }
    onError(["message": message])
  }
}

private struct PreviewDrawError: Error {}

private let shaderSource = """
#include <metal_stdlib>
using namespace metal;

struct Uniforms {
  float4x4 mvp;
  float4 color;
  float4 eye;
  // pose.x is the spin angle (radians) of the bodies that turn; the line draws keep it zero.
  float4 pose;
};

struct MeshOut {
  float4 position [[position]];
  float3 normal;
  float3 world;
  float4 color;
  float3 eye;
};

vertex MeshOut meshVertex(uint vid [[vertex_id]],
                          constant packed_float3* positions [[buffer(0)]],
                          constant packed_float3* normals [[buffer(1)]],
                          constant Uniforms& uniforms [[buffer(2)]]) {
  MeshOut out;
  out.position = uniforms.mvp * float4(float3(positions[vid]), 1.0);
  out.normal = float3(normals[vid]);
  out.world = float3(positions[vid]);
  out.color = uniforms.color;
  out.eye = uniforms.eye.xyz;
  return out;
}

// CAD studio shading: a headlight that follows the camera, a fixed sky key, a sky/ground
// ambient and a faint rim, so faces stay readable from every orbit angle. Shared by the CAD
// mesh and the machine bodies, which differ only in what they do with the alpha.
static inline float3 studio(float3 normalIn, float3 world, float3 eye, float3 base) {
  float3 normal = normalIn;
  float len = length(normal);
  normal = len < 1e-4 ? float3(0.0, 0.0, 1.0) : normal / len;
  float3 view = eye - world;
  float viewLen = length(view);
  view = viewLen < 1e-6 ? float3(0.0, 0.0, 1.0) : view / viewLen;
  // Open or inverted shells: light the side the camera sees.
  if (dot(normal, view) < 0.0) normal = -normal;
  float3 key = normalize(float3(0.35, 0.45, 0.82));
  float head = max(dot(normal, view), 0.0);
  float sky = max(dot(normal, key), 0.0);
  float ambient = mix(0.16, 0.3, normal.z * 0.5 + 0.5);
  float3 halfway = normalize(key + view);
  float specular = pow(max(dot(normal, halfway), 0.0), 56.0) * 0.22 + pow(head, 24.0) * 0.08;
  float rim = pow(1.0 - head, 3.0) * 0.1;
  return min(base * (ambient + head * 0.58 + sky * 0.24) + specular + rim, float3(1.0));
}

fragment float4 meshFragment(MeshOut in [[stage_in]]) {
  return float4(studio(in.normal, in.world, in.eye, in.color.rgb), 1.0);
}

// The machine around the program: xyz, normal xyz, rgba. Keep the stride (40 bytes) in step with
// `SOLID_VERTEX_FLOATS` in `machine-bodies.ts` and `PreviewUpload.swift`.
struct SolidVertex {
  packed_float3 position;
  packed_float3 normal;
  packed_float3 color;
  float alpha;
};

struct SolidOut {
  float4 position [[position]];
  float3 normal;
  float3 world;
  float4 color;
  float3 eye;
};

// What turns with the spindle rotates about the display x axis by `uniforms.pose.x` radians.
static inline float3 spinAboutX(float3 value, float angle) {
  float c = cos(angle), s = sin(angle);
  return float3(value.x, value.y * c - value.z * s, value.y * s + value.z * c);
}

vertex SolidOut solidVertex(uint vid [[vertex_id]],
                            constant SolidVertex* vertices [[buffer(0)]],
                            constant Uniforms& uniforms [[buffer(1)]]) {
  SolidVertex v = vertices[vid];
  float3 world = spinAboutX(float3(v.position), uniforms.pose.x);
  SolidOut out;
  out.position = uniforms.mvp * float4(world, 1.0);
  out.normal = spinAboutX(float3(v.normal), uniforms.pose.x);
  out.world = world;
  out.color = float4(float3(v.color), v.alpha);
  out.eye = uniforms.eye.xyz;
  return out;
}

// A body keeps its vertex alpha: 1 for a solid body, the desktop's 0.45 for an assumed workholding.
fragment float4 solidFragment(SolidOut in [[stage_in]]) {
  return float4(studio(in.normal, in.world, in.eye, in.color.rgb), in.color.a);
}

struct LineOut {
  float4 position [[position]];
  float3 color;
};

struct LineVertex {
  packed_float3 position;
  packed_float3 color;
};

struct LineParams {
  float2 viewport;
  float width;
  float depthPull;
};

// Hardware lines are one pixel wide, a third of a point on a 3x screen. Each segment (two LineVertex
// entries) is drawn as a screen-space quad instead: six vertices, two triangles, square caps so a
// polyline has no gaps at its corners. The quad is pulled slightly toward the camera so it wins
// against the faces it outlines.
vertex LineOut lineVertex(uint vid [[vertex_id]],
                          constant LineVertex* vertices [[buffer(0)]],
                          constant Uniforms& uniforms [[buffer(1)]],
                          constant LineParams& params [[buffer(2)]]) {
  const uint segment = vid / 6;
  const uint corner = vid % 6;
  // (end, side) per corner: triangles (a-, b-, a+) and (a+, b-, b+).
  const bool atEnd = corner == 1 || corner == 4 || corner == 5;
  const float side = (corner == 2 || corner == 3 || corner == 5) ? 1.0 : -1.0;
  LineVertex a = vertices[segment * 2];
  LineVertex b = vertices[segment * 2 + 1];
  float4 pa = uniforms.mvp * float4(float3(a.position), 1.0);
  float4 pb = uniforms.mvp * float4(float3(b.position), 1.0);
  // Clip against the near plane (z = 0 in Metal clip space) so a segment through the camera keeps a direction.
  if (pa.z < 0.0 && pb.z >= 0.0) pa = mix(pa, pb, pa.z / (pa.z - pb.z));
  else if (pb.z < 0.0 && pa.z >= 0.0) pb = mix(pb, pa, pb.z / (pb.z - pa.z));
  LineOut out;
  out.color = mix(float3(atEnd ? b.color : a.color), uniforms.color.rgb, uniforms.color.a);
  if (pa.z < 0.0 && pb.z < 0.0) {
    out.position = float4(0.0, 0.0, -1.0, 1.0);
    return out;
  }
  float2 sa = pa.xy / max(pa.w, 1e-6) * params.viewport * 0.5;
  float2 sb = pb.xy / max(pb.w, 1e-6) * params.viewport * 0.5;
  float2 along = sb - sa;
  float len = length(along);
  along = len < 1e-4 ? float2(1.0, 0.0) : along / len;
  float2 across = float2(-along.y, along.x);
  float2 offset = (across * side + along * (atEnd ? 1.0 : -1.0)) * params.width * 0.5;
  float4 p = atEnd ? pb : pa;
  p.xy += offset / (params.viewport * 0.5) * p.w;
  p.z = max(p.z - params.depthPull * p.w, 0.0);
  out.position = p;
  return out;
}

fragment float4 lineFragment(LineOut in [[stage_in]]) {
  return float4(in.color, 1.0);
}
"""
