import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound } from "../errors.ts"
import { CamSetupDocument, CamSetupGenerated, CamSetupGenerateRequest, CamSetupGenerateSavedRequest, CamSetupPlan, CamSetupRequest, CamSetupSaveBody, CamSetupUpdateBody, CamSetupValidation } from "../cam-setup.ts"

const project = { id: Schema.String }
const document = { id: Schema.String, setupId: Schema.String }

/**
 * Multi-operation setups (spec 14): a setup is operations with their tools in machining order. `plan` is a dry run that needs no
 * geometry (programs, pockets, tool loads), `validate` lists the problems row by row, `generate` writes the programs: each
 * operation through the generator, one program emitted once by the post with the tool changes inside it.
 */
export class CamSetupGroup extends HttpApiGroup.make("camSetup")
  .add(
    HttpApiEndpoint.post("plan", "/api/cam/setups/plan", { payload: CamSetupRequest, success: CamSetupPlan, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("validate", "/api/cam/setups/validate", { payload: CamSetupRequest, success: CamSetupValidation, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("generate", "/api/cam/setups/generate", { payload: CamSetupGenerateRequest, success: CamSetupGenerated, error: [BadRequest, InternalError] }),
    // The saved setups of a project: one document each, revisioned by `updatedAt` like drawings and components.
    HttpApiEndpoint.get("list", "/api/projects/:id/cam-setups", { params: project, success: Schema.Array(CamSetupDocument), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("save", "/api/projects/:id/cam-setups", {
      params: project, payload: CamSetupSaveBody, success: CamSetupDocument.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/projects/:id/cam-setups/:setupId", { params: document, success: CamSetupDocument, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/projects/:id/cam-setups/:setupId", {
      params: document, payload: CamSetupUpdateBody, success: CamSetupDocument, error: [BadRequest, Forbidden, NotFound, Conflict, InternalError]
    }),
    // A saved setup posted: the same planning and generation as the stateless routes, over the setup as stored.
    HttpApiEndpoint.get("planSaved", "/api/projects/:id/cam-setups/:setupId/plan", { params: document, success: CamSetupPlan, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("generateSaved", "/api/projects/:id/cam-setups/:setupId/generate", {
      params: document, payload: CamSetupGenerateSavedRequest, success: CamSetupGenerated, error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/projects/:id/cam-setups/:setupId", {
      params: document, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, NotFound, InternalError]
    })
  )
{}
