/** Waitlist sign-up (`/waitlist`). The sidecar answers with the legacy `{ success, message }` body. */
import { Show, createSignal, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { Button, Field, Notice, TextField } from "../../../shared/components/enterprise.tsx"

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
      const message = typeof cause === "object" && cause !== null && "message" in cause ? (cause as { message?: unknown }).message : undefined
      setError(typeof message === "string" ? message : String(cause))
    } finally { setPending(false) }
  }
  return <div class="reference-standalone-container">
    <div class="ent-card" style={{ "max-width": "24rem" }}>
      <div class="ent-card__head">
        <h1 class="ent-header__title ent-header--document">{t("waitlist.title")}</h1>
        <p class="ent-header__description">{t("waitlist.subtitle")}</p>
      </div>
      <form class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={(e) => void submit(e)}>
        <Field label={t("waitlist.email")} id="waitlist-email">
          <TextField id="waitlist-email" type="email" value={email()} required onInput={setEmail} />
        </Field>
        <Button tone="primary" type="submit" block disabled={pending() || !email().trim()}>{t("waitlist.submit")}</Button>
        <Show when={done()}><Notice tone="ok">{done()}</Notice></Show>
        <Show when={error()}><Notice tone="bad">{t("common.error")} — {error()}</Notice></Show>
      </form>
    </div>
  </div>
}
