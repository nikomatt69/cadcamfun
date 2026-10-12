import { Show, createSignal, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { ErrorState, ScreenHeader, Toast } from "../../../shared/components/screen-parts.tsx"

/** Waitlist sign-up (`/waitlist`). The sidecar answers with the legacy `{ success, message }` body. */
export function WaitlistScreen(): JSX.Element {
  const app = useApp()
  const [email, setEmail] = createSignal("")
  const [done, setDone] = createSignal<string>()
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const submit = async (event: Event) => {
    event.preventDefault(); if (pending()) return
    setPending(true); setError(undefined); setDone(undefined)
    try {
      const r = await app.runtime.run(app.client.waitlist.join({ payload: { email: email().trim() } }))
      setDone(r.message || t("waitlist.done")); setEmail("")
    } catch (cause) {
      const message = typeof cause === "object" && cause !== null ? (cause as { message?: unknown }).message : undefined
      setError(typeof message === "string" ? message : String(cause))
    } finally { setPending(false) }
  }
  return <section>
    <ScreenHeader title={t("waitlist.title")} subtitle={t("waitlist.subtitle")} />
    <form class="card m-5 grid max-w-md gap-3 p-4" onSubmit={(e) => void submit(e)}>
      <label class="form-label">{t("waitlist.email")}<input class="form-input" type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} /></label>
      <button class="btn btn-primary" disabled={pending() || !email().trim()}>{t("waitlist.submit")}</button>
      <Toast message={done()} />
      <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
    </form>
  </section>
}
