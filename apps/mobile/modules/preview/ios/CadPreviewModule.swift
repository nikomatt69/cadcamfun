import ExpoModulesCore
import Metal
import QuartzCore

/**
 * Scene owned by JavaScript.
 *
 * Uploads are copied into private Metal buffers during the call. The view draws the latest
 * snapshot and does not orbit, pick, or keep a pointer into a JavaScript array. A rejected
 * upload drops that buffer and sets a stable fault; it never reaches `drawIndexedPrimitives`.
 * The machine adds two more pairs of buffers (static bodies, spindle bodies); `replaceSpin` runs
 * a display link that advances their display angle while the spindle turns.
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
  /// Machine bodies (interleaved xyz / normal xyz / rgba). Opaque triangles come first, translucent after them.
  var solids: MTLBuffer?
  var solidIndices: MTLBuffer?
  var solidVertices = 0
  var solidTriangles = 0
  var solidOpaqueTriangles = 0
  /// The bodies that turn with the spindle: the view rotates them about the display x axis by `spinAngle`.
  var spindle: MTLBuffer?
  var spindleIndices: MTLBuffer?
  var spindleVertices = 0
  var spindleTriangles = 0
  var spindleOpaqueTriangles = 0
  var spinRate: Float = 0
  var spinAngle: Float = 0
  /// Main-thread only; the display link drives the angle while `spinRate` is not zero.
  private var spinLink: CADisplayLink?
  private var spinTarget: SpinLinkTarget?
  private var spinLastAt: CFTimeInterval = 0
  /// Simulation progress over the line buffer; `travelledVertices < 0` draws the whole path at full colour.
  var travelledVertices = -1
  var pathVertices = 0
  var remainingFade: Float = 0
  var eye = SIMD3<Float>(0, 0, 1)
  var mvp = matrix_identity_float4x4
  var clear = SIMD3<Float>(0.08, 0.09, 0.1)
  var baseColor = SIMD4<Float>(0.72, 0.75, 0.8, 1)
  var selectedColor = SIMD4<Float>(0.95, 0.55, 0.22, 1)
  var selectedStart = 0
  var selectedCount = 0
  var meshFault: String?
  var lineFault: String?
  var solidFault: String?

  deinit {
    spinLink?.invalidate()
    spinLink = nil
    spinTarget = nil
    lock.lock()
    positions = nil
    normals = nil
    indices = nil
    lines = nil
    active = nil
    overlay = nil
    solids = nil
    solidIndices = nil
    spindle = nil
    spindleIndices = nil
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
    activeVertices = line.length / 6
    lock.unlock()
    redraw()
  }

  /// Machine bodies (spec 31 §5): opaque triangles first, translucent (assumed) triangles after `opaqueTriangles`.
  /// An empty pair clears the set; a refused payload drops both sets, because half a machine misleads.
  func replaceSolids(vertices: Float32Array, indices: Uint32Array, opaqueTriangles: Int) {
    publishSolidSet(spindle: false, vertices: vertices, indices: indices, opaqueTriangles: opaqueTriangles)
  }

  /// The bodies that turn with the spindle (lathe bar and chuck, mill tool): drawn rotated about the display x axis.
  func replaceSpindle(vertices: Float32Array, indices: Uint32Array, opaqueTriangles: Int) {
    publishSolidSet(spindle: true, vertices: vertices, indices: indices, opaqueTriangles: opaqueTriangles)
  }

  /// Signed display revolutions per second the spindle turns; a display link advances the angle while it is not zero.
  func replaceSpin(rate: Double) {
    let limit = PreviewLimits.maxSpinRevPerSecond
    let value = rate.isFinite ? min(max(Float(rate), -limit), limit) : 0
    lock.lock()
    let changed = value != spinRate
    spinRate = value
    lock.unlock()
    guard changed else { return }
    updateSpinLink()
  }

  /// Fades path vertices `[travelled, path)` toward the background; stock edges after `path` stay untouched.
  func replaceProgress(travelled: Int, path: Int, fade: Float) {
    lock.lock()
    travelledVertices = travelled < 0 ? -1 : travelled - travelled % 2
    pathVertices = max(0, path - path % 2)
    remainingFade = min(max(fade.isFinite ? fade : 0, 0), 1)
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
      solids: solids,
      solidIndices: solidIndices,
      solidVertices: solidVertices,
      solidTriangles: solidTriangles,
      solidOpaqueTriangles: solidOpaqueTriangles,
      spindle: spindle,
      spindleIndices: spindleIndices,
      spindleVertices: spindleVertices,
      spindleTriangles: spindleTriangles,
      spindleOpaqueTriangles: spindleOpaqueTriangles,
      spinAngle: spinAngle,
      travelledVertices: travelledVertices,
      pathVertices: pathVertices,
      remainingFade: remainingFade,
      eye: eye,
      mvp: mvp,
      clear: clear,
      baseColor: baseColor,
      selectedColor: selectedColor,
      selectedStart: selectedStart,
      selectedCount: selectedCount,
      meshFault: meshFault,
      lineFault: lineFault,
      solidFault: solidFault
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

  private func publishSolidSet(spindle: Bool, vertices: Float32Array, indices: Uint32Array, opaqueTriangles: Int) {
    guard let device else {
      rejectSolids("This iPhone has no Metal device for the preview")
      return
    }
    if vertices.length == 0 && indices.length == 0 {
      publishSolids(spindle: spindle, vertices: nil, indices: nil, vertexCount: 0, triangles: 0, opaqueTriangles: 0, fault: nil)
      return
    }
    if let rejection = PreviewUpload.solids(vertices, indices, opaqueTriangles: opaqueTriangles) {
      previewLog.error("Rejected machine upload: \(rejection.message, privacy: .public)")
      rejectSolids(rejection.message)
      return
    }
    guard
      let nextVertices = metalBuffer(vertices.rawPointer, vertices.byteLength, device, spindle ? "com.cadcamfun.preview.spindle" : "com.cadcamfun.preview.solids"),
      let nextIndices = metalBuffer(indices.rawPointer, indices.byteLength, device, spindle ? "com.cadcamfun.preview.spindle-indices" : "com.cadcamfun.preview.solid-indices")
    else {
      rejectSolids(PreviewRejection.meshInvalid.message)
      return
    }
    publishSolids(
      spindle: spindle,
      vertices: nextVertices,
      indices: nextIndices,
      vertexCount: vertices.length / PreviewLimits.solidVertexFloats,
      triangles: indices.length / 3,
      opaqueTriangles: opaqueTriangles,
      fault: nil
    )
  }

  /// One refused machine payload drops both sets: a body set and its spindle belong to the same scene.
  private func rejectSolids(_ message: String) {
    publishSolids(spindle: false, vertices: nil, indices: nil, vertexCount: 0, triangles: 0, opaqueTriangles: 0, fault: message)
    publishSolids(spindle: true, vertices: nil, indices: nil, vertexCount: 0, triangles: 0, opaqueTriangles: 0, fault: message)
  }

  private func publishSolids(spindle: Bool, vertices vertexBuffer: MTLBuffer?, indices indexBuffer: MTLBuffer?, vertexCount: Int, triangles: Int, opaqueTriangles: Int, fault: String?) {
    let alive = vertexCount > 0 && triangles > 0
    let count = alive ? triangles : 0
    let opaque = alive ? min(max(opaqueTriangles, 0), triangles) : 0
    lock.lock()
    if spindle {
      self.spindle = alive ? vertexBuffer : nil
      self.spindleIndices = alive ? indexBuffer : nil
      self.spindleVertices = alive ? vertexCount : 0
      self.spindleTriangles = count
      self.spindleOpaqueTriangles = opaque
    } else {
      self.solids = alive ? vertexBuffer : nil
      self.solidIndices = alive ? indexBuffer : nil
      self.solidVertices = alive ? vertexCount : 0
      self.solidTriangles = count
      self.solidOpaqueTriangles = opaque
    }
    solidFault = fault
    lock.unlock()
    redraw()
  }

  /// Starts or stops the display link for the current rate; a stopped spindle still draws once more.
  private func updateSpinLink() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.lock.lock()
      let running = self.spinRate != 0
      self.lock.unlock()
      if running, self.spinLink == nil {
        self.spinLastAt = CACurrentMediaTime()
        let target = SpinLinkTarget(scene: self)
        let link = CADisplayLink(target: target, selector: #selector(SpinLinkTarget.step(_:)))
        link.add(to: .main, forMode: .common)
        self.spinTarget = target
        self.spinLink = link
      } else if !running, let link = self.spinLink {
        self.spinLink = nil
        self.spinTarget = nil
        self.spinLastAt = 0
        link.invalidate()
      }
      self.redraw()
    }
  }

  /// One display frame of spin: a long gap (background, a hitch) advances the angle by at most 0.1 s.
  @objc fileprivate func stepSpin(_ link: CADisplayLink) {
    let now = link.timestamp
    let elapsed = spinLastAt > 0 ? min(max(now - spinLastAt, 0), 0.1) : 0
    spinLastAt = now
    lock.lock()
    let angle = spinAngle + spinRate * Float(2 * Double.pi) * Float(elapsed)
    spinAngle = angle.isFinite ? angle.truncatingRemainder(dividingBy: 2 * .pi) : 0
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
  let solids: MTLBuffer?
  let solidIndices: MTLBuffer?
  let solidVertices: Int
  let solidTriangles: Int
  let solidOpaqueTriangles: Int
  let spindle: MTLBuffer?
  let spindleIndices: MTLBuffer?
  let spindleVertices: Int
  let spindleTriangles: Int
  let spindleOpaqueTriangles: Int
  let spinAngle: Float
  let travelledVertices: Int
  let pathVertices: Int
  let remainingFade: Float
  let eye: SIMD3<Float>
  let mvp: simd_float4x4
  let clear: SIMD3<Float>
  let baseColor: SIMD4<Float>
  let selectedColor: SIMD4<Float>
  let selectedStart: Int
  let selectedCount: Int
  let meshFault: String?
  let lineFault: String?
  let solidFault: String?
}

/// CADisplayLink retains its target. This proxy holds the scene weakly, so a scene released while the spindle
/// still turns can deallocate and invalidate the link in its `deinit` instead of being kept alive by the run loop.
private final class SpinLinkTarget: NSObject {
  weak var scene: PreviewScene?

  init(scene: PreviewScene) {
    self.scene = scene
    super.init()
  }

  @objc func step(_ link: CADisplayLink) {
    scene?.stepSpin(link)
  }
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
      Function("setProgress") { (scene: PreviewScene, travelled: Int, path: Int, fade: Double) in
        scene.replaceProgress(travelled: travelled, path: path, fade: Float(fade))
      }
      Function("setOverlay") { (scene: PreviewScene, lines: Float32Array) in
        scene.replaceOverlay(lines)
      }
      Function("setActiveLine") { (scene: PreviewScene, line: Float32Array) in
        scene.replaceActiveLine(line)
      }
      Function("setSolids") { (scene: PreviewScene, vertices: Float32Array, indices: Uint32Array, opaqueTriangles: Int) in
        scene.replaceSolids(vertices: vertices, indices: indices, opaqueTriangles: opaqueTriangles)
      }
      Function("setSpindle") { (scene: PreviewScene, vertices: Float32Array, indices: Uint32Array, opaqueTriangles: Int) in
        scene.replaceSpindle(vertices: vertices, indices: indices, opaqueTriangles: opaqueTriangles)
      }
      Function("setSpin") { (scene: PreviewScene, rate: Double) in
        scene.replaceSpin(rate: rate)
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
