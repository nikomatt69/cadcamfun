import { z } from "zod"
import { cam } from "@cadcamfun/core"
import { defineTool } from "./define.ts"

/** Pure: reads the kinematics table, needs no project data. */
export const camDescribeMachine = defineTool("cam_describe_machine", {
  parameters: z.object({ machineType: z.enum(["mill", "lathe", "3dprinter"]) }),
  execute: async ({ machineType }) => ({ ...cam.kinematicsOf(machineType), origins: cam.ORIGINS[machineType] })
})
