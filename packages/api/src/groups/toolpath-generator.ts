import { cam } from "@cadcamfun/core"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError } from "../errors.ts"
import { CamKernelPlanResult, CamKernelRequest, CamKernelResult, CamProgressTarget } from "../cam-kernel.ts"
import { CamJobRequest, CamJobResult } from "../ai-cam-job.ts"
import { CamLatheInput, CamLatheResult } from "../ai-cam-breadth.ts"
import { CamVerifyNcRequest, CamVerifyNcResult } from "../cam-verify-nc.ts"

const g = cam.generator
const v = cam.verify

/** The generate request plus where to announce its steps (a `cam.progress` frame per step); the progress target is not part of the job. */
export const GenerateRequestWithProgress = Schema.Struct({ ...g.GenerateRequestSchema.fields, progress: Schema.optionalKey(CamProgressTarget) })

/**
 * Toolpath generator (legacy `ToolpathGenerator` panel): the legacy app generated G-code in the browser;
 * v6 runs the same logic in `@cadcamfun/core` behind these three routes so the UI, the AI tools and plugins
 * share one implementation. Bodies are the core Schemas, so a field added there is typed on both sides.
 * `verify` replays G-code or IR against a stock model (removal, collisions, gouges) for the UI and the AI tools.
 * `verifyNc` replays NC the kernel did not write (any CAM system, any post) against the part, the stock and the tools in the
 * spindle on the tri-dexel stock: gouges with their first NC line, leftover, rapids through material, machine travel.
 * `plan` answers what `manufacture` would run without running it; `job` plans or runs a multi-setup job with its claims; `lathe` plans,
 * writes and replays a lathe program. Every kernel route runs in the kernel worker queue (bounded, cancelled with the request).
 */
export class ToolpathGeneratorGroup extends HttpApiGroup.make("toolpathGenerator")
  .add(HttpApiEndpoint.post("manufacture", "/api/toolpaths/manufacture", {
    payload: CamKernelRequest, success: CamKernelResult, error: [BadRequest, InternalError]
  }))
  .add(
    HttpApiEndpoint.post("plan", "/api/toolpaths/plan", { payload: CamKernelRequest, success: CamKernelPlanResult, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("job", "/api/cam/jobs", { payload: CamJobRequest, success: CamJobResult, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("lathe", "/api/cam/lathe", { payload: CamLatheInput, success: CamLatheResult, error: [BadRequest, InternalError] })
  )
  .add(
    HttpApiEndpoint.post("generate", "/api/toolpaths/generate", {
      payload: GenerateRequestWithProgress, success: g.GenerateResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("suggest", "/api/toolpaths/suggest", {
      payload: g.SuggestRequestSchema, success: g.SuggestResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("parse", "/api/toolpaths/parse", {
      payload: g.ParseRequestSchema, success: g.ParseResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("verify", "/api/toolpaths/verify", {
      payload: v.VerifyRequestSchema, success: v.VerifyResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("verifyNc", "/api/toolpaths/verify-nc", {
      payload: CamVerifyNcRequest, success: CamVerifyNcResult, error: [BadRequest, InternalError]
    })
  )
{}
