import { z } from "zod"
import { cam } from "@cadcamfun/core"
import { analyzeGcode } from "../gcode-analysis.ts"
import { defineTool } from "./define.ts"

export const camAnalyzeGcode = defineTool("cam_analyze_gcode", {
  parameters: z.object({ gcode: z.string().min(1), machineType: z.enum(["mill", "lathe", "3dprinter"]).optional() }),
  execute: async ({ gcode, machineType }, { handlers, projectId }) => {
    const report = analyzeGcode(gcode, await handlers.machine?.(projectId))
    if (machineType === undefined) return report
    // The checks of the line scanner plus the ones that follow from the machine's own axes and what rotates.
    const axes = cam.checkAxes(gcode, machineType).map((issue) => ({ severity: issue.severity, code: issue.code, line: issue.line, message: issue.message }))
    return { ...report, machineType, issues: [...report.issues, ...axes] }
  }
})
