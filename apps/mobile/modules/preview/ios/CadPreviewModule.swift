import ExpoModulesCore
import Metal

/**
 * Scene owned by JavaScript.
 *
 * Uploads are copied into private Metal buffers during the call. The view draws the latest
 * snapshot and does not orbit, pick, or keep a pointer into a JavaScript array. A rejected
 * upload drops that buffer and sets a stable fault; it never reaches `drawIndexedPrimitives`.
 */
public final class PreviewScene: SharedObject {
  let device: MTLDevice? = MTLCreateSystemDefaultDevice()
  let lock = NSLock()
  weak var surface: PreviewSurface?
  private var redrawScheduled = false

  var positions: MTLBuffer?
  var normals: MTLBuffer?
  var indices: MTLBuffer?
  var indexCount = 0
  var vertexCount = 0
  var lines: MTLBuffer?
  var lineVertices = 0
  var active: MTLBuffer?
  var activeVertices = 0
  var overlay: MTLBuffer?
  var overlayVertices = 0
  var eye = SIMD3<Float>(0, 0, 1)
  var mvp = matrix_identity_float4x4
  var clear = SIMD3<Float>(0.08, 0.09, 0.1)
  var baseColor = SIMD4<Float>(0.72, 0.75, 0.8, 1)
  var selectedColor = SIMD4<Float>(0.95, 0.55, 0.22, 1)
  var selectedStart = 0
  var selectedCount = 0
  var meshFault: String?
  var lineFault: String?

  deinit {
    lock.lock()
    positions = nil
    normals = nil
    indices = nil
    lines = nil
    active = nil
    overlay = nil
    surface = nil
    lock.unlock()
  }

  func replaceMesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array) {
    guard let device else {
      rejectMesh("This iPhone has no Metal device for the preview")
      return
    }
    if positions.length == 0 && normals.length == 0 && indices.length == 0 {
      publishMesh(nil, nil, nil, indexCount: 0, vertices: 0, fault: nil)
      return
    }
    if let rejection = PreviewUpload.mesh(positions, normals, indices) {
      previewLog.error("Rejected mesh upload: \(rejection.message, privacy: .public)")
      rejectMesh(rejection.message)
      return
    }
    guard
      let nextPositions = metalBuffer(positions.rawPointer, positions.byteLength, device, "com.cadcamfun.preview.positions"),
      let nextNormals = metalBuffer(normals.rawPointer, normals.byteLength, device, "com.cadcamfun.preview.normals"),
      let nextIndices = metalBuffer(indices.rawPointer, indices.byteLength, device, "com.cadcamfun.preview.indices")
    else {
      rejectMesh(PreviewRejection.meshInvalid.message)
      return
    }
    publishMesh(nextPositions, nextNormals, nextIndices, indexCount: indices.length, vertices: positions.length / 3, fault: nil)
  }

  func replaceLines(_ lines: Float32Array) {
    guard let device else {
      rejectLines("This iPhone has no Metal device for the preview")
      return
    }
    if lines.length == 0 {
      publishLines(nil, vertices: 0, fault: nil)
      return
    }
    if let rejection = PreviewUpload.lines(lines) {
      previewLog.error("Rejected toolpath upload: \(rejection.message, privacy: .public)")
      rejectLines(rejection.message)
      return
    }
    guard let next = metalBuffer(lines.rawPointer, lines.byteLength, device, "com.cadcamfun.preview.lines") else {
      rejectLines(PreviewRejection.pathInvalid.message)
      return
    }
    publishLines(next, vertices: lines.length / 6, fault: nil)
  }

  func replaceActiveLine(_ line: Float32Array) {
    guard let device else { return }
    if line.length == 0 {
      lock.lock()
      active = nil
      activeVertices = 0
      lock.unlock()
      redraw()
      return
    }
    if let rejection = PreviewUpload.activeLine(line) {
      previewLog.error("Rejected playhead upload: \(rejection.message, privacy: .public)")
      lock.lock()
      active = nil
      activeVertices = 0
      lineFault = rejection.message
      lock.unlock()
      redraw()
      return
    }
    guard let next = metalBuffer(line.rawPointer, line.byteLength, device, "com.cadcamfun.preview.active") else { return }
    lock.lock()
    active = next
    activeVertices = 2
    lock.unlock()
    redraw()
  }

  /// Outline and guides are decoration: a refused upload drops them and keeps the frame.
  func replaceOverlay(_ values: Float32Array) {
    var next: MTLBuffer?
    if values.length > 0, let device {
      if PreviewUpload.overlay(values) {
        next = metalBuffer(values.rawPointer, values.byteLength, device, "com.cadcamfun.preview.overlay")
      } else {
        previewLog.error("Rejected overlay upload")
      }
    }
    lock.lock()
    overlay = next
    overlayVertices = next == nil ? 0 : values.length / 6
    lock.unlock()
    redraw()
  }

  func replaceHighlight(start: Int, count: Int, base: SIMD3<Float>, selected: SIMD3<Float>) {
    lock.lock()
    let triangles = indexCount / 3
    let clampedStart = min(max(start, 0), triangles)
    selectedStart = clampedStart
    selectedCount = min(max(count, 0), triangles - clampedStart)
    baseColor = SIMD4(base, 1)
    selectedColor = SIMD4(selected, 1)
    lock.unlock()
    redraw()
  }

  func replaceCamera(_ mvp: simd_float4x4?, clear: SIMD3<Float>, eye: SIMD3<Float>?) {
    lock.lock()
    if let mvp { self.mvp = mvp }
    if let eye { self.eye = eye }
    self.clear = clear
    lock.unlock()
    redraw()
  }

  func snapshot() -> PreviewFrame {
    lock.lock()
    defer { lock.unlock() }
    return PreviewFrame(
      positions: positions,
      normals: normals,
      indices: indices,
      indexCount: indexCount,
      vertexCount: vertexCount,
      lines: lines,
      lineVertices: lineVertices,
      active: active,
      activeVertices: activeVertices,
      overlay: overlay,
      overlayVertices: overlayVertices,
      eye: eye,
      mvp: mvp,
      clear: clear,
      baseColor: baseColor,
      selectedColor: selectedColor,
      selectedStart: selectedStart,
      selectedCount: selectedCount,
      meshFault: meshFault,
      lineFault: lineFault
    )
  }

  private func rejectMesh(_ message: String) {
    publishMesh(nil, nil, nil, indexCount: 0, vertices: 0, fault: message)
  }

  private func rejectLines(_ message: String) {
    publishLines(nil, vertices: 0, fault: message)
  }

  private func publishMesh(_ positions: MTLBuffer?, _ normals: MTLBuffer?, _ indices: MTLBuffer?, indexCount: Int, vertices: Int, fault: String?) {
    lock.lock()
    self.positions = positions
    self.normals = normals
    self.indices = indices
    self.indexCount = indexCount
    vertexCount = vertices
    meshFault = fault
    if fault != nil {
      selectedStart = 0
      selectedCount = 0
    }
    lock.unlock()
    redraw()
  }

  private func publishLines(_ lines: MTLBuffer?, vertices: Int, fault: String?) {
    lock.lock()
    self.lines = lines
    lineVertices = vertices
    if fault != nil {
      active = nil
      activeVertices = 0
    }
    lineFault = fault
    lock.unlock()
    redraw()
  }

  private func redraw() {
    lock.lock()
    if redrawScheduled {
      lock.unlock()
      return
    }
    redrawScheduled = true
    lock.unlock()
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.lock.lock()
      self.redrawScheduled = false
      let surface = self.surface
      self.lock.unlock()
      surface?.metalView.setNeedsDisplay()
    }
  }
}

struct PreviewFrame {
  let positions: MTLBuffer?
  let normals: MTLBuffer?
  let indices: MTLBuffer?
  let indexCount: Int
  let vertexCount: Int
  let lines: MTLBuffer?
  let lineVertices: Int
  let active: MTLBuffer?
  let activeVertices: Int
  let overlay: MTLBuffer?
  let overlayVertices: Int
  let eye: SIMD3<Float>
  let mvp: simd_float4x4
  let clear: SIMD3<Float>
  let baseColor: SIMD4<Float>
  let selectedColor: SIMD4<Float>
  let selectedStart: Int
  let selectedCount: Int
  let meshFault: String?
  let lineFault: String?
}

private func metalBuffer(_ bytes: UnsafeMutableRawPointer, _ length: Int, _ device: MTLDevice, _ label: String) -> MTLBuffer? {
  guard length > 0 else { return nil }
  let buffer = device.makeBuffer(bytes: bytes, length: length, options: .storageModeShared)
  buffer?.label = label
  return buffer
}

final class PreviewUnavailableException: Exception {
  override var reason: String { "This iPhone has no Metal device for the preview" }
}

public class CadPreviewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CadPreview")

    Function("createScene") { () -> PreviewScene in
      guard MTLCreateSystemDefaultDevice() != nil else { throw PreviewUnavailableException() }
      return PreviewScene()
    }

    Class(PreviewScene.self) {
      Function("setMesh") { (scene: PreviewScene, positions: Float32Array, normals: Float32Array, indices: Uint32Array) in
        scene.replaceMesh(positions: positions, normals: normals, indices: indices)
      }
      Function("setLines") { (scene: PreviewScene, lines: Float32Array) in
        scene.replaceLines(lines)
      }
      Function("setOverlay") { (scene: PreviewScene, lines: Float32Array) in
        scene.replaceOverlay(lines)
      }
      Function("setActiveLine") { (scene: PreviewScene, line: Float32Array) in
        scene.replaceActiveLine(line)
      }
      Function("setHighlight") { (scene: PreviewScene, start: Int, count: Int, red: Double, green: Double, blue: Double, selectedRed: Double, selectedGreen: Double, selectedBlue: Double) in
        scene.replaceHighlight(
          start: start,
          count: count,
          base: SIMD3(PreviewUpload.channel(red), PreviewUpload.channel(green), PreviewUpload.channel(blue)),
          selected: SIMD3(PreviewUpload.channel(selectedRed), PreviewUpload.channel(selectedGreen), PreviewUpload.channel(selectedBlue))
        )
      }
      Function("setCamera") { (scene: PreviewScene, mvp: Float32Array, red: Double, green: Double, blue: Double, eyeX: Double, eyeY: Double, eyeZ: Double) in
        let eye = eyeX.isFinite && eyeY.isFinite && eyeZ.isFinite ? SIMD3(Float(eyeX), Float(eyeY), Float(eyeZ)) : nil
        scene.replaceCamera(
          PreviewUpload.matrix(mvp),
          clear: SIMD3(PreviewUpload.channel(red), PreviewUpload.channel(green), PreviewUpload.channel(blue)),
          eye: eye
        )
      }
    }

    View(PreviewSurface.self) {
      ViewName("PreviewSurface")
      Events("onError")
      Prop("scene") { (view: PreviewSurface, scene: PreviewScene) in
        view.attach(scene)
      }
    }
  }
}
