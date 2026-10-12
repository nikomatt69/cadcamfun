/**
 * Settings → Mobile companion: turn the phone gateway on or off, pair a phone with a QR code, revoke devices.
 *
 * The pairing link carries a one-time device token, so it is held in memory only while the QR code is on screen.
 * The user can either scan the QR code with the phone, or copy/paste the URL into CADCAM FUN manually.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Check, Copy, Smartphone } from "lucide-solid"
import qrcode from "qrcode-generator"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { t } from "../../../i18n/index.ts"
import { WorkspacePage } from "../../../shared/components/WorkspacePage.tsx"

const CARD = "ui-card ui-card-default !p-6"
const LABEL = "mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
const FIELD = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
const PRIMARY = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
const SECONDARY = "rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
const DANGER = "rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"

const qrSvg = (text: string): string => {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

/** The pairing body (gateway switch, QR code, paired devices); embedded in the Settings "Devices" tab and in the standalone page. */
export function CompanionPanel(): JSX.Element {
  const app = useApp()
  const status = useRead((c) => c.companion.status())
  const [name, setName] = createSignal("iPhone")
  const [host, setHost] = createSignal("")
  const [link, setLink] = createSignal<string>()
  const [copied, setCopied] = createSignal(false)
  const qr = createMemo(() => { const l = link(); return l ? qrSvg(l) : undefined })

  // The pairing link carries a one-time token, so the user can either scan the QR code
  // or copy/paste the URL into CADCAM FUN on their phone. The clipboard write can fail
  // (no permission, no document focus): show the error in a toast and leave the link
  // on screen so the user can still select it manually.
  const copyLink = async (): Promise<void> => {
    const value = link()
    if (value === undefined) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (cause) {
      toast.error(t("companion.pair.copyFailed", { message: String(cause) }))
    }
  }

  const act = async (run: () => Promise<unknown>) => {
    try {
      await run()
      await status.refetch()
    } catch (cause) {
      toast.error(t("companion.error.action", { message: String(cause) }))
    }
  }
  const state = () => status.data()

  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t("companion.title")}</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("companion.subtitle")}</p>
      </div>

      <Show when={status.error()}><p class="text-sm text-red-600 dark:text-red-400">{t("companion.error.load")}</p></Show>

      <Show when={state()}>
        {(s) => (
          <>
            <section class={CARD}>
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class={`inline-block h-2.5 w-2.5 rounded-full ${s().enabled ? "bg-green-500" : "bg-gray-400"}`} />
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {s().enabled ? t("companion.status.on", { port: String(s().port ?? "") }) : t("companion.status.off")}
                  </p>
                </div>
                <Show
                  when={s().enabled}
                  fallback={<button class={PRIMARY} onClick={() => act(() => app.runtime.run(app.client.companion.enable({ payload: {} })))}>{t("companion.enable")}</button>}
                >
                  <button class={SECONDARY} onClick={() => { setLink(undefined); void act(() => app.runtime.run(app.client.companion.disable())) }}>{t("companion.disable")}</button>
                </Show>
              </div>
              <Show when={s().fingerprint}>
                <p class="mt-3 break-all text-xs text-gray-500 dark:text-gray-400">{t("companion.fingerprint")}: <code>{s().fingerprint}</code></p>
              </Show>
            </section>

            <Show when={s().enabled}>
              <section class={`${CARD} space-y-4`}>
                <h4 class="text-base font-medium text-gray-900 dark:text-white">{t("companion.pair")}</h4>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label class={LABEL}>{t("companion.pair.name")}</label>
                    <input class={FIELD} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
                  </div>
                  <div>
                    <label class={LABEL}>{t("companion.pair.host")}</label>
                    <input class={FIELD} placeholder={s().host} value={host()} onInput={(e) => setHost(e.currentTarget.value)} />
                  </div>
                </div>
                <button class={PRIMARY} onClick={() => act(async () => {
                  const paired = await app.runtime.run(app.client.companion.pair({ payload: { name: name(), ...(host().trim() ? { host: host().trim() } : {}) } }))
                  setLink(paired.link)
                })}>{t("companion.pair.create")}</button>
                <Show when={link()}>
                  {(current) => (
                    <>
                      {/* eslint-disable-next-line solid/no-innerhtml -- generated locally from the pairing link, no user HTML */}
                      <Show when={qr()}>
                        <div class="mx-auto w-64 rounded-lg bg-white p-2 shadow-sm" innerHTML={qr()} />
                      </Show>
                      <p class="text-center text-xs text-gray-500 dark:text-gray-400">{t("companion.pair.hint")}</p>
                      <div class="space-y-1">
                        <label class={LABEL}>{t("companion.pair.link")}</label>
                        <div class="flex items-stretch gap-2">
                          <input
                            class={`${FIELD} font-mono text-xs`}
                            value={current()}
                            readonly
                            aria-label={t("companion.pair.link")}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.currentTarget.select()}
                          />
                          <button
                            type="button"
                            class={copied() ? `${SECONDARY} flex items-center gap-1` : `${PRIMARY} flex items-center gap-1`}
                            onClick={() => void copyLink()}
                            aria-label={t("companion.pair.copy")}
                          >
                            <Show when={copied()} fallback={<Copy size={14} aria-hidden="true" />}>
                              <Check size={14} aria-hidden="true" />
                            </Show>
                            {copied() ? t("companion.pair.copied") : t("companion.pair.copy")}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </Show>
              </section>
            </Show>

            <section class={CARD}>
              <h4 class="text-base font-medium text-gray-900 dark:text-white">{t("companion.devices")}</h4>
              <ul class="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
                <For each={s().devices} fallback={<li class="py-2 text-sm text-gray-500 dark:text-gray-400">{t("companion.devices.empty")}</li>}>
                  {(d) => (
                    <li class="flex items-center justify-between gap-4 py-3">
                      <div class="flex items-center gap-3">
                        <Smartphone class="h-5 w-5 text-gray-400" aria-hidden="true" />
                        <div>
                          <p class="text-sm font-medium text-gray-900 dark:text-white">{d.name}</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">{d.lastSeen ? t("companion.devices.lastSeen", { when: new Date(d.lastSeen).toLocaleString() }) : t("companion.devices.never")}</p>
                        </div>
                      </div>
                      <button class={DANGER} onClick={() => act(() => app.runtime.run(app.client.companion.revoke({ params: { id: d.id } })))}>{t("companion.revoke")}</button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </>
        )}
      </Show>
    </div>
  )
}

export function CompanionScreen(): JSX.Element {
  return (
    <WorkspacePage title={t("companion.title")}>
      <div class="mx-auto max-w-2xl"><CompanionPanel /></div>
    </WorkspacePage>
  )
}
