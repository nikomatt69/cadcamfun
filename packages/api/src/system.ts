import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

/**
 * What the sidecar is busy with: a long generation keeps a worker for minutes while the sidecar still answers, so a probe that is
 * slow or sees running jobs is a busy sidecar, not a dead one.
 */
export const HealthSchema = Schema.Struct({
  status: Schema.String,
  timestamp: Schema.String,
  jobs: Schema.optionalKey(Schema.Struct({
    workers: Schema.Int,
    running: Schema.Int,
    waiting: Schema.Int,
    cached: Schema.Int,
    closing: Schema.Boolean
  }))
})

/**
 * Legacy health probe. It is public in the legacy app (the `auth` column of
 * `/api/health` is empty in specs/api-inventory.md), so it keeps its own group instead
 * of riding on the authenticated system routes below.
 */
export class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/api/health", { success: HealthSchema })
) {}

/** Native boot contract: `/health` is the desktop handshake probe, `/version` the build id. */
export class SystemGroup extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("ready", "/health", { success: HealthSchema }),
  HttpApiEndpoint.get("version", "/version", { success: Schema.Struct({ version: Schema.String }) })
) {}
