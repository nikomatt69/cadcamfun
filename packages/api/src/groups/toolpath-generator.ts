import { cam } from "@cadcamfun/core"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError } from "../errors.ts"

const g = cam.generator

/**
 * Toolpath generator (legacy `ToolpathGenerator` panel): the legacy app generated G-code in the browser;
 * v6 runs the same logic in `@cadcamfun/core` behind these three routes so the UI, the AI tools and plugins
 * share one implementation. Bodies are the core Schemas, so a field added there is typed on both sides.
 */
export class ToolpathGeneratorGroup extends HttpApiGroup.make("toolpathGenerator")
  .add(
    HttpApiEndpoint.post("generate", "/api/toolpaths/generate", {
      payload: g.GenerateRequestSchema, success: g.GenerateResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("suggest", "/api/toolpaths/suggest", {
      payload: g.SuggestRequestSchema, success: g.SuggestResponseSchema, error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("parse", "/api/toolpaths/parse", {
      payload: g.ParseRequestSchema, success: g.ParseResponseSchema, error: [BadRequest, InternalError]
    })
  )
{}
