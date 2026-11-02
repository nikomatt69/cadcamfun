/**
 * Subscription settings — visual parity with
 * `.reference/src/pages/settings/subscription.tsx` +
 * `.reference/src/components/subscription/SubscriptionSettings.tsx`.
 *
 * The plan catalogue (`PLAN_FEATURES`) is the legacy table verbatim; only the plan ids are
 * the canonical `FREE | BASIC | PRO | ENTERPRISE` the sidecar normalises to. The card reads
 * `GET /api/subscriptions` through the typed client, so `Manage Billing` posts to
 * `POST /api/subscriptions/portal` exactly like the legacy `createBillingPortalSession`.
 *
 * Styling is the workstation vocabulary: the shared `PANEL` and toolbar buttons, one accent (blue), tabular numerals.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { AlertTriangle, Clock, Crown, Shield, Star } from "lucide-solid"
import { openExternal } from "../../../app/external.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { PANEL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY, WorkspacePage } from "../../../shared/components/WorkspacePage.tsx"
import { ErrorState, LoadingState } from "../../../shared/components/screen-parts.tsx"
import { planFeatures } from "../lib/plans.ts"

/** Storage limits are MB in the API; show whole MB below 1 GB (100 MB, not 0.0977 GB). */
const storageValue = (mb: number): string =>
  mb >= 1024 ? t("subscription.limitStorage", { value: mb / 1024 }) : t("subscription.limitStorageMb", { value: mb })

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

const PlanIcon = (props: { readonly plan: string }): JSX.Element => {
  const icon = props.plan === "PRO" ? Star : props.plan === "ENTERPRISE" ? Crown : Shield
  const Icon = icon
  return <Icon size={16} aria-hidden="true" class="text-blue-600 dark:text-blue-400" />
}


/** The `Subscription` card: current plan, trial banner, limits and the billing actions. */
function SubscriptionCard(): JSX.Element {
  const app = useApp()
  const subscription = useRead((c) => c.billing.current())
  const info = subscription.data
  const features = () => planFeatures(info()?.plan ?? "FREE")
  const isOnTrial = () => info()?.isOnTrial === true
  const trialDaysLeft = (): number | null => {
    const end = info()?.trialEnd
    if (!end) return null
    return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000))
  }
  const showManageBilling = () => (info()?.plan ?? "FREE") !== "FREE" && !isOnTrial()
  const showUpgradeLink = () => ((info()?.plan ?? "FREE") === "FREE" && !isOnTrial()) || isOnTrial()

  const [billingPending, setBillingPending] = createSignal(false)
  const [billingError, setBillingError] = createSignal<string>()
  const openPortal = async (): Promise<void> => {
    setBillingPending(true)
    setBillingError(undefined)
    try {
      const reply = await app.runtime.run(app.client.billing.portal({ payload: {} }))
      if (reply.url) openExternal(reply.url)
    } catch {
      setBillingError(t("subscription.billingError"))
    } finally {
      setBillingPending(false)
    }
  }

  return (
    <div class={PANEL}>
      <div>
        <div class="mb-4 flex items-center gap-2">
          <PlanIcon plan={info()?.plan ?? "FREE"} />
          <h3 class="text-base font-medium leading-6 text-slate-900 dark:text-white">{t("subscription.card.title")}</h3>
        </div>

        <Show when={subscription.loading()}><LoadingState label={t("subscription.card.title")} /></Show>
        <Show when={subscription.error()}><ErrorState label={t("common.error")} detail={subscription.error()} /></Show>

        <Show when={isOnTrial() && trialDaysLeft() !== null && (trialDaysLeft() ?? 99) <= 3}>
          <div class="mb-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
            <div class="flex items-center gap-2">
              <AlertTriangle size={16} aria-hidden="true" class="flex-none text-amber-600 dark:text-amber-400" />
              <p class="text-sm font-medium text-amber-900 dark:text-amber-200">
                {(trialDaysLeft() ?? 0) === 1
                  ? t("subscription.trialExpiresOne", { days: trialDaysLeft() ?? 0 })
                  : t("subscription.trialExpiresMany", { days: trialDaysLeft() ?? 0 })}
              </p>
            </div>
            <p class="mt-1 pl-6 text-sm text-amber-800 dark:text-amber-300">{t("subscription.trialUpgrade")}</p>
          </div>
        </Show>

        <div class="border-t border-slate-200/70 pt-4 dark:border-slate-700/50">
          <dl class="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 [&_dd]:tabular-nums">
            <div class="sm:col-span-1">
              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.currentPlan")}</dt>
              <dd class="mt-1 flex items-center gap-2">
                <span class="text-sm font-medium text-slate-900 dark:text-white">{features().name || t("subscription.free")}</span>
                <Show when={isOnTrial()}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Clock size={12} aria-hidden="true" class="mr-1" />{t("subscription.trial")}
                  </span>
                </Show>
              </dd>
            </div>

            <div class="sm:col-span-1">
              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.status")}</dt>
              <dd class="mt-1 text-sm capitalize text-slate-600 dark:text-slate-300">
                {info()?.cancelAtPeriodEnd ? t("subscription.cancelled") : info()?.status}
              </dd>
            </div>

            <Show when={isOnTrial() && info()?.trialEnd}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.trialEnds")}</dt>
                <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {formatDate(info()!.trialEnd!)} ({t("subscription.trialDaysLeft", { days: trialDaysLeft() ?? 0 })})
                </dd>
              </div>
            </Show>

            <Show when={!isOnTrial() && info()?.plan !== "FREE" && info()?.periodEnd}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.nextBilling")}</dt>
                <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDate(info()!.periodEnd!)}</dd>
              </div>
            </Show>

            <Show when={info()?.plan !== "FREE" && features().price}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.price")}</dt>
                <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("subscription.perMonth", { price: features().price })}</dd>
              </div>
            </Show>

            <div class="sm:col-span-2">
              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.features")}</dt>
              <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                <ul class="list-disc space-y-1 pl-5">
                  <For each={features().features}>{(feature) => <li>{feature}</li>}</For>
                </ul>
              </dd>
            </div>

            <div class="sm:col-span-2">
              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.limits")}</dt>
              <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                <ul class="list-disc space-y-1 pl-5">
                  <li>{t("subscription.limitProjects", { value: features().limits.maxProjects === -1 ? t("subscription.unlimited") : features().limits.maxProjects })}</li>
                  <li>{t("subscription.limitComponents", { value: features().limits.maxComponents === -1 ? t("subscription.unlimited") : features().limits.maxComponents })}</li>
                  <li>{storageValue(features().limits.maxStorage)}</li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Show when={showManageBilling()}>
            <button type="button" class={TOOLBAR_BUTTON} disabled={subscription.loading() || billingPending()} onClick={() => void openPortal()}>
              {t("subscription.manageBilling")}
            </button>
          </Show>
          <Show when={showUpgradeLink()}>
            <A class={TOOLBAR_PRIMARY} href="/pricing">
              {isOnTrial() ? t("subscription.upgradeNow") : t("subscription.upgradePlan")}
            </A>
          </Show>
        </div>
        <Show when={billingError() !== undefined}>
          <p role="alert" class="mt-3 text-sm text-red-600 dark:text-red-400">{billingError()}</p>
        </Show>
      </div>
    </div>
  )
}

/** `/settings/subscription` — header, the subscription card and the support card. */
export function SubscriptionScreen(): JSX.Element {
  return (
    <WorkspacePage
      title={t("settings.subscription.title")}
      actions={<A class={TOOLBAR_PRIMARY} href="/pricing">{t("settings.subscription.viewPlans")}</A>}
    >
      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">{t("settings.subscription.subtitle")}</p>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-3">
          <SubscriptionCard />
          <div class={PANEL}>
            <div>
              <h3 class="text-base font-medium leading-6 text-slate-900 dark:text-white">{t("settings.subscription.helpTitle")}</h3>
              <div class="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                <p>{t("settings.subscription.helpBody")}</p>
              </div>
              <div class="mt-5">
                <a class={TOOLBAR_BUTTON} href="mailto:nicom.19@icloud.com">{t("settings.subscription.contactSupport")}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkspacePage>
  )
}
