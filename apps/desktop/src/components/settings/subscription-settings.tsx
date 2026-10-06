/**
 * `.reference/src/components/subscription/SubscriptionSettings.tsx` — the card the
 * Billing tab of `/settings` wraps in its fieldset.
 *
 * Same shape as the card behind `/settings/subscription`: the plan catalogue is the
 * legacy `PLAN_FEATURES` table verbatim, the read is `GET /api/subscriptions` through
 * the typed client and "Manage Billing" posts `POST /api/subscriptions/portal` like the
 * legacy `createBillingPortalSession`.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { AlertTriangle, Clock, Crown, Shield, Star } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"
import { useRead } from "../../app/queries.ts"
import { ErrorState, LoadingState } from "../../screens/screen-parts.tsx"

interface PlanLimits {
  readonly maxProjects: number
  readonly maxComponents: number
  readonly maxStorage: number
}

interface PlanFeatures {
  readonly name: string
  readonly price: string
  readonly features: readonly string[]
  readonly limits: PlanLimits
}

/** `.reference/src/lib/stripe.ts` `PLAN_FEATURES`. */
const PLAN_FEATURES: Readonly<Record<string, PlanFeatures>> = {
  FREE: {
    name: "Free",
    price: "$0",
    features: ["Basic CAD functionality", "2 projects", "Limited components", "Community support"],
    limits: { maxProjects: 2, maxComponents: 10, maxStorage: 100 }
  },
  BASIC: {
    name: "Basic",
    price: "$9.99",
    features: ["Full CAD functionality", "10 projects", "Unlimited components", "Email support", "1GB storage"],
    limits: { maxProjects: 10, maxComponents: 100, maxStorage: 1024 }
  },
  PRO: {
    name: "Professional",
    price: "$49.99",
    features: ["Full CAD/CAM functionality", "Unlimited projects", "Advanced AI assistance", "Priority support", "10GB storage"],
    limits: { maxProjects: 50, maxComponents: 1000, maxStorage: 5120 }
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: "$100.00",
    features: ["Full CAD/CAM functionality", "Unlimited projects", "Advanced AI assistance", "Priority support", "10GB storage"],
    limits: { maxProjects: 100, maxComponents: 5000, maxStorage: 10240 }
  }
}

const FREE = PLAN_FEATURES.FREE!

const planFeatures = (plan: string): PlanFeatures => PLAN_FEATURES[plan] ?? FREE

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

const PlanIcon = (props: { readonly plan: string }): JSX.Element => {
  const Icon = props.plan === "PRO" ? Star : props.plan === "ENTERPRISE" ? Crown : Shield
  return <Icon class="h-6 w-6 text-blue-600 dark:text-blue-400" />
}

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

  const handleManageBilling = async (): Promise<void> => {
    try {
      const reply = await app.runtime.run(app.client.billing.portal({ payload: {} }))
      if (reply.url) window.open(reply.url, "_blank", "noopener,noreferrer")
    } catch {
      /* the card renders the read error above */
    }
  }

  return (
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div class="px-4 py-5 sm:p-6">
        <div class="flex items-center space-x-3 mb-6">
          <PlanIcon plan={info()?.plan ?? "FREE"} />
          <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">{t("subscription.card.title")}</h3>
        </div>

        <Show when={subscription.loading()}><LoadingState label={t("subscription.card.title")} /></Show>
        <Show when={subscription.error() !== undefined}>
          <ErrorState label={t("common.error")} detail={subscription.error()} />
        </Show>

        {/* Trial Warning Banner */}
        <Show when={isOnTrial() && trialDaysLeft() !== null && (trialDaysLeft() ?? 99) <= 3}>
          <div class="mb-6 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700">
            <div class="flex items-center space-x-2">
              <AlertTriangle class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {(trialDaysLeft() ?? 0) === 1
                  ? t("subscription.trialExpiresOne", { days: trialDaysLeft() ?? 0 })
                  : t("subscription.trialExpiresMany", { days: trialDaysLeft() ?? 0 })}
              </p>
            </div>
            <p class="mt-1 text-sm text-yellow-700 dark:text-yellow-300">{t("subscription.trialUpgrade")}</p>
          </div>
        </Show>

        <div class="border-t border-gray-200 dark:border-gray-700 pt-5">
          <dl class="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div class="sm:col-span-1">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.currentPlan")}</dt>
              <dd class="mt-1 flex items-center space-x-2">
                <span class="text-sm text-gray-900 dark:text-white font-medium">{features().name || t("subscription.free")}</span>
                <Show when={isOnTrial()}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <Clock class="w-3 h-3 mr-1" />
                    {t("subscription.trial")}
                  </span>
                </Show>
              </dd>
            </div>

            <div class="sm:col-span-1">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.status")}</dt>
              <dd class="mt-1 text-sm text-gray-900 capitalize dark:text-gray-400">
                {info()?.cancelAtPeriodEnd ? t("subscription.cancelled") : info()?.status}
              </dd>
            </div>

            <Show when={isOnTrial() && info()?.trialEnd !== undefined}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.trialEnds")}</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-gray-400">
                  {formattedTrialEnd()} ({t("subscription.trialDaysLeft", { days: trialDaysLeft() ?? 0 })})
                </dd>
              </div>
            </Show>

            <Show when={!isOnTrial() && info()?.plan !== "FREE" && info()?.periodEnd != null}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.nextBilling")}</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-gray-400">{formattedPeriodEnd()}</dd>
              </div>
            </Show>

            <Show when={info()?.plan !== "FREE" && features().price.length > 0}>
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.price")}</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-gray-400">{t("subscription.perMonth", { price: features().price })}</dd>
              </div>
            </Show>

            <div class="sm:col-span-2">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.features")}</dt>
              <dd class="mt-1 text-sm text-gray-900 dark:text-gray-400">
                <ul class="list-disc pl-5 space-y-1">
                  <For each={features().features}>{(feature) => <li>{feature}</li>}</For>
                </ul>
              </dd>
            </div>

            <div class="sm:col-span-2">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("subscription.limits")}</dt>
              <dd class="mt-1 text-sm text-gray-900 dark:text-gray-400">
                <ul class="list-disc pl-5 space-y-1">
                  <li>{t("subscription.limitProjects", { value: features().limits.maxProjects === -1 ? t("subscription.unlimited") : features().limits.maxProjects })}</li>
                  <li>{t("subscription.limitComponents", { value: features().limits.maxComponents === -1 ? t("subscription.unlimited") : features().limits.maxComponents })}</li>
                  <li>{t("subscription.limitStorage", { value: features().limits.maxStorage / 1024 })}</li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <div class="mt-8 flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3">
          <Show when={showManageBilling()}>
            <button
              type="button"
              onClick={() => void handleManageBilling()}
              class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-700 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {t("subscription.manageBilling")}
            </button>
          </Show>

          <Show when={showUpgradeLink()}>
            <A
              href="/pricing"
              class={`inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                isOnTrial() ? "bg-green-600 hover:bg-green-700 focus:ring-green-500" : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
              }`}
            >
              {isOnTrial() ? t("subscription.upgradeNow") : t("subscription.upgradePlan")}
            </A>
          </Show>
        </div>
      </div>
    </div>
  )
}
