import { Context, Layer } from "effect"
import type { IsolationOptions } from "./nikcli/isolation.ts"
import type { HostLogSink } from "./nikcli/logs.ts"

export interface AiConfigShape {
  /** Application data directory (the embedded host's state lives under `<dataDir>/ai/nikcli`). */
  readonly dataDir: string
  /** Route every call through the AI gateway even when a vendor key exists. */
  readonly forceGateway: boolean
  readonly isolation?: IsolationOptions
  /** Receives the embedded host's own log lines (default: dropped except warn/error at debug level). */
  readonly hostLogs?: HostLogSink
}

/**
 * Plain configuration for the AI layer. The sidecar reads its `Config` once and
 * provides this (this package never reads `process.env` for configuration).
 */
export class AiConfig extends Context.Service<AiConfig, AiConfigShape>()("cadcamfun/AiConfig") {
  static layer = (config: AiConfigShape): Layer.Layer<AiConfig> => Layer.succeed(AiConfig, AiConfig.of(config))
}
