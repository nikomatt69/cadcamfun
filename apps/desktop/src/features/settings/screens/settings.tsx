/**
 * `/settings` — visual parity with `.reference/src/pages/settings/index.tsx`.
 *
 * Eight tabs (Profile / Account / Security / Subscription / Notifications / AI /
 * Devices / Language) over the workstation chrome, each rendering the ported legacy
 * component of the same name under `src/features/settings/components/`.
 *
 * The legacy page gates on `useSession()` (pending spinner, redirect to sign-in). The
 * desktop app has one local profile that is always present, so there is nothing to
 * wait for and nowhere to redirect to — the tabs render straight away. The account
 * deletion flow keeps the legacy confirm → DELETE → toast → sign-out → home sequence.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Bell, Cpu, Globe, Lock, Shield, Smartphone, User } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { endSession } from "../../../shared/state/session.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { ProfileSettings } from "../components/profile-settings.tsx"
import { WorkspacePage, WorkspaceTabs, PANEL } from "../../../shared/components/WorkspacePage.tsx"
import { SessionManagement } from "../components/session-management.tsx"
import { PasskeySettings } from "../components/passkey-settings.tsx"
import { AISettingsPanel } from "../components/ai-settings-panel.tsx"
import { CompanionPanel } from "../../companion/screens/companion.tsx"
import { LanguageSelector, SUPPORTED_LANGUAGES } from "../components/language-selector.tsx"
import { AutosaveSettings } from "../components/autosave-settings.tsx"
import { checkForUpdates, inDesktopShell, openReleaseNotes } from "../../../app/updates.ts"

type TabId = "profile" | "account" | "security" | "notifications" | "ai" | "devices" | "language"

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
    { id: "notifications", name: t("settings.tab.notifications"), Icon: Bell },
    { id: "ai", name: t("settings.tab.ai"), Icon: Cpu },
    { id: "devices", name: t("settings.tab.devices"), Icon: Smartphone },
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
    <div class="p-4 sm:p-6">
      <Show when={tab === "profile"}><ProfileSettings /></Show>

      <Show when={tab === "account"}>
        <div class="space-y-8">
          <div>
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.tab.account")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.account.subtitle")}</p>
          </div>

          {/* Session Management Section */}
          <div>
            <SessionManagement />
          </div>

          <div class="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h4 class="text-base font-medium text-slate-900 dark:text-white">{t("settings.account.deletionTitle")}</h4>
            <div class="mt-2">
              <p class="text-sm text-slate-500 dark:text-slate-400">
                Once you delete your account, you cannot go back. All your data will be permanently removed. Please
                be certain.
              </p>
            </div>
            <div class="mt-4">
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeleting()}
                class="inline-flex items-center justify-center rounded-lg border border-red-200/70 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition-colors duration-150 ease-out hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
              >
                {isDeleting() ? t("settings.account.deleting") : t("settings.account.delete")}
              </button>
              <Show when={deleteError() !== undefined}>
                <p class="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError()}</p>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={tab === "devices"}><CompanionPanel /></Show>

      <Show when={tab === "language"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.lang.title")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.lang.subtitle")}</p>
          </div>

          <div class="max-w-xl">
            <div class="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div class="sm:col-span-4">
                <label for="language" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("settings.locale")}
                </label>
                <div class="mt-1">
                  <LanguageSelector />
                </div>
                <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t("settings.lang.current", { name: SUPPORTED_LANGUAGES.en })}
                </p>
              </div>
            </div>

            <div class="mt-8">
              <h4 class="text-sm font-medium text-slate-900 dark:text-white">{t("settings.glass.title")}</h4>
              <label class="mt-3 flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300" data-testid="glass-setting">
                <input type="checkbox" class="mt-1 h-4 w-4 accent-blue-600" aria-label={t("settings.glass.title")} checked={app.settings.settings().glass} onChange={(event) => app.settings.update({ glass: event.currentTarget.checked })} />
                <span>{t("settings.glass.body")}</span>
              </label>
            </div>

            <AutosaveSettings />

            <div class="mt-8">
              <h4 class="text-sm font-medium text-slate-900 dark:text-white">{t("settings.lang.available")}</h4>
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
                        <p class="text-sm text-slate-700 dark:text-slate-300">{name}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                          {code === "en" ? t("settings.lang.currentLanguage") : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="mt-8 rounded-lg border border-slate-200/60 bg-slate-50/70 p-4 dark:border-slate-700/40 dark:bg-slate-800/30">
              <div class="flex items-start">
                <div class="flex-shrink-0">
                  <Globe class="h-5 w-5 text-slate-400" aria-hidden="true" />
                </div>
                <div class="ml-3">
                  <h4 class="text-sm font-medium text-slate-900 dark:text-white">{t("settings.lang.infoTitle")}</h4>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.notif.title")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.notif.subtitle")}</p>
          </div>

          {/* Email notifications */}
          <div class="mt-6">
            <fieldset>
              <legend class="text-base font-medium text-slate-900 dark:text-white">{t("settings.notif.email")}</legend>
              <div class="mt-4 space-y-4">
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="comments"
                      name="comments"
                      type="checkbox"
                      checked
                      class="h-4 w-4 accent-blue-600"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="comments" class="font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.notif.comments")}
                    </label>
                    <p class="text-slate-500 dark:text-slate-400">
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
                      class="h-4 w-4 accent-blue-600"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="mentions" class="font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.notif.mentions")}
                    </label>
                    <p class="text-slate-500 dark:text-slate-400">Get notified when someone mentions you.</p>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Native desktop notifications, synced with the DB feed and the paired phone */}
          <div class="mt-6">
            <fieldset>
              <legend class="text-base font-medium text-slate-900 dark:text-white">Native desktop notifications</legend>
              <div class="mt-4 flex items-start">
                <div class="flex items-center h-5">
                  <input id="native-notifications" name="native-notifications" type="checkbox" checked={app.settings.settings().nativeNotifications} onChange={(event) => app.settings.update({ nativeNotifications: event.currentTarget.checked })} class="h-4 w-4 accent-blue-600" />
                </div>
                <div class="ml-3 text-sm">
                  <label for="native-notifications" class="font-medium text-slate-700 dark:text-slate-300">Show system notifications</label>
                  <p class="text-slate-500 dark:text-slate-400">For workflow failures, pull requests, reviews and assistant commits. The feed stays synced with your phone either way.</p>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Updates: the desktop shell checks at launch and every four hours; this asks for a check now and the dialog answers it */}
          <Show when={inDesktopShell()}>
            <div class="mt-6" data-testid="settings-updates">
              <fieldset>
                <legend class="text-base font-medium text-slate-900 dark:text-white">{t("settings.updates.title")}</legend>
                <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("settings.updates.description")}</p>
                <div class="mt-3 flex gap-2">
                  <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700" onClick={() => void checkForUpdates().catch(() => toast.error(t("update.checkFailed")))}>{t("settings.updates.check")}</button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => void openReleaseNotes().catch(() => undefined)}>{t("update.releaseNotes")}</button>
                </div>
              </fieldset>
            </div>
          </Show>

          {/* Push notifications */}
          <div class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <fieldset>
              <legend class="text-base font-medium text-slate-900 dark:text-white">{t("settings.notif.push")}</legend>
              <div class="mt-4 space-y-4">
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-everything"
                      name="push-notifications"
                      type="radio"
                      checked
                      class="h-4 w-4 accent-blue-600"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-everything" class="font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.notif.pushAll")}
                    </label>
                    <p class="text-slate-500 dark:text-slate-400">Receive all push notifications.</p>
                  </div>
                </div>
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-email"
                      name="push-notifications"
                      type="radio"
                      class="h-4 w-4 accent-blue-600"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-email" class="font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.notif.pushEmail")}
                    </label>
                    <p class="text-slate-500 dark:text-slate-400">Only receive notifications via email.</p>
                  </div>
                </div>
                <div class="flex items-start">
                  <div class="flex items-center h-5">
                    <input
                      id="push-nothing"
                      name="push-notifications"
                      type="radio"
                      class="h-4 w-4 accent-blue-600"
                    />
                  </div>
                  <div class="ml-3 text-sm">
                    <label for="push-nothing" class="font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.notif.pushNone")}
                    </label>
                    <p class="text-slate-500 dark:text-slate-400">Do not receive push notifications.</p>
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
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.tab.ai")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.ai.subtitle")}</p>
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

      <Show when={tab === "security"}>
        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.tab.security")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.security.subtitle")}</p>
          </div>

          <div class="mt-6">
            <PasskeySettings />
          </div>
        </div>
      </Show>
    </div>
  )

  return (
    <WorkspacePage title={t("settings.title")}>
      <div class="mx-auto w-full max-w-5xl">
        <p class="mb-3 text-xs text-slate-500 dark:text-slate-400">{t("settings.index.subtitle")}</p>

        <WorkspaceTabs
          class="mb-4"
          label={t("settings.title")}
          value={activeTab()}
          onChange={setActiveTab}
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.name, icon: <tab.Icon size={14} /> }))}
        />

        <div class={`${PANEL} !p-4 sm:!p-5`}>
          <Show when={activeTab()} keyed>
            {(tab) => tabPanel(tab)}
          </Show>
        </div>
      </div>
    </WorkspacePage>
  )
}
