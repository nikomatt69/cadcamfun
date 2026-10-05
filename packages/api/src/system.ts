import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

/**
 * Legacy health probe. It is public in the legacy app (the `auth` column of
 * `/api/health` is empty in specs/api-inventory.md), so it keeps its own group instead
 * of riding on the authenticated system routes below.
 */
export class HealthGroup extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/api/health", { success: Schema.Struct({ status: Schema.String, timestamp: Schema.String }) })
) {}

/** Native boot contract: `/health` is the desktop handshake probe, `/version` the build id. */
export class SystemGroup extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("ready", "/health", { success: Schema.Struct({ status: Schema.String, timestamp: Schema.String }) }),
  HttpApiEndpoint.get("version", "/version", { success: Schema.Struct({ version: Schema.String }) })
) {}
