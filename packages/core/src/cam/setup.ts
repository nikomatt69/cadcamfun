import { cross3, dot3, length3, type Vec3 } from "../cad/vec.ts"
import type { SolidBounds } from "../cad/solid.ts"

export interface WorkFrame {
  readonly origin: Vec3
  readonly xAxis: Vec3
  readonly yAxis: Vec3
  readonly zAxis: Vec3
}

export interface ToolAssembly {
  readonly toolId: string
  readonly cuttingDiameter: number
  readonly cuttingLength: number
  readonly stickout: number
  readonly holderDiameter: number
  readonly holderLength: number
}

export interface ManufacturingSetup {
  readonly id: string
  readonly revision: number
  readonly frame: WorkFrame
  /** Stock and fixture envelopes are in world coordinates. */
  readonly stock: SolidBounds
  readonly fixtures: ReadonlyArray<{ readonly id: string; readonly bounds: SolidBounds }>
  readonly tools: ReadonlyArray<ToolAssembly>
}

export interface SetupIssue {
  readonly field: string
  readonly message: string
}

const finitePoint = (point: Vec3): boolean => [point.x, point.y, point.z].every(Number.isFinite)

export const validateWorkFrame = (frame: WorkFrame): ReadonlyArray<SetupIssue> => {
  const issues: SetupIssue[] = []
  if (![frame.origin, frame.xAxis, frame.yAxis, frame.zAxis].every(finitePoint)) {
    return [{ field: "frame", message: "Work frame coordinates must be finite" }]
  }
  const axes = [frame.xAxis, frame.yAxis, frame.zAxis]
  if (axes.some((axis) => Math.abs(length3(axis) - 1) > 1e-9) ||
    Math.abs(dot3(frame.xAxis, frame.yAxis)) > 1e-9 ||
    Math.abs(dot3(frame.yAxis, frame.zAxis)) > 1e-9 ||
    Math.abs(dot3(frame.zAxis, frame.xAxis)) > 1e-9 ||
    Math.abs(dot3(cross3(frame.xAxis, frame.yAxis), frame.zAxis) - 1) > 1e-9) {
    issues.push({ field: "frame", message: "Work frame axes must be orthonormal and right-handed" })
  }
  return issues
}

const assertFramePoint = (frame: WorkFrame, point: Vec3): void => {
  if (validateWorkFrame(frame).length > 0 || !finitePoint(point)) throw new RangeError("Invalid rigid work frame or point")
}

export const workToWorld = (frame: WorkFrame, point: Vec3): Vec3 => {
  assertFramePoint(frame, point)
  const result = {
    x: frame.origin.x + frame.xAxis.x * point.x + frame.yAxis.x * point.y + frame.zAxis.x * point.z,
    y: frame.origin.y + frame.xAxis.y * point.x + frame.yAxis.y * point.y + frame.zAxis.y * point.z,
    z: frame.origin.z + frame.xAxis.z * point.x + frame.yAxis.z * point.y + frame.zAxis.z * point.z
  }
  if (!finitePoint(result)) throw new RangeError("Coordinate conversion overflow")
  return result
}

export const worldToWork = (frame: WorkFrame, point: Vec3): Vec3 => {
  assertFramePoint(frame, point)
  const delta = { x: point.x - frame.origin.x, y: point.y - frame.origin.y, z: point.z - frame.origin.z }
  const result = { x: dot3(delta, frame.xAxis), y: dot3(delta, frame.yAxis), z: dot3(delta, frame.zAxis) }
  if (!finitePoint(result)) throw new RangeError("Coordinate conversion overflow")
  return result
}

export const validateSetup = (setup: ManufacturingSetup): ReadonlyArray<SetupIssue> => {
  const issues = [...validateWorkFrame(setup.frame)]
  const add = (field: string, message: string) => issues.push({ field, message })
  if (setup.id.trim().length === 0) add("id", "Setup ID must not be empty")
  if (!Number.isSafeInteger(setup.revision) || setup.revision < 0) add("revision", "Setup revision must be a non-negative safe integer")
  const checkBounds = (bounds: SolidBounds, field: string) => {
    if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ].every(Number.isFinite) ||
      bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY || bounds.minZ >= bounds.maxZ) {
      add(field, "Envelope must have finite coordinates and positive volume")
    }
  }
  checkBounds(setup.stock, "stock")
  const fixtures = new Set<string>()
  for (const fixture of setup.fixtures) {
    if (!fixture.id.trim() || fixtures.has(fixture.id)) add(`fixtures.${fixture.id}`, "Fixture IDs must be nonempty and unique")
    fixtures.add(fixture.id)
    checkBounds(fixture.bounds, `fixtures.${fixture.id}.bounds`)
  }
  const tools = new Set<string>()
  for (const tool of setup.tools) {
    const field = `tools.${tool.toolId}`
    if (!tool.toolId.trim() || tools.has(tool.toolId)) add(field, "Tool IDs must be nonempty and unique")
    tools.add(tool.toolId)
    if (![tool.cuttingDiameter, tool.cuttingLength, tool.stickout, tool.holderDiameter, tool.holderLength].every((n) => Number.isFinite(n) && n > 0)) {
      add(field, "Tool and holder dimensions must be positive and finite")
    }
    if (tool.cuttingLength > tool.stickout) add(field, "Cutting length must not exceed stickout")
  }
  return issues
}
