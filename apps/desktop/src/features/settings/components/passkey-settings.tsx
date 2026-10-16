/**
 * `.reference/src/components/settings/PasskeySettings.tsx` — the Security tab.
 *
 * The support probe is the legacy `checkPasskeySupport` (a `PublicKeyCredential`
 * platform-authenticator check). v6's contract has no passkey *list* route, so the list
 * renders the legacy empty state instead of a fabricated error; "Add Passkey" drives
 * `POST /api/auth/passkey-register`, whose legacy handler answers 501 — the message is
 * surfaced exactly like the legacy failure path surfaced `result.message`.
 *
 * Styling is the workstation vocabulary: neutral translucent surfaces, one accent
 * (blue), no hover scaling.
 */
import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import { AlertTriangle, Computer, Fingerprint, Phone, Plus, ShieldCheck, Trash } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"

interface Passkey {
  readonly id: string
  readonly credentialID: string
  readonly transports: string[]
  readonly counter: number
  readonly lastUsed?: string
}

/** `.reference/src/store/authStore.ts` `checkPasskeySupport`. */
const checkPasskeySupport = async (): Promise<boolean> => {
  if (typeof window !== "undefined" && window.PublicKeyCredential) {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }
  return false
}

const describe = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    const candidate = cause as { error?: unknown; details?: unknown; message?: unknown }
    if (typeof candidate.error === "string") {
      return typeof candidate.details === "string" ? `${candidate.error}: ${candidate.details}` : candidate.error
    }
    if (typeof candidate.message === "string") return candidate.message
  }
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  return String(cause)
}

const DeviceIcon = (props: { readonly transports: readonly string[] }): JSX.Element => {
  const transports = props.transports
  if (transports.includes("usb") || transports.includes("nfc")) return <ShieldCheck class="h-5 w-5 text-slate-400 dark:text-slate-500" />
  if (transports.includes("internal")) return <Phone class="h-5 w-5 text-slate-400 dark:text-slate-500" />
  return <Computer class="h-5 w-5 text-slate-400 dark:text-slate-500" />
}

const getDeviceType = (transports: readonly string[]): string => {
  if (transports.includes("internal")) return t("settings.passkeys.deviceBuiltIn")
  if (transports.includes("usb")) return t("settings.passkeys.deviceUsb")
  if (transports.includes("nfc")) return t("settings.passkeys.deviceNfc")
  if (transports.includes("ble")) return t("settings.passkeys.deviceBle")
  return t("settings.passkeys.deviceKey")
}

/** Card surface — the neutral translucent panel of the list pages. */
const CARD = "rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60"
const PRIMARY_BUTTON = "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700 disabled:opacity-50"
const ICON_BUTTON = "rounded-md p-1.5 text-slate-400 transition-colors duration-150 ease-out hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"

export function PasskeySettings(): JSX.Element {
  const app = useApp()
  // The legacy store starts at `false` and flips once the platform check answers.
  const [supported, setSupported] = createSignal(false)
  const [passkeys, setPasskeys] = createSignal<readonly Passkey[]>([])
  const [loading, setLoading] = createSignal(true)
  const [registering, setRegistering] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [success, setSuccess] = createSignal<string | undefined>(undefined)

  onMount(() => {
    void (async () => {
      setSupported(await checkPasskeySupport())
      // No `/api/auth/passkey/list` in the contract: the list starts empty, which is how
      // the legacy screen renders before a single credential exists.
      setPasskeys([])
      setLoading(false)
    })()
  })

  const handleRegisterPasskey = async (): Promise<void> => {
    setRegistering(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      // `Schema.Never`: the legacy handler always answers 501, so this never resolves.
      await app.runtime.run(app.client.auth.registerPasskey({}))
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setRegistering(false)
    }
  }

  const handleDeletePasskey = (passkeyId: string): void => {
    if (!window.confirm(t("settings.passkeys.removeConfirm"))) return
    setPasskeys((current) => current.filter((passkey) => passkey.id !== passkeyId))
    setSuccess(t("settings.passkeys.removed"))
  }

  return (
    <Show
      when={supported()}
      fallback={
        <div class="rounded-xl border border-amber-200/70 bg-amber-50/70 p-6 dark:border-amber-800/50 dark:bg-amber-900/20">
          <div class="flex items-start gap-3">
            <AlertTriangle class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <div>
              <h3 class="mb-2 text-base font-medium text-amber-900 dark:text-amber-200">
                {t("settings.passkeys.unsupported")}
              </h3>
              <p class="mb-4 text-sm text-amber-800 dark:text-amber-300">{t("settings.passkeys.unsupportedBody")}</p>
              <ul class="list-inside list-disc space-y-1 text-sm text-amber-800 dark:text-amber-300">
                <li>A modern browser (Chrome 67+, Safari 14+, Firefox 60+)</li>
                <li>A device with biometric authentication (TouchID, FaceID, Windows Hello)</li>
                <li>Or a security key (YubiKey, etc.)</li>
              </ul>
            </div>
          </div>
        </div>
      }
    >
      <div class="space-y-6">
        {/* Header */}
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.passkeys.title")}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.passkeys.subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={() => void handleRegisterPasskey()}
            disabled={registering()}
            class={PRIMARY_BUTTON}
          >
            <Show
              when={registering()}
              fallback={
                <>
                  <Plus class="h-4 w-4" />
                  {t("settings.passkeys.add")}
                </>
              }
            >
              <>
                <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("settings.passkeys.adding")}
              </>
            </Show>
          </button>
        </div>

        {/* Messages */}
        <Show when={error() !== undefined}>
          <div class="rounded-lg border border-red-200/70 bg-red-50/70 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
            {error()}
          </div>
        </Show>

        <Show when={success() !== undefined}>
          <div class="rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3.5 py-2.5 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {success()}
          </div>
        </Show>

        {/* Passkeys List */}
        <div class={CARD}>
          <Show
            when={!loading()}
            fallback={
              <div class="p-8 text-center">
                <div class="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500" />
                <p class="text-sm text-slate-500 dark:text-slate-400">{t("settings.passkeys.loading")}</p>
              </div>
            }
          >
            <Show
              when={passkeys().length > 0}
              fallback={
                <div class="p-8 text-center">
                  <Fingerprint class="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <h4 class="mb-2 text-base font-medium text-slate-900 dark:text-white">{t("settings.passkeys.empty")}</h4>
                  <p class="text-sm text-slate-500 dark:text-slate-400">{t("settings.passkeys.emptyHint")}</p>
                </div>
              }
            >
              <div class="divide-y divide-slate-200/70 dark:divide-slate-700/50">
                <For each={passkeys()}>
                  {(passkey) => (
                    <div class="flex items-center justify-between p-6 transition-colors duration-150 ease-out hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div class="flex items-center space-x-4">
                        <DeviceIcon transports={passkey.transports ?? []} />
                        <div>
                          <h5 class="font-medium text-slate-900 dark:text-white">
                            {getDeviceType(passkey.transports ?? [])}
                          </h5>
                          <div class="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <Show when={passkey.lastUsed !== undefined}>
                              <p>{t("settings.passkeys.lastUsed", { date: new Date(passkey.lastUsed ?? "").toLocaleDateString() })}</p>
                            </Show>
                            <p class="font-mono text-xs text-slate-400 dark:text-slate-500">
                              ID: {passkey.credentialID.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePasskey(passkey.id)}
                        class={ICON_BUTTON}
                        title={t("settings.passkeys.removeTitle")}
                      >
                        <Trash class="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        {/* Info Section */}
        <div class={CARD + " p-6"}>
          <h4 class="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.passkeys.about")}</h4>
          <ul class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
            <li>• Passkeys are more secure than passwords - they can't be phished or stolen</li>
            <li>• You can add multiple passkeys for different devices</li>
            <li>• Passkeys work with TouchID, FaceID, Windows Hello, or security keys</li>
            <li>• You can still use your email and password if needed</li>
          </ul>
        </div>
      </div>
    </Show>
  )
}
