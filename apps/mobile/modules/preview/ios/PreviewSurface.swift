import ExpoModulesCore
import MetalKit
import UIKit

/// Column-major MVP, a colour and the world-space eye. Layout matches the Metal `Uniforms` struct (96 bytes).
struct PreviewUniforms {
  var mvp: simd_float4x4
  var color: SIMD4<Float>
  var eye: SIMD4<Float>
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
  private var linePipeline: MTLRenderPipelineState?
  private var depthLess: MTLDepthStencilState?
  private var depthEqual: MTLDepthStencilState?
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
    var uniforms = PreviewUniforms(mvp: frame.mvp, color: frame.baseColor, eye: SIMD4(frame.eye, 1))
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
    if linesAreDrawable(frame), let lines = frame.lines, let linePipeline, let depthLess {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthLess)
      // Negative bias pulls the path toward the camera so it stays visible on the mesh.
      encoder.setDepthBias(-1, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(lines, offset: 0, index: 0)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      encoder.drawPrimitives(type: .line, vertexStart: 0, vertexCount: frame.lineVertices)
    }
    if frame.overlayVertices >= 2, frame.overlayVertices % 2 == 0, let overlay = frame.overlay, overlay.length >= frame.overlayVertices * 24, let linePipeline, let depthLess {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthLess)
      // Outline sits on the faces it bounds: pull it forward like the path.
      encoder.setDepthBias(-1, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(overlay, offset: 0, index: 0)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      encoder.drawPrimitives(type: .line, vertexStart: 0, vertexCount: frame.overlayVertices)
    }
    if frame.activeVertices == 2, let active = frame.active, active.length >= 48, let linePipeline, let depthEqual {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthEqual)
      encoder.setDepthBias(-2, slopeScale: -1, clamp: 0)
      encoder.setVertexBuffer(active, offset: 0, index: 0)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      encoder.drawPrimitives(type: .line, vertexStart: 0, vertexCount: 2)
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
      linePipeline = nil
      depthLess = nil
      depthEqual = nil
      queue = nil
      metalView.device = device
    }
    let samples = device.supportsTextureSampleCount(4) ? 4 : 1
    if metalView.sampleCount != samples {
      meshPipeline = nil
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
    } catch {
      previewLog.error("Preview shaders failed: \(error.localizedDescription, privacy: .public)")
      report("The preview could not be displayed")
    }
  }

  private func ensurePipelines(_ view: MTKView) throws {
    if meshPipeline != nil, linePipeline != nil { return }
    guard let device = view.device, let library else { throw PreviewDrawError() }
    do {
      try buildPipelines(device, library, view)
    } catch {
      guard view.sampleCount > 1 else { throw error }
      previewLog.error("Multisample pipeline failed, drawing without it: \(error.localizedDescription, privacy: .public)")
      view.sampleCount = 1
      meshPipeline = nil
      linePipeline = nil
      try buildPipelines(device, library, view)
    }
  }

  private func buildPipelines(_ device: MTLDevice, _ library: MTLLibrary, _ view: MTKView) throws {
    meshPipeline = try pipeline(device, library, view, vertex: "meshVertex", fragment: "meshFragment")
    linePipeline = try pipeline(device, library, view, vertex: "lineVertex", fragment: "lineFragment")
  }

  private func pipeline(_ device: MTLDevice, _ library: MTLLibrary, _ view: MTKView, vertex: String, fragment: String) throws -> MTLRenderPipelineState {
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
    return try device.makeRenderPipelineState(descriptor: descriptor)
  }

  private func depthState(_ device: MTLDevice, compare: MTLCompareFunction) -> MTLDepthStencilState? {
    let descriptor = MTLDepthStencilDescriptor()
    descriptor.depthCompareFunction = compare
    descriptor.isDepthWriteEnabled = true
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
// ambient and a faint rim, so faces stay readable from every orbit angle.
fragment float4 meshFragment(MeshOut in [[stage_in]]) {
  float3 normal = in.normal;
  float len = length(normal);
  normal = len < 1e-4 ? float3(0.0, 0.0, 1.0) : normal / len;
  float3 view = in.eye - in.world;
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
  float3 rgb = in.color.rgb * (ambient + head * 0.58 + sky * 0.24) + specular + rim;
  return float4(min(rgb, float3(1.0)), 1.0);
}

struct LineOut {
  float4 position [[position]];
  float3 color;
};

struct LineVertex {
  packed_float3 position;
  packed_float3 color;
};

vertex LineOut lineVertex(uint vid [[vertex_id]],
                          constant LineVertex* vertices [[buffer(0)]],
                          constant Uniforms& uniforms [[buffer(1)]]) {
  LineOut out;
  LineVertex vertex = vertices[vid];
  out.position = uniforms.mvp * float4(float3(vertex.position), 1.0);
  out.color = float3(vertex.color);
  return out;
}

fragment float4 lineFragment(LineOut in [[stage_in]]) {
  return float4(in.color, 1.0);
}
"""
