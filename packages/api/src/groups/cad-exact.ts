import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"
import { CadAssemblyReport, CadAssemblyRequest, CadExactAnalysis, CadExactRequest, CadExactStep, CadExactStepRequest, CadSetupsReport, CadSetupsRequest } from "../cad-exact.ts"

/**
 * The exact B-rep kernel (`@cadcamfun/core` `brep`) behind HTTP, so the sidecar, plugins and the assistant read the drawing the
 * way the CAD canvas and the CAM planner do: exact mass properties, validity, recognised holes and how a solid will be machined
 * (`analyze`), the drawing as one STEP AP214 file (`step`), and interference, bill of materials, joints and missing fasteners
 * of the assembly (`assembly`), and the manual three-axis setups each solid needs (`setups`). Each takes the elements in the body or the id of a stored drawing.
 */
export class CadExactGroup extends HttpApiGroup.make("cadExact")
  .add(
    HttpApiEndpoint.post("analyze", "/api/cad/exact/analyze", { payload: CadExactRequest, success: CadExactAnalysis, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("step", "/api/cad/exact/step", { payload: CadExactStepRequest, success: CadExactStep, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("assembly", "/api/cad/exact/assembly", { payload: CadAssemblyRequest, success: CadAssemblyReport, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.post("setups", "/api/cad/exact/setups", { payload: CadSetupsRequest, success: CadSetupsReport, error: [BadRequest, Forbidden, NotFound, InternalError] })
  )
{}
