/**
 * Pricing (`src/pages/pricing.tsx`).
 *
 * The plan grid is the catalogue the sidecar bills against (`FREE | BASIC | PRO | ENTERPRISE`),
 * and every card acts on the signed-in account: the current plan is marked, the Pro trial is
 * started through `POST /api/subscriptions`, and a paid checkout reports plainly when this
 * installation has no payment provider instead of doing nothing.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Check, Clock, Sparkles } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { openExternal } from "../../../app/external.ts"
import { PLAN_FEATURES, PLAN_ORDER, type PlanId } from "../lib/plans.ts"
import { WorkspacePage } from "../../../shared/components/WorkspacePage.tsx"

const daysLeft = (iso: string | undefined): number =>
  iso === undefined ? 0 : Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

export function PricingScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const subscription = useRead((c) => c.billing.current())
  const [pending, setPending] = createSignal<PlanId>()
  const [error, setError] = createSignal<string>()

  const plan = (): string => subscription.data()?.plan ?? "FREE"
  const onTrial = (): boolean => subscription.data()?.isOnTrial === true
  const isCurrent = (id: PlanId): boolean => plan() === id

  const choose = async (id: PlanId): Promise<void> => {
    if (pending() !== undefined) return
    setPending(id)
    setError(undefined)
    try {
      // Pro starts as the trial when the account has no paid plan yet; otherwise, and for every other plan, it is a Stripe checkout.
      const startTrial = id === "PRO" && plan() === "FREE"
      const reply = await app.runtime.run(app.client.billing.subscribe({ payload: { priceId: id, ...(startTrial ? { startTrial: true } : {}) } }))
      if (reply.url) { openExternal(reply.url); return }
      app.cache.invalidate()
      navigate("/settings/subscription")
    } catch {
      setError(t("pricing.checkoutUnavailable"))
    } finally {
      setPending(undefined)
    }
  }

  const label = (id: PlanId): string => {
    if (isCurrent(id)) return onTrial() ? t("pricing.cta.trial") : t("pricing.cta.current")
    if (id === "FREE") return t("pricing.cta.included")
    if (id === "PRO" && plan() === "FREE") return t("pricing.cta.startTrial")
    return t("pricing.cta.choose")
  }

  return <WorkspacePage title={t("pricing.title")}><section class="reference-page-container">
    <div class="reference-pricing-hero">
      <div class="reference-pricing-icon"><Sparkles size={32} aria-hidden="true" /></div>
      <h2 class="reference-pricing-title">{t("pricing.title")}</h2>
      <p class="reference-pricing-intro">{t("pricing.subtitle")}</p>
      <Show when={onTrial()}>
        <p class="reference-pricing-trial"><Clock size={16} aria-hidden="true" />{t("pricing.trial", { days: daysLeft(subscription.data()?.trialEnd) })}</p>
      </Show>
    </div>
    <Show when={error() !== undefined}>
      <p role="alert" class="mx-auto mb-4 max-w-3xl text-center text-sm text-red-600 dark:text-red-400">{error()}</p>
    </Show>
    <div class="reference-pricing-grid">
      <For each={PLAN_ORDER}>{(id) => {
        const info = PLAN_FEATURES[id]!
        return <article class="reference-pricing-card" classList={{ "is-featured": id === "PRO" }} aria-current={isCurrent(id) ? "true" : undefined}>
          <h2>{info.name}</h2>
          <p class="reference-pricing-price">{t("subscription.perMonth", { price: info.price })}</p>
          <ul>
            <For each={info.features}>{(feature) => <li><Check size={16} aria-hidden="true" />{feature}</li>}</For>
          </ul>
          <button
            type="button"
            class="reference-button-primary"
            data-plan={id}
            disabled={isCurrent(id) || id === "FREE" || subscription.loading() || pending() !== undefined}
            onClick={() => void choose(id)}
          >
            {pending() === id ? t("common.loading") : label(id)}
          </button>
        </article>
      }}</For>
    </div>
    <div class="reference-pricing-faq">
      <h2>{t("pricing.faq.title")}</h2>
      <p>{t("pricing.faq.detail")}</p>
    </div>
  </section></WorkspacePage>
}
