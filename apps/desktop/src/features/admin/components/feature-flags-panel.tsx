/**
 * `AdminFeatureFlagsPanel` — `.reference/src/components/admin/AdminFeatureFlagsPanel.tsx`.
 *
 * The floating Shield button opens the admin modal: admin banner, feature counts, the
 * per-user override grid and the documentation lists. The desktop build has a single local
 * profile and no session, so that profile is the sidecar's administrator
 * (`local@cadcamfun.local`) rather than the legacy hosted-site session check.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Check, Settings, Shield, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { ADMIN_EMAILS, LOCAL_ADMIN_EMAIL, featureFlagService, isAdminUser } from "./feature-flags.ts"

export function AdminFeatureFlagsPanel(): JSX.Element | null {
  const [selectedUser, setSelectedUser] = createSignal("")
  const [showPanel, setShowPanel] = createSignal(false)

  if (!isAdminUser(LOCAL_ADMIN_EMAIL)) return null

  const allFeatures = featureFlagService.getAllFeatureFlags()
  const countWith = (prefix: string): number => allFeatures.filter((flag) => flag.startsWith(prefix)).length

  const addUserOverride = (userId: string, feature: string, enabled: boolean): void => {
    featureFlagService.addAdminOverride({
      userId,
      featureFlag: feature as never,
      enabled,
      reason: `Admin override - ${enabled ? "enabled" : "disabled"} by admin`
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPanel((open) => !open)}
        class="fixed bottom-4 right-4 z-50 rounded-full bg-red-600 p-3 text-white shadow-lg transition-colors hover:bg-red-700"
        title={t("admin.ff.title")}
      >
        <Shield class="h-6 w-6" />
      </button>

      <Show when={showPanel()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div class="flex items-center justify-between border-b p-6 border-gray-200 dark:border-gray-700">
              <div class="flex items-center space-x-3">
                <Shield class="h-6 w-6 text-red-600" />
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{t("admin.ff.title")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPanel(false)}
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X class="h-6 w-6" />
              </button>
            </div>

            <div class="max-h-[70vh] overflow-y-auto p-6">
              <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div class="mb-3 flex items-center space-x-2">
                    <Check class="h-5 w-5 text-green-600" />
                    <h3 class="font-medium text-green-800 dark:text-green-200">{t("admin.ff.adminActive")}</h3>
                  </div>
                  <p class="text-sm text-green-700 dark:text-green-300">{t("admin.ff.adminActiveBody")}</p>
                  <div class="mt-2 text-xs text-green-600 dark:text-green-400">
                    {t("admin.ff.adminEmails", { emails: [...ADMIN_EMAILS, LOCAL_ADMIN_EMAIL].join(", ") })}
                  </div>
                </div>

                <div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                  <div class="mb-3 flex items-center space-x-2">
                    <Settings class="h-5 w-5 text-blue-600" />
                    <h3 class="font-medium text-blue-800 dark:text-blue-200">{t("admin.ff.overview")}</h3>
                  </div>
                  <div class="text-sm text-blue-700 dark:text-blue-300">
                    <div>{t("admin.ff.total", { count: allFeatures.length })}</div>
                    <div>{t("admin.ff.aiCount", { count: countWith("ai_") })}</div>
                    <div>{t("admin.ff.cadCount", { count: countWith("cad_") })}</div>
                    <div>{t("admin.ff.camCount", { count: countWith("cam_") })}</div>
                  </div>
                </div>
              </div>

              <div class="mt-6">
                <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">{t("admin.ff.overrides")}</h3>
                <div class="space-y-4">
                  <div>
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("admin.ff.userId")}</label>
                    <input
                      type="text"
                      value={selectedUser()}
                      placeholder={t("admin.ff.userIdPlaceholder")}
                      onInput={(event) => setSelectedUser(event.currentTarget.value)}
                      class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <Show when={selectedUser()}>
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                      <h4 class="mb-3 font-medium text-gray-900 dark:text-white">{t("admin.ff.available")}</h4>
                      <div class="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
                        <For each={[...allFeatures]}>
                          {(feature) => (
                            <div class="flex items-center justify-between rounded bg-white p-2 dark:bg-gray-600">
                              <span class="truncate text-xs text-gray-700 dark:text-gray-300">{feature.replace(/_/g, " ")}</span>
                              <div class="flex space-x-1">
                                <button
                                  type="button"
                                  class="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                                  onClick={() => addUserOverride(selectedUser(), feature, true)}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  class="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                                  onClick={() => addUserOverride(selectedUser(), feature, false)}
                                >
                                  ✗
                                </button>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>

              <div class="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                <h3 class="mb-2 font-medium text-gray-800 dark:text-gray-200">{t("admin.ff.categories")}</h3>
                <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                  <div>
                    <h4 class="font-medium text-gray-800 dark:text-gray-200">{t("admin.ff.aiCat")}</h4>
                    <ul class="space-y-1 text-gray-600 dark:text-gray-400">
                      <li>{t("admin.ff.aiAssistant")}</li>
                      <li>{t("admin.ff.aiVision")}</li>
                      <li>{t("admin.ff.aiAutonomous")}</li>
                      <li>{t("admin.ff.aiCodeInterpreter")}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 class="font-medium text-gray-800 dark:text-gray-200">{t("admin.ff.cadcamCat")}</h4>
                    <ul class="space-y-1 text-gray-600 dark:text-gray-400">
                      <li>{t("admin.ff.advancedCad")}</li>
                      <li>{t("admin.ff.modeling")}</li>
                      <li>{t("admin.ff.camOperations")}</li>
                      <li>{t("admin.ff.exportFormats")}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
