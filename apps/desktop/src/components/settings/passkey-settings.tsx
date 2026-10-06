/**
 * `.reference/src/components/settings/PasskeySettings.tsx` — the Security tab.
 *
 * The support probe is the legacy `checkPasskeySupport` (a `PublicKeyCredential`
 * platform-authenticator check). v6's contract has no passkey *list* route, so the list
 * renders the legacy empty state instead of a fabricated error; "Add Passkey" drives
 * `POST /api/auth/passkey-register`, whose legacy handler answers 501 — the message is
 * surfaced exactly like the legacy failure path surfaced `result.message`.
 */
import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { AlertTriangle, Computer, Fingerprint, Phone, Plus, ShieldCheck, Trash } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"

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
  if (transports.includes("usb") || transports.includes("nfc")) return <ShieldCheck class="h-5 w-5 text-blue-500" />
  if (transports.includes("internal")) return <Phone class="h-5 w-5 text-green-500" />
  return <Computer class="h-5 w-5 text-gray-500" />
}

const getDeviceType = (transports: readonly string[]): string => {
  if (transports.includes("internal")) return t("settings.passkeys.deviceBuiltIn")
  if (transports.includes("usb")) return t("settings.passkeys.deviceUsb")
  if (transports.includes("nfc")) return t("settings.passkeys.deviceNfc")
  if (transports.includes("ble")) return t("settings.passkeys.deviceBle")
  return t("settings.passkeys.deviceKey")
}

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
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
          <div class="flex items-start space-x-3">
            <AlertTriangle class="h-6 w-6 text-amber-500 flex-shrink-0 mt-1" />
            <div>
              <h3 class="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
                {t("settings.passkeys.unsupported")}
              </h3>
              <p class="text-amber-700 dark:text-amber-300 mb-4">{t("settings.passkeys.unsupportedBody")}</p>
              <ul class="list-disc list-inside text-amber-700 dark:text-amber-300 space-y-1 text-sm">
                <li>A modern browser (Chrome 67+, Safari 14+, Firefox 60+)</li>
                <li>A device with biometric authentication (TouchID, FaceID, Windows Hello)</li>
                <li>Or a security key (YubiKey, etc.)</li>
              </ul>
            </div>
          </div>
        </Motion.div>
      }
    >
      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} class="space-y-6">
        {/* Header */}
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
              <Fingerprint class="h-7 w-7 mr-3 text-blue-500" />
              {t("settings.passkeys.title")}
            </h2>
            <p class="text-gray-600 dark:text-gray-400 mt-1">{t("settings.passkeys.subtitle")}</p>
          </div>

          <Motion.button
            onClick={() => void handleRegisterPasskey()}
            disabled={registering()}
            hover={{ scale: 1.02 }}
            press={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
            class="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Show
              when={registering()}
              fallback={
                <>
                  <Plus class="h-4 w-4 mr-2" />
                  {t("settings.passkeys.add")}
                </>
              }
            >
              <>
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2 animate-spin" />
                {t("settings.passkeys.adding")}
              </>
            </Show>
          </Motion.button>
        </div>

        {/* Messages */}
        <Show when={error() !== undefined}>
          <Motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
          >
            {error()}
          </Motion.div>
        </Show>

        <Show when={success() !== undefined}>
          <Motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg"
          >
            {success()}
          </Motion.div>
        </Show>

        {/* Passkeys List */}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <Show
            when={!loading()}
            fallback={
              <div class="p-8 text-center">
                <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("settings.passkeys.loading")}</p>
              </div>
            }
          >
            <Show
              when={passkeys().length > 0}
              fallback={
                <div class="p-8 text-center">
                  <Fingerprint class="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">{t("settings.passkeys.empty")}</h3>
                  <p class="text-gray-500 dark:text-gray-400 mb-4">{t("settings.passkeys.emptyHint")}</p>
                </div>
              }
            >
              <div class="divide-y divide-gray-200 dark:divide-gray-700">
                <For each={passkeys()}>
                  {(passkey, index) => (
                    <Motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index() * 0.1 }}
                      class="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div class="flex items-center space-x-4">
                        <DeviceIcon transports={passkey.transports ?? []} />
                        <div>
                          <h4 class="font-medium text-gray-900 dark:text-white">
                            {getDeviceType(passkey.transports ?? [])}
                          </h4>
                          <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                            <Show when={passkey.lastUsed !== undefined}>
                              <p>{t("settings.passkeys.lastUsed", { date: new Date(passkey.lastUsed ?? "").toLocaleDateString() })}</p>
                            </Show>
                            <p class="text-xs font-mono text-gray-400">
                              ID: {passkey.credentialID.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </div>

                      <Motion.button
                        onClick={() => handleDeletePasskey(passkey.id)}
                        hover={{ scale: 1.05 }}
                        press={{ scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t("settings.passkeys.removeTitle")}
                      >
                        <Trash class="h-4 w-4" />
                      </Motion.button>
                    </Motion.div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        {/* Info Section */}
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 class="font-semibold text-blue-900 dark:text-blue-200 mb-3">{t("settings.passkeys.about")}</h3>
          <ul class="text-blue-800 dark:text-blue-300 text-sm space-y-2">
            <li>• Passkeys are more secure than passwords - they can't be phished or stolen</li>
            <li>• You can add multiple passkeys for different devices</li>
            <li>• Passkeys work with TouchID, FaceID, Windows Hello, or security keys</li>
            <li>• You can still use your email and password if needed</li>
          </ul>
        </div>
      </Motion.div>
    </Show>
  )
}
