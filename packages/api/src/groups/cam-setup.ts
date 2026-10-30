import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError } from "../errors.ts"
import { CamSetupGenerated, CamSetupGenerateRequest, CamSetupPlan, CamSetupRequest, CamSetupValidation } from "../cam-setup.ts"

/**
 * Multi-operation setups (spec 14): a setup is operations with their tools in machining order. `plan` is a dry run that needs no
 * geometry (programs, pockets, tool loads), `validate` lists the problems row by row, `generate` writes the programs: each
 * operation through the generator, one program emitted once by the post with the tool changes inside it.
 */
export class CamSetupGroup extends HttpApiGroup.make("camSetup")
  .add(
    HttpApiEndpoint.post("plan", "/api/cam/setups/plan", { payload: CamSetupRequest, success: CamSetupPlan, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("validate", "/api/cam/setups/validate", { payload: CamSetupRequest, success: CamSetupValidation, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("generate", "/api/cam/setups/generate", { payload: CamSetupGenerateRequest, success: CamSetupGenerated, error: [BadRequest, InternalError] })
  )
{}
