/**
 * `.reference/src/components/subscription/SubscriptionSettings.tsx` — the card the
 * Billing tab of `/settings` wraps in its fieldset.
 *
 * Same shape as the card behind `/settings/subscription`: the plan catalogue is the
 * legacy `PLAN_FEATURES` table verbatim, the read is `GET /api/subscriptions` through
 * the typed client and "Manage Billing" posts `POST /api/subscriptions/portal` like the
 * legacy `createBillingPortalSession`.
 *
 * Styling is the workstation vocabulary: neutral translucent surfaces, one accent (blue).
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { AlertTriangle, Clock, Crown, Shield, Star } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { openExternal } from "../../../app/external.ts"
import { ErrorState, LoadingState } from "../../../shared/components/screen-parts.tsx"
import { planFeatures } from "../../billing/lib/plans.ts"

/** Storage limits are MB in the API; show whole MB below 1 GB (100 MB, not 0.0977 GB). */
const storageValue = (mb: number): string =>
  mb >= 1024 ? t("subscription.limitStorage", { value: mb / 1024 }) : t("subscription.limitStorageMb", { value: mb })

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

const PlanIcon = (props: { readonly plan: string }): JSX.Element => {
  const Icon = props.plan === "PRO" ? Star : props.plan === "ENTERPRISE" ? Crown : Shield
  return <Icon class="h-6 w-6 text-blue-600 dark:text-blue-400" />
}

/** Card surface — the neutral translucent panel of the list pages. */
const CARD = "rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60"
const PRIMARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
const SECONDARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"

export function SubscriptionSettings(): JSX.Element {
  const app = useApp()
  const subscription = useRead((client) => client.billing.current())
  const info = subscription.data
  const features = () => planFeatures(info()?.plan ?? "FREE")
  const isOnTrial = () => info()?.isOnTrial === true
  const trialDaysLeft = (): number | null => {
    const end = info()?.trialEnd
    if (end === undefined) return null
    return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000))
  }
  const formattedPeriodEnd = (): string | null => (info()?.periodEnd ? formatDate(info()!.periodEnd!) : null)
  const formattedTrialEnd = (): string | null => (info()?.trialEnd ? formatDate(info()!.trialEnd!) : null)
  const showManageBilling = () => (info()?.plan ?? "FREE") !== "FREE" && !isOnTrial()
  const showUpgradeLink = () => ((info()?.plan ?? "FREE") === "FREE" && !isOnTrial()) || isOnTrial()

  const [billingPending, setBillingPending] = createSignal(false)
  const [billingError, setBillingError] = createSignal<string>()
  const handleManageBilling = async (): Promise<void> => {
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
    <div class={CARD}>
      <div class="px-4 py-5 sm:p-6">
        <div class="mb-6 flex items-center space-x-3">
          <PlanIcon plan={info()?.plan ?? "FREE"} />
          <h3 class="text-base font-medium leading-6 text-slate-900 dark:text-white">{t("subscription.card.title")}</h3>
        </div>

        <Show when={subscription.loading()}><LoadingState label={t("subscription.card.title")} /></Show>
        <Show when={subscription.error() !== undefined}>
          <ErrorState label={t("common.error")} detail={subscription.error()} />
        </Show>

        {/* Trial Warning Banner */}
        <Show when={isOnTrial() && trialDaysLeft() !== null && (trialDaysLeft() ?? 99) <= 3}>
          <div class="mb-6 rounded-lg border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
            <div class="flex items-center space-x-2">
              <AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <p class="text-sm font-medium text-amber-900 dark:text-amber-200">
                {(trialDaysLeft() ?? 0) === 1
                  ? t("subscription.trialExpiresOne", { days: trialDaysLeft() ?? 0 })
                  : t("subscription.trialExpiresMany", { days: trialDaysLeft() ?? 0 })}
              </p>
            </div>
            <p class="mt-1 text-sm text-amber-800 dark:text-amber-300">{t("subscription.trialUpgrade")}</p>
          </div>
        </Show>

        <div class="border-t border-slate-200/70 pt-5 dark:border-slate-700/50">
          <dl class="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div class="sm:col-span-1">
              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.currentPlan")}</dt>
              <dd class="mt-1 flex items-center space-x-2">
                <span class="text-sm font-medium text-slate-900 dark:text-white">{features().name || t("subscription.free")}</span>
                <Show when={isOnTrial()}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Clock class="mr-1 h-3 w-3" />
                    {t("subscription.trial")}
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

            <Show when={isOnTrial() && info()?.trialEnd !== undefined}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.trialEnds")}</dt>
                <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {formattedTrialEnd()} ({t("subscription.trialDaysLeft", { days: trialDaysLeft() ?? 0 })})
                </dd>
              </div>
            </Show>

            <Show when={!isOnTrial() && info()?.plan !== "FREE" && info()?.periodEnd != null}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-slate-500 dark:text-slate-400">{t("subscription.nextBilling")}</dt>
                <dd class="mt-1 text-sm text-slate-600 dark:text-slate-300">{formattedPeriodEnd()}</dd>
              </div>
            </Show>

            <Show when={info()?.plan !== "FREE" && features().price.length > 0}>
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

        <div class="mt-8 flex flex-col space-y-3 sm:flex-row sm:justify-end sm:space-x-3 sm:space-y-0">
          <Show when={showManageBilling()}>
            <button
              type="button"
              onClick={() => void handleManageBilling()}
              disabled={subscription.loading() || billingPending()}
              class={SECONDARY_BUTTON}
            >
              {t("subscription.manageBilling")}
            </button>
          </Show>

          <Show when={showUpgradeLink()}>
            <A href="/pricing" class={PRIMARY_BUTTON}>
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
