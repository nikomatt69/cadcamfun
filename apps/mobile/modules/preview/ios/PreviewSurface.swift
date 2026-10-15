import ExpoModulesCore
import MetalKit

/// Column-major MVP plus a colour. Layout matches the Metal `Uniforms` struct.
struct PreviewUniforms {
  var mvp: simd_float4x4
  var color: SIMD4<Float>
}

/**
 * On-demand Metal view. One finger and pinches stay in JavaScript; this view does not take touches.
 * Shaders are compiled from source so the pod does not need a separate metallib build step.
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
  private var reported = false

  required init(appContext: AppContext? = nil) {
    let device = MTLCreateSystemDefaultDevice()
    metalView = MTKView(frame: .zero, device: device)
    super.init(appContext: appContext)
    metalView.delegate = self
    metalView.isPaused = true
    metalView.enableSetNeedsDisplay = true
    metalView.colorPixelFormat = .bgra8Unorm
    metalView.depthStencilPixelFormat = .depth32Float
    metalView.isUserInteractionEnabled = false
    metalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(metalView)
    isUserInteractionEnabled = false
  }

  func attach(_ scene: PreviewScene) {
    self.scene = scene
    scene.surface = self
    guard let device = scene.device else {
      report("This iPhone has no Metal device for the preview")
      return
    }
    metalView.device = device
    queue = device.makeCommandQueue()
    if queue == nil { report("This iPhone could not start a Metal command queue") }
    if library == nil {
      do {
        library = try device.makeLibrary(source: shaderSource, options: nil)
        depthLess = depthState(device, compare: .less)
        depthEqual = depthState(device, compare: .lessEqual)
      } catch {
        report("The preview shaders did not compile")
      }
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
    guard let scene, let queue else { return }
    do {
      try ensurePipelines(view)
    } catch {
      report("The preview pipeline did not start")
      return
    }
    guard let drawable = view.currentDrawable, let pass = view.currentRenderPassDescriptor else { return }
    let frame = scene.snapshot()
    let clear = frame.clear
    view.clearColor = MTLClearColor(red: Double(clear.x), green: Double(clear.y), blue: Double(clear.z), alpha: 1)
    pass.colorAttachments[0].loadAction = .clear
    pass.colorAttachments[0].clearColor = view.clearColor
    pass.colorAttachments[0].storeAction = .store
    if let depth = pass.depthAttachment {
      depth.loadAction = .clear
      depth.clearDepth = 1
      depth.storeAction = .dontCare
    }
    guard let command = queue.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: pass) else { return }
    var uniforms = PreviewUniforms(mvp: frame.mvp, color: frame.baseColor)
    if let positions = frame.positions, let normals = frame.normals, let indices = frame.indices, frame.indexCount >= 3,
      let meshPipeline, let depthLess {
      encoder.setRenderPipelineState(meshPipeline)
      encoder.setDepthStencilState(depthLess)
      encoder.setVertexBuffer(positions, offset: 0, index: 0)
      encoder.setVertexBuffer(normals, offset: 0, index: 1)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 2)
      encoder.setFragmentBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 0)
      encoder.drawIndexedPrimitives(type: .triangle, indexCount: frame.indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
      let start = max(frame.selectedStart, 0) * 3
      let count = max(frame.selectedCount, 0) * 3
      if count > 0, start + count <= frame.indexCount, let depthEqual {
        uniforms.color = frame.selectedColor
        encoder.setDepthStencilState(depthEqual)
        encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 2)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: count, indexType: .uint32, indexBuffer: indices, indexBufferOffset: start * MemoryLayout<UInt32>.size)
      }
    }
    if let lines = frame.lines, frame.lineVertices >= 2, let linePipeline, let depthLess {
      encoder.setRenderPipelineState(linePipeline)
      encoder.setDepthStencilState(depthLess)
      encoder.setVertexBuffer(lines, offset: 0, index: 0)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<PreviewUniforms>.stride, index: 1)
      encoder.drawPrimitives(type: .line, vertexStart: 0, vertexCount: frame.lineVertices)
    }
    encoder.endEncoding()
    command.present(drawable)
    command.commit()
  }

  private func ensurePipelines(_ view: MTKView) throws {
    if meshPipeline != nil, linePipeline != nil { return }
    guard let device = view.device, let library else { throw PreviewDrawError() }
    meshPipeline = try pipeline(device, library, view, vertex: "meshVertex", fragment: "meshFragment")
    linePipeline = try pipeline(device, library, view, vertex: "lineVertex", fragment: "lineFragment")
  }

  private func pipeline(_ device: MTLDevice, _ library: MTLLibrary, _ view: MTKView, vertex: String, fragment: String) throws -> MTLRenderPipelineState {
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = library.makeFunction(name: vertex)
    descriptor.fragmentFunction = library.makeFunction(name: fragment)
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat
    descriptor.depthAttachmentPixelFormat = view.depthStencilPixelFormat
    return try device.makeRenderPipelineState(descriptor: descriptor)
  }

  private func depthState(_ device: MTLDevice, compare: MTLCompareFunction) -> MTLDepthStencilState? {
    let descriptor = MTLDepthStencilDescriptor()
    descriptor.depthCompareFunction = compare
    descriptor.isDepthWriteEnabled = true
    return device.makeDepthStencilState(descriptor: descriptor)
  }

  private func report(_ message: String) {
    guard !reported else { return }
    reported = true
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
};

struct MeshOut {
  float4 position [[position]];
  float3 normal;
  float4 color;
};

vertex MeshOut meshVertex(uint vid [[vertex_id]],
                          constant packed_float3* positions [[buffer(0)]],
                          constant packed_float3* normals [[buffer(1)]],
                          constant Uniforms& uniforms [[buffer(2)]]) {
  MeshOut out;
  out.position = uniforms.mvp * float4(float3(positions[vid]), 1.0);
  out.normal = float3(normals[vid]);
  out.color = uniforms.color;
  return out;
}

fragment float4 meshFragment(MeshOut in [[stage_in]]) {
  float3 normal = in.normal;
  float len = length(normal);
  normal = len < 1e-4 ? float3(0.0, 0.0, 1.0) : normal / len;
  float shade = max(dot(normal, normalize(float3(0.3, 0.5, 0.8))), 0.22);
  return float4(in.color.rgb * shade, 1.0);
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
