/**
 * `/auth/two-factor` — port of `.reference/src/pages/auth/two-factor.tsx`.
 *
 * The legacy page is a pure placeholder: every handler answers with
 * `'2FA functionality will be available soon'` and no endpoint is ever called
 * (the status check is a commented-out TODO). The screen is therefore a UI port —
 * tabs, messages and buttons reproduce the legacy markup.
 *
 * Deviation: the legacy `if (!user)` "Please sign in to manage 2FA settings" guard is
 * omitted; the desktop app has a single always-present local profile.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"
import { Button, Field, Notice, TextField } from "../../../shared/components/enterprise.tsx"

type Tab = "setup" | "verify" | "manage"

const TABS: ReadonlyArray<{ readonly id: Tab; readonly labelKey: "twofactor.tabSetup" | "twofactor.tabVerify" | "twofactor.tabManage" }> = [
  { id: "setup", labelKey: "twofactor.tabSetup" },
  { id: "verify", labelKey: "twofactor.tabVerify" },
  { id: "manage", labelKey: "twofactor.tabManage" }
]

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

  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "34rem" }}>
        <div class="ent-card__head">
          <h1 class="ent-header__title ent-header--document">{t("twofactor.title")}</h1>
          <p class="ent-header__description">{t("twofactor.subtitle")}</p>
        </div>

        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <div class="workspace-tabs" role="tablist" aria-label={t("twofactor.title")}>
            <For each={TABS}>
              {(tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab() === tab.id}
                  class="workspace-tab"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {t(tab.labelKey)}
                </button>
              )}
            </For>
          </div>

          <Show when={error() !== null}><Notice tone="bad">{error()}</Notice></Show>
          <Show when={success() !== null}><Notice tone="ok">{success()}</Notice></Show>

          {/* Setup Tab */}
          <Show when={activeTab() === "setup"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
              <Show
                when={qrCode() !== null}
                fallback={
                  <div style={{ display: "flex", "flex-direction": "column", gap: "10px", "align-items": "flex-start" }}>
                    <h2 class="ent-section__title">{t("twofactor.enableTitle")}</h2>
                    <p class="ent-header__description">{t("twofactor.enableBody")}</p>
                    <Button tone="primary" onClick={handleEnable2FAClick} disabled={isLoading() || is2FAEnabled()}>
                      {isLoading() ? t("twofactor.enabling") : is2FAEnabled() ? t("twofactor.alreadyEnabled") : t("twofactor.enable")}
                    </Button>
                  </div>
                }
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                  <h2 class="ent-section__title">{t("twofactor.scanTitle")}</h2>
                  <div class="ent-card" style={{ padding: "14px", display: "flex", "justify-content": "center" }}>
                    <img src={qrCode() ?? ""} alt="2FA QR Code" style={{ width: "176px", height: "176px" }} />
                  </div>
                  <p class="ent-header__description">{t("twofactor.scanBody")}</p>
                  <form style={{ display: "flex", "flex-direction": "column", gap: "10px" }} onSubmit={handleVerifySetup}>
                    <Field label={t("twofactor.verifyCode")} id="code">
                      <TextField id="code" value={verificationCode()} required placeholder={t("twofactor.codePlaceholder")} onInput={setVerificationCode} />
                    </Field>
                    <Button tone="primary" type="submit" disabled={isLoading()}>
                      {isLoading() ? t("twofactor.verifying") : t("twofactor.verifyEnable")}
                    </Button>
                  </form>
                </div>
              </Show>
            </div>
          </Show>

          {/* Verify Tab */}
          <Show when={activeTab() === "verify"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
              <h2 class="ent-section__title">{t("twofactor.verifyTitle")}</h2>
              <p class="ent-header__description">{t("twofactor.verifyBody")}</p>

              <Show
                when={!otpSent()}
                fallback={
                  <form style={{ display: "flex", "flex-direction": "column", gap: "10px" }} onSubmit={handleVerifyOTPClick}>
                    <Field label={t("twofactor.otpLabel")} id="otp">
                      <TextField id="otp" value={verificationCode()} required placeholder={t("twofactor.otpPlaceholder")} onInput={setVerificationCode} />
                    </Field>
                    <Button tone="primary" type="submit" disabled={isLoading()}>
                      {isLoading() ? t("twofactor.verifying") : t("twofactor.verifyOtp")}
                    </Button>
                    <Button tone="ghost" onClick={() => setOtpSent(false)}>{t("twofactor.sendNew")}</Button>
                  </form>
                }
              >
                <Button tone="primary" onClick={handleSendOTPClick} disabled={isLoading()}>
                  {isLoading() ? t("twofactor.sending") : t("twofactor.sendOtp")}
                </Button>
              </Show>
            </div>
          </Show>

          {/* Manage Tab */}
          <Show when={activeTab() === "manage"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
              <h2 class="ent-section__title">{t("twofactor.statusTitle")}</h2>
              <div>
                <span class={`workspace-badge${is2FAEnabled() ? " workspace-badge--ok" : " workspace-badge--warn"}`}>
                  {is2FAEnabled() ? t("twofactor.enabledBadge") : t("twofactor.disabledBadge")}
                </span>
              </div>

              <Show when={is2FAEnabled()}>
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                  <div class="ent-card">
                    <div class="ent-card__head"><h3 class="ent-section__title">{t("twofactor.backupCodes")}</h3></div>
                    <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                      <Show
                        when={backupCodes().length > 0}
                        fallback={<p class="ent-header__description">{t("twofactor.noBackup")}</p>}
                      >
                        <div style={{ display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "6px", "font-family": "var(--ent-mono)", "font-size": "11px" }}>
                          <For each={backupCodes()}>{(code) => <div class="ent-card" style={{ padding: "6px 8px" }}>{code}</div>}</For>
                        </div>
                        <p class="ent-field__hint">{t("twofactor.backupHint")}</p>
                      </Show>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button onClick={handleRegenerateBackupCodes} disabled={isLoading()}>
                      {isLoading() ? t("twofactor.generating") : t("twofactor.generate")}
                    </Button>
                    <Button tone="danger" onClick={handleDisable2FAClick} disabled={isLoading()}>
                      {isLoading() ? t("twofactor.disabling") : t("twofactor.disable")}
                    </Button>
                  </div>
                </div>
              </Show>

              <Show when={!is2FAEnabled()}>
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px", "align-items": "flex-start" }}>
                  <p class="ent-header__description">{t("twofactor.notEnabled")}</p>
                  <Button tone="primary" onClick={() => setActiveTab("setup")}>{t("twofactor.enable")}</Button>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="ent-card__foot" style={{ "text-align": "center" }}>
          <A href="/" style={{ color: "var(--ent-accent)", "font-size": "12px" }}>{t("twofactor.back")}</A>
        </div>
      </div>
    </div>
  )
}
