/**
 * Settings → Mobile companion: turn the phone gateway on or off, pair a phone with a QR code, revoke devices.
 *
 * The pairing link carries a one-time device token, so it is held in memory only while the QR code is on screen.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import qrcode from "qrcode-generator"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { toast } from "../components/ui/feedback.tsx"
import { t } from "../i18n/index.ts"
import { PANEL, WorkspacePage } from "../components/WorkspacePage.tsx"

const qrSvg = (text: string): string => {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

export function CompanionScreen(): JSX.Element {
  const app = useApp()
  const status = useRead((c) => c.companion.status())
  const [name, setName] = createSignal("iPhone")
  const [host, setHost] = createSignal("")
  const [link, setLink] = createSignal<string>()
  const qr = createMemo(() => { const l = link(); return l ? qrSvg(l) : undefined })

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
    <WorkspacePage title={t("companion.title")}>
      <div class="mx-auto max-w-2xl space-y-6">
      <p class="text-sm text-gray-500 dark:text-gray-400">{t("companion.subtitle")}</p>

      <Show when={status.error()}><p class="text-red-600">{t("companion.error.load")}</p></Show>

      <Show when={state()}>
        {(s) => (
          <>
            <section class={PANEL}>
              <p>{s().enabled ? t("companion.status.on", { port: String(s().port ?? "") }) : t("companion.status.off")}</p>
              <Show when={s().fingerprint}><p class="mt-2 break-all text-xs text-gray-500">{t("companion.fingerprint")}: <code>{s().fingerprint}</code></p></Show>
              <div class="mt-3">
                <Show
                  when={s().enabled}
                  fallback={<button class="btn" onClick={() => act(() => app.runtime.run(app.client.companion.enable({ payload: {} })))}>{t("companion.enable")}</button>}
                >
                  <button class="btn" onClick={() => { setLink(undefined); void act(() => app.runtime.run(app.client.companion.disable())) }}>{t("companion.disable")}</button>
                </Show>
              </div>
            </section>

            <Show when={s().enabled}>
              <section class={`${PANEL} space-y-3`}>
                <h2 class="font-medium">{t("companion.pair")}</h2>
                <label class="block text-sm">{t("companion.pair.name")}
                  <input class="mt-1 w-full rounded border p-2" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
                </label>
                <label class="block text-sm">{t("companion.pair.host")}
                  <input class="mt-1 w-full rounded border p-2" placeholder={s().host} value={host()} onInput={(e) => setHost(e.currentTarget.value)} />
                </label>
                <button class="btn" onClick={() => act(async () => {
                  const paired = await app.runtime.run(app.client.companion.pair({ payload: { name: name(), ...(host().trim() ? { host: host().trim() } : {}) } }))
                  setLink(paired.link)
                })}>{t("companion.pair.create")}</button>
                <Show when={qr()}>
                  {/* eslint-disable-next-line solid/no-innerhtml -- generated locally from the pairing link, no user HTML */}
                  <div class="mx-auto w-64 bg-white p-2" innerHTML={qr()} />
                  <p class="text-xs text-gray-500">{t("companion.pair.hint")}</p>
                </Show>
              </section>
            </Show>

            <section class={PANEL}>
              <h2 class="font-medium">{t("companion.devices")}</h2>
              <ul class="mt-2 space-y-2">
                <For each={s().devices} fallback={<li class="text-sm text-gray-500">{t("companion.devices.empty")}</li>}>
                  {(d) => (
                    <li class="flex items-center justify-between">
                      <span>{d.name}<br /><span class="text-xs text-gray-500">{d.lastSeen ? t("companion.devices.lastSeen", { when: new Date(d.lastSeen).toLocaleString() }) : t("companion.devices.never")}</span></span>
                      <button class="btn" onClick={() => act(() => app.runtime.run(app.client.companion.revoke({ params: { id: d.id } })))}>{t("companion.revoke")}</button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </>
        )}
      </Show>
      </div>
    </WorkspacePage>
  )
}
