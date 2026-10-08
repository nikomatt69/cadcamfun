import type { LanguageModelFactory } from "@cadcamfun/ai"
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
  readonly aiHost?: "nikcli" | "direct"
  /** OTLP/HTTP collector base URL (standard `OTEL_EXPORTER_OTLP_ENDPOINT`); telemetry is off without it. */
  readonly otlpEndpoint?: string
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
      const aiHost = yield* Config.withDefault(Config.literals(["nikcli", "direct"], "CADCAMFUN_AI_HOST"), "nikcli" as const)
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
      return AppConfigService.of({
        ...(adminEmail._tag === "Some" ? { adminEmail: adminEmail.value } : {}),
        ...(stripeWebhookSecret._tag === "Some" ? { stripeWebhookSecret: stripeWebhookSecret.value } : {}),
        ...(stripeSecretKey._tag === "Some" ? { stripeSecretKey: stripeSecretKey.value } : {}),
        stripePrices,
        ...(cronSecret._tag === "Some" ? { cronSecret: cronSecret.value } : {}),
        aiHost,
        ...(otlpEndpoint._tag === "Some" && otlpEndpoint.value.trim() ? { otlpEndpoint: otlpEndpoint.value.trim() } : {}),
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
