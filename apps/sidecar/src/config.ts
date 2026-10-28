import { LocaleEnvConfig, type LanguageModelFactory, type LocaleEnv } from "@cadcamfun/ai"
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
  /** `nikcli` (default) runs chat through the embedded host; `direct` uses the AI SDK only. */
  /** Stripe webhook signing secret (legacy `STRIPE_WEBHOOK_SECRET`); without it webhooks are refused. */
  readonly stripeWebhookSecret?: string
  /** Stripe API key (`STRIPE_SECRET_KEY`); without it paid checkout and the billing portal stay unavailable. */
  readonly stripeSecretKey?: Redacted.Redacted<string>
  /** Stripe price id per paid plan (`STRIPE_PRICE_BASIC|PRO|ENTERPRISE`). */
  readonly stripePrices?: Readonly<Record<string, string>>
  /** Test hook: Stripe API origin (defaults to `https://api.stripe.com`). */
  readonly stripeApiBase?: string
  /** Shared secret for `/api/cron/*` (legacy `CRON_SECRET`); without it the cron route is open to the local app. */
  readonly cronSecret?: string
  /** E-mail of the administrator (legacy `ADMIN_EMAIL`); the local profile is the admin of its own installation by default. */
  readonly adminEmail?: string
  readonly identityIssuer?: string
  readonly aiOffline?: boolean
  readonly aiHost?: "nikcli" | "direct"
  /** Replaces MiniMax's default endpoint for the embedded host (a regional endpoint, a corporate proxy, or a fake model in tests). */
  readonly aiMinimaxBaseUrl?: string
  /** OTLP/HTTP collector base URL (standard `OTEL_EXPORTER_OTLP_ENDPOINT`); telemetry is off without it. */
  readonly otlpEndpoint?: string
  /** Head sampling ratio for traces, 0..1 (standard `OTEL_TRACES_SAMPLER_ARG`); unset keeps every trace. */
  readonly otelSampleRatio?: number
  /** The locale variables of the environment (`LANG`, `TZ`, nikcli's `NIKCLI_LOCALE`…): the assistant's reply language. */
  readonly localeEnv: LocaleEnv
  /** A save keeps a restore point of the replaced drawing when the newest is older than this, ms (`CADCAMFUN_VERSION_INTERVAL_MS`). */
  readonly versionIntervalMs?: number
  /** Restore points kept per drawing (`CADCAMFUN_VERSION_LIMIT`). */
  readonly versionLimit?: number
  /** Test hook: replaces the vendor SDK model construction (never set in production). */
  readonly aiModelFactory?: LanguageModelFactory
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
      const identityIssuer = yield* Config.withDefault(Config.string("CADCAMFUN_IDENTITY_ISSUER"), "https://auth.cadcam.fun")
      const aiOffline = yield* Config.withDefault(Config.boolean("CADCAMFUN_AI_OFFLINE"), false)
      const aiHost = yield* Config.withDefault(Config.literals(["nikcli", "direct"], "CADCAMFUN_AI_HOST"), "nikcli" as const)
      const aiMinimaxBaseUrl = yield* Config.option(Config.string("CADCAMFUN_AI_MINIMAX_BASE_URL"))
      const stripeWebhookSecret = yield* Config.option(Config.string("STRIPE_WEBHOOK_SECRET"))
      const stripeSecretKey = yield* Config.option(Config.redacted("STRIPE_SECRET_KEY"))
      const stripePrices: Record<string, string> = {}
      for (const plan of ["BASIC", "PRO", "ENTERPRISE"]) {
        const price = yield* Config.option(Config.string(`STRIPE_PRICE_${plan}`))
        if (price._tag === "Some" && price.value.trim()) stripePrices[plan] = price.value.trim()
      }
      const cronSecret = yield* Config.option(Config.string("CRON_SECRET"))
      const adminEmail = yield* Config.option(Config.string("ADMIN_EMAIL"))
      const otlpEndpoint = yield* Config.option(Config.string("OTEL_EXPORTER_OTLP_ENDPOINT"))
      const otelSampleRatio = yield* Config.option(Config.number("OTEL_TRACES_SAMPLER_ARG"))
      const localeEnv = yield* LocaleEnvConfig
      const versionIntervalMs = yield* Config.option(Config.number("CADCAMFUN_VERSION_INTERVAL_MS"))
      const versionLimit = yield* Config.option(Config.int("CADCAMFUN_VERSION_LIMIT"))
      return AppConfigService.of({
        ...(adminEmail._tag === "Some" ? { adminEmail: adminEmail.value } : {}),
        ...(stripeWebhookSecret._tag === "Some" ? { stripeWebhookSecret: stripeWebhookSecret.value } : {}),
        ...(stripeSecretKey._tag === "Some" ? { stripeSecretKey: stripeSecretKey.value } : {}),
        stripePrices,
        ...(cronSecret._tag === "Some" ? { cronSecret: cronSecret.value } : {}),
        identityIssuer,
        aiHost,
        aiOffline,
        ...(aiMinimaxBaseUrl._tag === "Some" && aiMinimaxBaseUrl.value.trim() ? { aiMinimaxBaseUrl: aiMinimaxBaseUrl.value.trim() } : {}),
        ...(otlpEndpoint._tag === "Some" && otlpEndpoint.value.trim() ? { otlpEndpoint: otlpEndpoint.value.trim() } : {}),
        ...(otelSampleRatio._tag === "Some" && otelSampleRatio.value >= 0 && otelSampleRatio.value <= 1 ? { otelSampleRatio: otelSampleRatio.value } : {}),
        ...(appUrl._tag === "Some" ? { appUrl: appUrl.value } : {}),
        debugLinks,
        token,
        dataDir,
        migrationsDir: migrationsDir._tag === "Some" ? migrationsDir.value : undefined,
        version: "6.0.0",
        localeEnv,
        ...(versionIntervalMs._tag === "Some" && versionIntervalMs.value >= 0 ? { versionIntervalMs: versionIntervalMs.value } : {}),
        ...(versionLimit._tag === "Some" && versionLimit.value >= 1 ? { versionLimit: versionLimit.value } : {})
      })
    })
  )
}
