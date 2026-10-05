import { Config, Context, Effect, Layer, Redacted } from "effect"

export interface AppConfig {
  readonly token: Redacted.Redacted<string>
  readonly dataDir: string
  readonly migrationsDir: string | undefined
  readonly version: string
  /** Base URL the auth e-mail links point at (legacy `NEXTAUTH_URL`). */
  readonly appUrl?: string
  /** Echo reset/magic links in the response, as the legacy handlers did in development. */
  readonly debugLinks?: boolean
}

/** Single place that reads the environment (see specs/05 §1). */
export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("cadcamfun/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfigService,
    Effect.gen(function*() {
      const token = yield* Config.redacted("CADCAMFUN_TOKEN")
      const dataDir = yield* Config.string("CADCAMFUN_DATA_DIR")
      const migrationsDir = yield* Config.option(Config.string("CADCAMFUN_MIGRATIONS_DIR"))
      const appUrl = yield* Config.option(Config.string("CADCAMFUN_APP_URL"))
      const debugLinks = yield* Config.withDefault(Config.boolean("CADCAMFUN_DEBUG_LINKS"), false)
      return AppConfigService.of({
        ...(appUrl._tag === "Some" ? { appUrl: appUrl.value } : {}),
        debugLinks,
        token,
        dataDir,
        migrationsDir: migrationsDir._tag === "Some" ? migrationsDir.value : undefined,
        version: "6.0.0"
      })
    })
  )
}
