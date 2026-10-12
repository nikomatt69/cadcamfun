/**
 * `/auth/two-factor` — port of `.reference/src/pages/auth/two-factor.tsx`.
 *
 * The legacy page is a pure placeholder: every handler answers with
 * `'2FA functionality will be available soon'` and no endpoint is ever called
 * (the status check is a commented-out TODO). The screen is therefore a UI port —
 * tabs, messages and buttons reproduce the legacy markup verbatim.
 *
 * Deviation: the legacy `if (!user)` "Please sign in to manage 2FA settings" guard is
 * omitted; the desktop app has a single always-present local profile.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"

type Tab = "setup" | "verify" | "manage"

export function TwoFactorScreen(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<Tab>("setup")
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)

  // Setup 2FA states (the legacy page never receives a QR code or backup codes)
  const [qrCode, setQrCode] = createSignal<string | null>(null)
  const [backupCodes, setBackupCodes] = createSignal<string[]>([])

  // Verification states
  const [verificationCode, setVerificationCode] = createSignal("")
  const [otpSent, setOtpSent] = createSignal(false)

  // 2FA status — the legacy status check is a TODO, so this stays false.
  const [is2FAEnabled, setIs2FAEnabled] = createSignal(false)

  // Placeholder functions - da implementare quando gli endpoint saranno disponibili
  const handleEnable2FAClick = (): void => {
    setError(t("twofactor.soon"))
  }

  const handleVerifySetup = (event: Event): void => {
    event.preventDefault()
    setError(t("twofactor.soon"))
  }

  const handleSendOTPClick = (): void => {
    setError(t("twofactor.soon"))
  }

  const handleVerifyOTPClick = (event: Event): void => {
    event.preventDefault()
    setError(t("twofactor.soon"))
  }

  const handleDisable2FAClick = (): void => {
    setError(t("twofactor.soon"))
  }

  const handleRegenerateBackupCodes = (): void => {
    setError(t("twofactor.soon"))
  }

  const tabClass = (tab: Tab): string =>
    `py-2 px-1 border-b-2 font-medium text-sm ${
      activeTab() === tab
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`

  return (
    <div class="min-h-screen flex items-center justify-center">
      <div class="max-w-2xl w-full space-y-8 p-6">
        <div>
          <h2 class="text-3xl font-bold text-center">{t("twofactor.title")}</h2>
          <p class="mt-2 text-center text-gray-600">{t("twofactor.subtitle")}</p>
        </div>

        {/* Tab Navigation */}
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8">
            <button type="button" onClick={() => setActiveTab("setup")} class={tabClass("setup")}>
              {t("twofactor.tabSetup")}
            </button>
            <button type="button" onClick={() => setActiveTab("verify")} class={tabClass("verify")}>
              {t("twofactor.tabVerify")}
            </button>
            <button type="button" onClick={() => setActiveTab("manage")} class={tabClass("manage")}>
              {t("twofactor.tabManage")}
            </button>
          </nav>
        </div>

        {/* Messages */}
        <Show when={error() !== null}>
          <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error()}</div>
        </Show>

        <Show when={success() !== null}>
          <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{success()}</div>
        </Show>

        {/* Setup Tab */}
        <Show when={activeTab() === "setup"}>
          <div class="space-y-6">
            <Show
              when={qrCode() !== null}
              fallback={
                <div class="text-center">
                  <h3 class="text-lg font-medium mb-4">{t("twofactor.enableTitle")}</h3>
                  <p class="text-gray-600 mb-6">{t("twofactor.enableBody")}</p>
                  <button
                    type="button"
                    onClick={handleEnable2FAClick}
                    disabled={isLoading() || is2FAEnabled()}
                    class="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading() ? t("twofactor.enabling") : is2FAEnabled() ? t("twofactor.alreadyEnabled") : t("twofactor.enable")}
                  </button>
                </div>
              }
            >
              <div class="space-y-6">
                <div class="text-center">
                  <h3 class="text-lg font-medium mb-4">{t("twofactor.scanTitle")}</h3>
                  <div class="bg-white p-4 inline-block border rounded-lg">
                    <img src={qrCode() ?? ""} alt="2FA QR Code" class="w-48 h-48" />
                  </div>
                  <p class="text-sm text-gray-600 mt-4">{t("twofactor.scanBody")}</p>
                </div>

                <form onSubmit={handleVerifySetup} class="space-y-4">
                  <div>
                    <label for="code" class="block text-sm font-medium">
                      {t("twofactor.verifyCode")}
                    </label>
                    <input
                      id="code"
                      type="text"
                      value={verificationCode()}
                      onInput={(event) => setVerificationCode(event.currentTarget.value)}
                      placeholder={t("twofactor.codePlaceholder")}
                      class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading()}
                    class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isLoading() ? t("twofactor.verifying") : t("twofactor.verifyEnable")}
                  </button>
                </form>
              </div>
            </Show>
          </div>
        </Show>

        {/* Verify Tab */}
        <Show when={activeTab() === "verify"}>
          <div class="space-y-6">
            <div class="text-center">
              <h3 class="text-lg font-medium mb-4">{t("twofactor.verifyTitle")}</h3>
              <p class="text-gray-600 mb-6">{t("twofactor.verifyBody")}</p>
            </div>

            <Show
              when={!otpSent()}
              fallback={
                <form onSubmit={handleVerifyOTPClick} class="space-y-4">
                  <div>
                    <label for="otp" class="block text-sm font-medium">
                      {t("twofactor.otpLabel")}
                    </label>
                    <input
                      id="otp"
                      type="text"
                      value={verificationCode()}
                      onInput={(event) => setVerificationCode(event.currentTarget.value)}
                      placeholder={t("twofactor.otpPlaceholder")}
                      class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading()}
                    class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isLoading() ? t("twofactor.verifying") : t("twofactor.verifyOtp")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    class="w-full text-gray-600 hover:underline"
                  >
                    {t("twofactor.sendNew")}
                  </button>
                </form>
              }
            >
              <button
                type="button"
                onClick={handleSendOTPClick}
                disabled={isLoading()}
                class="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {isLoading() ? t("twofactor.sending") : t("twofactor.sendOtp")}
              </button>
            </Show>
          </div>
        </Show>

        {/* Manage Tab */}
        <Show when={activeTab() === "manage"}>
          <div class="space-y-6">
            <div class="text-center">
              <h3 class="text-lg font-medium mb-2">{t("twofactor.statusTitle")}</h3>
              <div
                class={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                  is2FAEnabled() ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {is2FAEnabled() ? t("twofactor.enabledBadge") : t("twofactor.disabledBadge")}
              </div>
            </div>

            <Show when={is2FAEnabled()}>
              <div class="space-y-4">
                <div class="bg-gray-50 p-4 rounded-lg">
                  <h4 class="font-medium mb-2">{t("twofactor.backupCodes")}</h4>
                  <Show
                    when={backupCodes().length > 0}
                    fallback={<p class="text-gray-600">{t("twofactor.noBackup")}</p>}
                  >
                    <div class="space-y-2">
                      <div class="grid grid-cols-2 gap-2 text-sm font-mono">
                        <For each={backupCodes()}>{(code) => (
                          <div class="bg-white p-2 rounded border">
                            {code}
                          </div>
                        )}</For>
                      </div>
                      <p class="text-xs text-gray-600">{t("twofactor.backupHint")}</p>
                    </div>
                  </Show>
                </div>

                <div class="flex space-x-4">
                  <button
                    type="button"
                    onClick={handleRegenerateBackupCodes}
                    disabled={isLoading()}
                    class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading() ? t("twofactor.generating") : t("twofactor.generate")}
                  </button>

                  <button
                    type="button"
                    onClick={handleDisable2FAClick}
                    disabled={isLoading()}
                    class="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {isLoading() ? t("twofactor.disabling") : t("twofactor.disable")}
                  </button>
                </div>
              </div>
            </Show>

            <Show when={!is2FAEnabled()}>
              <div class="text-center">
                <p class="text-gray-600 mb-4">{t("twofactor.notEnabled")}</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("setup")}
                  class="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
                >
                  {t("twofactor.enable")}
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <div class="text-center">
          <A href="/" class="text-blue-600 hover:underline">
            {t("twofactor.back")}
          </A>
        </div>
      </div>
    </div>
  )
}
