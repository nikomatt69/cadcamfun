import ExpoModulesCore
import Metal

/**
 * Scene owned by JavaScript. Typed-array uploads copy into Metal buffers; the view draws whatever
 * is current. Camera math stays in JS (`mvpOf`) so this module does not orbit or pick.
 */
public final class PreviewScene: SharedObject {
  let device: MTLDevice? = MTLCreateSystemDefaultDevice()
  let lock = NSLock()
  weak var surface: PreviewSurface?

  var positions: MTLBuffer?
  var normals: MTLBuffer?
  var indices: MTLBuffer?
  var indexCount = 0
  var lines: MTLBuffer?
  var lineVertices = 0
  var mvp = matrix_identity_float4x4
  var clear = SIMD3<Float>(0, 0, 0)
  var baseColor = SIMD4<Float>(0.72, 0.75, 0.8, 1)
  var selectedColor = SIMD4<Float>(0.95, 0.55, 0.22, 1)
  var selectedStart = 0
  var selectedCount = 0

  func replaceMesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array) {
    guard let device else { return }
    let nextPositions = metalBuffer(positions.rawPointer, positions.byteLength, device)
    let nextNormals = metalBuffer(normals.rawPointer, normals.byteLength, device)
    let nextIndices = metalBuffer(indices.rawPointer, indices.byteLength, device)
    lock.lock()
    self.positions = nextPositions
    self.normals = nextNormals
    self.indices = nextIndices
    indexCount = indices.length
    lock.unlock()
    redraw()
  }

  func replaceLines(_ lines: Float32Array) {
    guard let device else { return }
    let next = metalBuffer(lines.rawPointer, lines.byteLength, device)
    lock.lock()
    self.lines = next
    lineVertices = lines.byteLength / 24
    lock.unlock()
    redraw()
  }

  func replaceHighlight(start: Int, count: Int, base: SIMD3<Float>, selected: SIMD3<Float>) {
    lock.lock()
    selectedStart = start
    selectedCount = count
    baseColor = SIMD4(base, 1)
    selectedColor = SIMD4(selected, 1)
    lock.unlock()
    redraw()
  }

  func replaceCamera(_ mvp: simd_float4x4, clear: SIMD3<Float>) {
    lock.lock()
    self.mvp = mvp
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
      lines: lines,
      lineVertices: lineVertices,
      mvp: mvp,
      clear: clear,
      baseColor: baseColor,
      selectedColor: selectedColor,
      selectedStart: selectedStart,
      selectedCount: selectedCount
    )
  }

  private func redraw() {
    DispatchQueue.main.async { [weak self] in
      self?.surface?.metalView.setNeedsDisplay()
    }
  }
}

struct PreviewFrame {
  let positions: MTLBuffer?
  let normals: MTLBuffer?
  let indices: MTLBuffer?
  let indexCount: Int
  let lines: MTLBuffer?
  let lineVertices: Int
  let mvp: simd_float4x4
  let clear: SIMD3<Float>
  let baseColor: SIMD4<Float>
  let selectedColor: SIMD4<Float>
  let selectedStart: Int
  let selectedCount: Int
}

private func metalBuffer(_ bytes: UnsafeMutableRawPointer, _ length: Int, _ device: MTLDevice) -> MTLBuffer? {
  guard length > 0 else { return nil }
  return device.makeBuffer(bytes: bytes, length: length, options: .storageModeShared)
}

func matrixFrom(_ array: Float32Array) -> simd_float4x4 {
  var matrix = matrix_identity_float4x4
  guard array.length >= 16 else { return matrix }
  withUnsafeMutableBytes(of: &matrix) { destination in
    destination.copyMemory(from: UnsafeRawBufferPointer(start: array.rawPointer, count: 64))
  }
  return matrix
}

public class CadPreviewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CadPreview")

    Function("createScene") { () -> PreviewScene in
      PreviewScene()
    }

    Class(PreviewScene.self) {
      Function("setMesh") { (scene: PreviewScene, positions: Float32Array, normals: Float32Array, indices: Uint32Array) in
        scene.replaceMesh(positions: positions, normals: normals, indices: indices)
      }
      Function("setLines") { (scene: PreviewScene, lines: Float32Array) in
        scene.replaceLines(lines)
      }
      Function("setHighlight") { (scene: PreviewScene, start: Int, count: Int, red: Double, green: Double, blue: Double, selectedRed: Double, selectedGreen: Double, selectedBlue: Double) in
        scene.replaceHighlight(
          start: start,
          count: count,
          base: SIMD3(Float(red), Float(green), Float(blue)),
          selected: SIMD3(Float(selectedRed), Float(selectedGreen), Float(selectedBlue))
        )
      }
      Function("setCamera") { (scene: PreviewScene, mvp: Float32Array, red: Double, green: Double, blue: Double) in
        scene.replaceCamera(matrixFrom(mvp), clear: SIMD3(Float(red), Float(green), Float(blue)))
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
