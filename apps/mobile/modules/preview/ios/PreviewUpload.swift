import ExpoModulesCore
import os

/**
 * Phone-side gate in front of Metal.
 *
 * Keep the caps and the refusal sentences aligned with `apps/mobile/lib/preview-scene.ts`.
 * A typed-array pointer is only valid for this call, so every accepted upload is copied
 * before this returns. An empty array is a clear and must not touch `rawPointer`.
 */
enum PreviewLimits {
  static let maxTriangles = 80_000
  static let maxSegments = 20_000
  static let maxStockEdges = 12
  static let maxOverlaySegments = 40_000
  static let maxActiveVertices = 4
  static var maxIndices: Int { maxTriangles * 3 }
  static var maxVertices: Int { maxTriangles * 3 }
  static var maxLineVertices: Int { (maxSegments + maxStockEdges) * 2 }
}

enum PreviewRejection {
  case meshTooLarge
  case meshInvalid
  case pathTooLarge
  case pathInvalid

  var message: String {
    switch self {
    case .meshTooLarge: return "This preview is too large for the phone."
    case .meshInvalid: return "This preview could not be drawn."
    case .pathTooLarge: return "This toolpath is too large for the phone."
    case .pathInvalid: return "This toolpath could not be drawn."
    }
  }
}

let previewLog = Logger(subsystem: "com.cadcamfun.companion", category: "preview")

enum PreviewUpload {
  static func mesh(_ positions: Float32Array, _ normals: Float32Array, _ indices: Uint32Array) -> PreviewRejection? {
    if positions.length == 0 && normals.length == 0 && indices.length == 0 { return nil }
    guard aligned(positions), aligned(normals), aligned(indices, stride: 4) else { return .meshInvalid }
    guard positions.length % 3 == 0, normals.length == positions.length, indices.length % 3 == 0 else { return .meshInvalid }
    let triangles = indices.length / 3
    let vertices = positions.length / 3
    if triangles > PreviewLimits.maxTriangles || vertices > PreviewLimits.maxVertices || indices.length > PreviewLimits.maxIndices {
      return .meshTooLarge
    }
    guard vertices > 0, finite(positions), finite(normals) else { return .meshInvalid }
    let limit = UInt32(vertices)
    for index in 0..<indices.length where indices[index] >= limit {
      return .meshInvalid
    }
    return nil
  }

  /// `length == 0` clears. Otherwise the buffer is pairs of xyzrgb vertices.
  static func lines(_ values: Float32Array) -> PreviewRejection? {
    if values.length == 0 { return nil }
    guard aligned(values), values.length % 12 == 0 else { return .pathInvalid }
    let vertices = values.length / 6
    if vertices > PreviewLimits.maxLineVertices { return .pathTooLarge }
    return finite(values) ? nil : .pathInvalid
  }

  /// Feature edges, grid and axes: pairs of xyzrgb vertices, capped separately from the path.
  static func overlay(_ values: Float32Array) -> Bool {
    if values.length == 0 { return true }
    guard aligned(values), values.length % 12 == 0, values.length / 6 <= maxOverlayVertices else { return false }
    return finite(values)
  }

  private static var maxOverlayVertices: Int { PreviewLimits.maxOverlaySegments * 2 }

  /// The highlighted move (two vertices), optionally followed by the tool axis (two more).
  static func activeLine(_ values: Float32Array) -> PreviewRejection? {
    if values.length == 0 { return nil }
    guard aligned(values), values.length == 12 || values.length == 24 else { return .pathInvalid }
    return finite(values) ? nil : .pathInvalid
  }

  static func matrix(_ values: Float32Array) -> simd_float4x4? {
    guard values.length == 16, aligned(values), finite(values) else { return nil }
    var matrix = matrix_identity_float4x4
    withUnsafeMutableBytes(of: &matrix) { destination in
      destination.copyMemory(from: UnsafeRawBufferPointer(start: values.rawPointer, count: 64))
    }
    return matrix
  }

  static func channel(_ value: Double) -> Float {
    guard value.isFinite else { return 0 }
    return min(Float(1), max(Float(0), Float(value)))
  }

  private static func aligned(_ values: Float32Array) -> Bool {
    values.byteLength == values.length * MemoryLayout<Float>.size
  }

  private static func aligned(_ values: Uint32Array, stride: Int) -> Bool {
    values.byteLength == values.length * stride
  }

  private static func finite(_ values: Float32Array) -> Bool {
    for index in 0..<values.length where !values[index].isFinite {
      return false
    }
    return true
  }
}
