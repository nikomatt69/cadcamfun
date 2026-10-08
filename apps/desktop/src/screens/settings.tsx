/**
 * `/settings` — visual parity with `.reference/src/pages/settings/index.tsx`.
 *
 * Seven tabs (Profile / Account / Security / Subscription / Notifications / AI /
 * Language) over the glassmorphic gradient page, each rendering the legacy component of
 * the same name ported under `src/components/settings/`.
 *
 * The legacy page gates on `useSession()` (pending spinner, redirect to sign-in). The
 * desktop app has one local profile that is always present, so there is nothing to
 * wait for and nowhere to redirect to — the tabs render straight away. The account
 * deletion flow keeps the legacy confirm → DELETE → toast → sign-out → home sequence.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Bell, Cpu, Globe, Lock, Shield, Tag, User } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { endSession } from "../state/session.ts"
import { toast } from "../components/ui/feedback.tsx"
import { ProfileSettings } from "../components/settings/profile-settings.tsx"
import { WorkspacePage } from "../components/WorkspacePage.tsx"
import { SessionManagement } from "../components/settings/session-management.tsx"
import { PasskeySettings } from "../components/settings/passkey-settings.tsx"
import { SubscriptionSettings } from "../components/settings/subscription-settings.tsx"
import { AISettingsPanel } from "../components/settings/ai-settings-panel.tsx"
import { LanguageSelector, SUPPORTED_LANGUAGES } from "../components/settings/language-selector.tsx"

type TabId = "profile" | "account" | "security" | "billing" | "notifications" | "ai" | "language"

interface Tab {
  readonly id: TabId
  readonly name: string
  readonly Icon: (props: { readonly size?: number; readonly class?: string }) => JSX.Element
}

const failureMessage = (cause: unknown, fallback: string): string => {
  if (typeof cause === "object" && cause !== null) {
    const candidate = cause as { error?: unknown; details?: unknown; message?: unknown }
    if (typeof candidate.message === "string" && candidate.message.length > 0) return candidate.message
    if (typeof candidate.error === "string") {
      return typeof candidate.details === "string" ? `${candidate.error}: ${candidate.details}` : candidate.error
    }
  }
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  return fallback
}

export function SettingsScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal<TabId>("profile")
  const [isDeleting, setIsDeleting] = createSignal(false)
  const [deleteError, setDeleteError] = createSignal<string | undefined>(undefined)

  const tabs: readonly Tab[] = [
    { id: "profile", name: t("settings.tab.profile"), Icon: User },
    { id: "account", name: t("settings.tab.account"), Icon: Shield },
    { id: "security", name: t("settings.tab.security"), Icon: Lock },
    { id: "billing", name: t("settings.tab.subscription"), Icon: Tag },
    { id: "notifications", name: t("settings.tab.notifications"), Icon: Bell },
    { id: "ai", name: t("settings.tab.ai"), Icon: Cpu },
    { id: "language", name: t("settings.tab.language"), Icon: Globe }
  ]

  const handleDeleteAccount = async (): Promise<void> => {
    setDeleteError(undefined)
    if (!window.confirm(t("settings.account.deleteConfirm"))) return
    setIsDeleting(true)
    try {
      await app.runtime.run(app.client.user.deleteAccount())
      toast.success(t("settings.account.deleted"))
      try {
        await app.runtime.run(app.client.auth.signout())
      } catch {
        /* the server keeps no session state: dropping the token below is the sign-out */
      }
      endSession(app.cache)
      navigate("/")
    } catch (cause) {
      const message = failureMessage(cause, t("settings.account.deleteFailed"))
      const text = t("settings.account.deleteError", { message })
      setDeleteError(text)
      toast.error(text)
    } finally {
      setIsDeleting(false)
    }
  }

  const tabPanel = (tab: TabId): JSX.Element => (
    <Motion.div
      class="p-4 sm:p-6"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Show when={tab === "profile"}><ProfileSettings /></Show>

      <Show when={tab === "account"}>
        <div class="space-y-8">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.tab.account")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.account.subtitle")}</p>
          </div>

          {/* Session Management Section */}
          <div>
            <SessionManagement />
          </div>

          <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 class="text-base font-medium text-gray-900 dark:text-white">{t("settings.account.deletionTitle")}</h4>
            <div class="mt-2">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Once you delete your account, you cannot go back. All your data will be permanently removed. Please
                be certain.
              </p>
            </div>
            <div class="mt-4">
              <Motion.button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeleting()}
                hover={{ scale: 1.05 }}
                press={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
                class="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-100 dark:bg-red-900/40 dark:hover:bg-red-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-out"
              >
                {isDeleting() ? t("settings.account.deleting") : t("settings.account.delete")}
              </Motion.button>
              <Show when={deleteError() !== undefined}>
                <p class="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError()}</p>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={tab === "language"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.lang.title")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.lang.subtitle")}</p>
          </div>

          <div class="max-w-xl">
            <div class="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div class="sm:col-span-4">
                <label for="language" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("settings.locale")}
                </label>
                <div class="mt-1">
                  <LanguageSelector />
                </div>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t("settings.lang.current", { name: SUPPORTED_LANGUAGES.en })}
                </p>
              </div>
            </div>

            <div class="mt-8">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">{t("settings.glass.title")}</h4>
              <label class="mt-3 flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300" data-testid="glass-setting">
                <input type="checkbox" class="mt-1" aria-label={t("settings.glass.title")} checked={app.settings.settings().glass} onChange={(event) => app.settings.update({ glass: event.currentTarget.checked })} />
                <span>{t("settings.glass.body")}</span>
              </label>
            </div>

            <div class="mt-8">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">{t("settings.lang.available")}</h4>
              <div class="mt-4 space-y-4">
                <For each={Object.entries(SUPPORTED_LANGUAGES)}>
                  {([code, name]) => (
                    <div class="flex items-center">
                      <div class="flex-shrink-0">
                        <Show when={code === "en"}>
                          <span class="inline-block h-2 w-2 rounded-full bg-blue-600" />
                        </Show>
                      </div>
                      <div class="ml-3">
                        <p class="text-sm text-gray-700 dark:text-gray-300">{name}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          {code === "en" ? t("settings.lang.currentLanguage") : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="mt-8 bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
              <div class="flex items-start">
                <div class="flex-shrink-0">
                  <Globe class="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <div class="ml-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">{t("settings.lang.infoTitle")}</h4>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Translations are loaded automatically when you change language. If you encounter any issues with
                    translations, please contact support.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={tab === "notifications"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.notif.title")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.notif.subtitle")}</p>
          </div>

          {/* Email notifications */}
          <div class="mt-6">
            <fieldset>
              <legend class="text-base font-medium text-gray-900 dark:text-white">{t("settings.notif.email")}</legend>
              <div class="mt-4 space-y-4">
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="comments"
                      name="comments"
                      type="checkbox"
                      checked
                      class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="comments" class="font-medium text-gray-700 dark:text-gray-300">
                      {t("settings.notif.comments")}
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">
                      Get notified when someone comments on your posts.
                    </p>
                  </div>
                </div>
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="mentions"
                      name="mentions"
                      type="checkbox"
                      checked
                      class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="mentions" class="font-medium text-gray-700 dark:text-gray-300">
                      {t("settings.notif.mentions")}
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">Get notified when someone mentions you.</p>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Push notifications */}
          <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <fieldset>
              <legend class="text-base font-medium text-gray-900 dark:text-white">{t("settings.notif.push")}</legend>
              <div class="mt-4 space-y-4">
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-everything"
                      name="push-notifications"
                      type="radio"
                      checked
                      class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-everything" class="font-medium text-gray-700 dark:text-gray-300">
                      {t("settings.notif.pushAll")}
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">Receive all push notifications.</p>
                  </div>
                </div>
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-email"
                      name="push-notifications"
                      type="radio"
                      class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-email" class="font-medium text-gray-700 dark:text-gray-300">
                      {t("settings.notif.pushEmail")}
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">Only receive notifications via email.</p>
                  </div>
                </div>
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-nothing"
                      name="push-notifications"
                      type="radio"
                      class="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-nothing" class="font-medium text-gray-700 dark:text-gray-300">
                      {t("settings.notif.pushNone")}
                    </label>
                    <p class="text-gray-500 dark:text-gray-400">Do not receive push notifications.</p>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        </div>
      </Show>

      <Show when={tab === "ai"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.tab.ai")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.ai.subtitle")}</p>
          </div>

          <div class="mt-6">
            <fieldset>
              <div class="mt-4 space-y-4">
                <AISettingsPanel />
              </div>
            </fieldset>
          </div>
        </div>
      </Show>

      <Show when={tab === "billing"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.billing.title")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.billing.subtitle")}</p>
          </div>

          <div class="mt-6">
            <fieldset>
              <legend class="text-base font-medium text-gray-900 dark:text-white">{t("settings.billing.title")}</legend>
              <div class="mt-4 space-y-4">
                <SubscriptionSettings />
              </div>
            </fieldset>
          </div>
        </div>
      </Show>

      <Show when={tab === "security"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("settings.tab.security")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("settings.security.subtitle")}</p>
          </div>

          <div class="mt-6">
            <PasskeySettings />
          </div>
        </div>
      </Show>
    </Motion.div>
  )

  return (
    <WorkspacePage title={t("settings.title")}>
      <div class="mx-auto w-full max-w-7xl">
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">{t("settings.index.subtitle")}</p>

        {/* Main Content */}
        <Motion.div
          class="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Tabs - Desktop */}
          <div class="hidden sm:block bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
            <div class="px-4 sm:px-6 lg:px-8">
              <nav class="-mb-px flex justify-between w-full">
                <For each={tabs}>
                  {(tab) => (
                    <Motion.button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      hover={{ scale: 1.05 }}
                      press={{ scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      class="flex-1 py-4 px-2 border-b-2 font-medium text-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-out whitespace-nowrap rounded-t-lg"
                      classList={{
                        "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/20":
                          activeTab() === tab.id,
                        "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100/30 dark:hover:bg-gray-700/20":
                          activeTab() !== tab.id
                      }}
                      aria-pressed={activeTab() === tab.id}
                    >
                      <div class="flex items-center justify-center">
                        <span class="mr-1 lg:mr-2 flex-shrink-0"><tab.Icon size={18} /></span>
                        <span class="hidden md:inline-block lg:inline-block truncate">{tab.name}</span>
                      </div>
                    </Motion.button>
                  )}
                </For>
              </nav>
            </div>
          </div>

          {/* Tabs - Mobile */}
          <div class="sm:hidden bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
            <div class="px-1">
              <div class="flex justify-between w-full py-1">
                <For each={tabs}>
                  {(tab) => (
                    <Motion.button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      hover={{ scale: 1.05 }}
                      press={{ scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      class="flex-1 flex flex-col items-center py-2 px-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-out rounded-lg"
                      classList={{
                        "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20": activeTab() === tab.id,
                        "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/30":
                          activeTab() !== tab.id
                      }}
                      aria-pressed={activeTab() === tab.id}
                    >
                      <span class="mb-1 text-base"><tab.Icon size={18} /></span>
                      <span class="text-xs leading-tight text-center max-w-full truncate">{tab.name}</span>
                    </Motion.button>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <Show when={activeTab()} keyed>
            {(tab) => tabPanel(tab)}
          </Show>
        </Motion.div>
      </div>
    </WorkspacePage>
  )
}
