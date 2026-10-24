/**
 * Simultaneous 5-axis program for the generator panel (`multiaxis`): the selected solids become one part, the 5-axis
 * engine (`../operations/multiaxis.ts`) cuts it, and the program is written by the **post of the machine's controller**
 * (`haas` for the UMC, which writes `G234 H` for the tool centre point and `G43` after it), not by hand here.
 *
 * It needs a 5-axis machine: without one, or with a controller that has no post able to drive rotary axes, nothing is
 * generated and the reason is returned as the error (the same shape as the other operations' errors).
 */
import { Schema } from "effect"
import { makeProgram, type Toolpath } from "../ir.ts"
import { fiveAxisKinematic } from "../five-axis.ts"
import { partMeshes } from "../model/model.ts"
import { TriangleSoup } from "../model/mesh-queries.ts"
import { MultiaxisParams, generateMultiaxis } from "../operations/multiaxis.ts"
import { getPost, type PostId } from "../post/index.ts"
import type { Tool } from "../tool.ts"
import { originShift } from "./dispatch.ts"
import { flattenElements, shiftElement, topOf } from "./elements.ts"
import { f3 } from "./common.ts"
import { isSolidElement } from "./surface.ts"
import type { CadElement, GeometryInput, MachineForProgram, ToolpathSettings } from "./schema.ts"

export interface MultiaxisOutcome {
  readonly gcode: string
  readonly warnings: ReadonlyArray<string>
  readonly error?: string
}

const fail = (error: string): MultiaxisOutcome => ({ gcode: `; Error: ${error}\n`, warnings: [], error })

const toolOf = (s: ToolpathSettings): Tool => ({
  id: "1",
  name: `${s.toolType} ${s.toolDiameter}`,
  kind: s.toolType === "ballnose" ? "ballnose" : "endmill",
  diameter: s.toolDiameter,
  flutes: s.flutes,
  maxRpm: Math.max(s.rpm, 1)
})

export const multiaxisProgram = (
  s: ToolpathSettings,
  g: GeometryInput,
  machine: MachineForProgram | undefined,
  options: { readonly stamp?: string } = {}
): MultiaxisOutcome => {
  if (machine === undefined || machine.fiveAxis === undefined) {
    return fail("The multi-axis operation needs a 5-axis machine with a rotary table: select one in the machine library.")
  }
  const post = getPost(machine.controller as PostId)
  if (post === undefined) {
    return fail(`No post processor for the controller "${machine.controller}" can drive rotary axes; use the Haas (5-axis) post.`)
  }
  const flat = flattenElements(g.selectedElements as ReadonlyArray<CadElement>)
  const solids = flat.filter(isSolidElement)
  if (solids.length === 0) return fail("The multi-axis operation needs selected solids to cut.")

  // Placed on the stock like the 3-axis surface: highest face at the stock top, XY from the machine origin.
  const stock = g.stock
  const { dx, dy } = originShift(s, g)
  const groupTop = Math.max(...flat.map(topOf))
  const dz = stock ? stock.topZ - groupTop : 0
  const placed = solids.map((e) => shiftElement(shiftElement(e, 0, 0, dz), dx, dy, 0))
  const model = partMeshes(placed as never, { tolerance: Math.max(0.005, s.tolerance / 2) })
  if (model === undefined) return fail("None of the selected elements is a solid the 5-axis engine can cut.")

  const probe = new TriangleSoup(model.meshes, 1)
  const { min, max } = probe.bounds
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const soup = new TriangleSoup(model.meshes, Math.max(0.5, diagonal / 200))
  const topZ = stock?.topZ ?? max[2]
  const tool = toolOf(s)
  const params = Schema.decodeUnknownSync(MultiaxisParams)({
    id: "multiaxis",
    name: `5-axis ${s.fiveAxisStrategy} ${s.toolType} ${f3(s.toolDiameter)}`,
    clearanceHeight: topZ + 10,
    safeHeight: topZ + 5,
    retractHeight: topZ + 2,
    totalDepth: s.depth,
    stepdown: s.stepdown,
    feed: s.feedrate,
    plungeFeed: s.plungerate,
    spindleRpm: s.rpm,
    coolant: s.coolant ? "flood" : "off",
    strategy: s.fiveAxisStrategy,
    stepover: s.stepover,
    scallop: s.scallop,
    angle: s.rasterAngle,
    oneWay: s.rasterOneWay,
    toolAxis: s.fiveAxisToolAxis,
    lead: s.fiveAxisLead,
    tilt: s.fiveAxisTilt,
    gouge: s.fiveAxisGouge,
    tolerance: Math.max(s.tolerance, 0.001)
  })

  const fiveAxis = machine.fiveAxis
  const kinematic = fiveAxisKinematic({
    layout: fiveAxis.layout,
    limits: {
      tilt: [fiveAxis.tilt.min, fiveAxis.tilt.max],
      ...(fiveAxis.rotation !== undefined ? { rotation: [fiveAxis.rotation.min, fiveAxis.rotation.max] as const } : {})
    },
    pivot: fiveAxis.pivot ?? { x: 0, y: 0, z: 0 },
    tcp: fiveAxis.tcp
  })
  const result = generateMultiaxis(params, soup, tool, kinematic)
  const toolpath: Toolpath = result.toolpath
  const warnings = [...model.warnings, ...result.warnings]
  if (result.stats.skipped > 0) {
    warnings.push(`${result.stats.skipped} point(s) left out: the table cannot reach that tool axis, or every lean gouges the part`)
  }
  if (result.stats.sections === 0) return { ...fail("No point of the part can be reached by this tool at the allowed tool axes."), warnings }

  const program = makeProgram(`5-axis ${machine.name || machine.id}`, [toolpath], {
    workOffset: s.workOffset,
    metadata: {
      Machine: machine.name || machine.id,
      Kinematics: `${kinematic.layout}, ${kinematic.tcp === "control" ? "control TCP" : "machine coordinates"}`,
      Points: String(result.stats.points),
      Sections: String(result.stats.sections),
      Leaned: String(result.stats.leaned)
    }
  })
  try {
    // A machine whose control has no tool-centre-point control gets machine coordinates and none of its words.
    const gcode = post.emit(program, { ...(options.stamp !== undefined ? { stamp: options.stamp } : {}), tcp: kinematic.tcp === "control" })
    return { gcode, warnings }
  } catch (cause) {
    return { ...fail(cause instanceof Error ? cause.message : String(cause)), warnings }
  }
}
