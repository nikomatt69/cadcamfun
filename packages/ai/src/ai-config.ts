import { Context, Layer } from "effect"
import type { IsolationOptions } from "./nikcli/isolation.ts"
import type { LocaleEnv } from "./nikcli/locale.ts"
import type { HostLogSink } from "./nikcli/logs.ts"
import type { PolicyStatement } from "./nikcli/policy.ts"
import type { CacheRetention } from "./transform.ts"

export interface AiConfigShape {
  /** Application data directory (the embedded host's state lives under `<dataDir>/ai/nikcli`). */
  readonly dataDir: string
  /** Route every call through the AI gateway even when a vendor key exists. */
  readonly forceGateway: boolean
  readonly isolation?: IsolationOptions
  /**
   * `ai.cacheRetention`: `short` (default) asks the provider for its 5-minute cache entry, `long` for the 1-hour entry. The direct
   * path reads it here; the host reads it from `isolation.cacheRetention` (`NIKCLI_CACHE_RETENTION`), so set both from one setting.
   */
  readonly cacheRetention?: CacheRetention
  /** Receives the embedded host's own log lines (default: dropped except warn/error at debug level). */
  readonly hostLogs?: HostLogSink
  /** nikcli resource policy (`provider.use`, `tool.use`); the direct route and the host both honour it. Omitted: allow all. */
  readonly policies?: ReadonlyArray<PolicyStatement>
  /** The locale variables of the environment (`LocaleEnvConfig`), read once by the host; the reply language follows them. */
  readonly localeEnv?: LocaleEnv
}

/**
 * Plain configuration for the AI layer. The sidecar reads its `Config` once and
 * provides this (this package never reads `process.env` for configuration).
 */
export class AiConfig extends Context.Service<AiConfig, AiConfigShape>()("cadcamfun/AiConfig") {
  static layer = (config: AiConfigShape): Layer.Layer<AiConfig> => Layer.succeed(AiConfig, AiConfig.of(config))
}
