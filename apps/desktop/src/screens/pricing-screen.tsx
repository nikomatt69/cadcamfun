/**
 * Reference-aligned pricing screen (`src/pages/pricing.tsx`).
 * The runtime has no subscription service yet, so the screen shows the canonical
 * plan grid and a notice that local-first usage is free; sign-in unlocks extras.
 */
import { For, type JSX } from "solid-js"
import { Check, Clock, Sparkles } from "lucide-solid"
import { t } from "../i18n/index.ts"

interface Plan {
  readonly id: "free" | "pro" | "team"
  readonly nameKey: "pricing.free.name" | "pricing.pro.name" | "pricing.team.name"
  readonly priceKey: "pricing.free.price" | "pricing.pro.price" | "pricing.team.price"
  readonly summaryKey: "pricing.free.summary" | "pricing.pro.summary" | "pricing.team.summary"
  readonly features: ReadonlyArray<"pricing.features.local" | "pricing.features.cad" | "pricing.features.cam" | "pricing.features.costs" | "pricing.features.plugins" | "pricing.features.sync" | "pricing.features.marketplace" | "pricing.features.collaboration">
  readonly cta: "pricing.free.cta" | "pricing.pro.cta" | "pricing.team.cta"
}

const plans: ReadonlyArray<Plan> = [
  {
    id: "free",
    nameKey: "pricing.free.name",
    priceKey: "pricing.free.price",
    summaryKey: "pricing.free.summary",
    features: ["pricing.features.local", "pricing.features.cad", "pricing.features.cam", "pricing.features.plugins"],
    cta: "pricing.free.cta"
  },
  {
    id: "pro",
    nameKey: "pricing.pro.name",
    priceKey: "pricing.pro.price",
    summaryKey: "pricing.pro.summary",
    features: ["pricing.features.local", "pricing.features.cad", "pricing.features.cam", "pricing.features.costs", "pricing.features.plugins", "pricing.features.sync", "pricing.features.marketplace"],
    cta: "pricing.pro.cta"
  },
  {
    id: "team",
    nameKey: "pricing.team.name",
    priceKey: "pricing.team.price",
    summaryKey: "pricing.team.summary",
    features: ["pricing.features.local", "pricing.features.cad", "pricing.features.cam", "pricing.features.costs", "pricing.features.plugins", "pricing.features.sync", "pricing.features.marketplace", "pricing.features.collaboration"],
    cta: "pricing.team.cta"
  }
]

export function PricingScreen(): JSX.Element {
  return <section class="reference-page-container">
    <div class="reference-pricing-hero">
      <div class="reference-pricing-icon"><Sparkles size={32} aria-hidden="true" /></div>
      <h1 class="reference-pricing-title">{t("pricing.title")}</h1>
      <p class="reference-pricing-intro">{t("pricing.subtitle")}</p>
      <p class="reference-pricing-trial"><Clock size={16} aria-hidden="true" />{t("pricing.trial")}</p>
    </div>
    <div class="reference-pricing-grid">
      <For each={plans}>{(plan) => <article class="reference-pricing-card" classList={{ "is-featured": plan.id === "pro" }}>
        <h2>{t(plan.nameKey)}</h2>
        <p class="reference-pricing-price">{t(plan.priceKey)}</p>
        <p class="reference-pricing-summary">{t(plan.summaryKey)}</p>
        <ul>
          <For each={plan.features}>{(feature) => <li><Check size={16} aria-hidden="true" />{t(feature)}</li>}</For>
        </ul>
        <button type="button" class="reference-button-primary">{t(plan.cta)}</button>
      </article>}</For>
    </div>
    <div class="reference-pricing-faq">
      <h2>{t("pricing.faq.title")}</h2>
      <p>{t("pricing.faq.detail")}</p>
    </div>
  </section>
}