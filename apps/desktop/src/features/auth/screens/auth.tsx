/**
 * The e-mail based auth pages (forgot password, reset password, magic link, e-mail
 * verification). The desktop app has no login screen (a single local profile); these
 * pages exist for route parity and drive the same legacy endpoints.
 */
import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { CircleCheck, CircleX } from "lucide-solid"
import Loader from "lucide-solid/icons/loader-circle"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { startSession } from "../../../shared/state/session.ts"
import { Button, Field, Notice, TextField } from "../../../shared/components/enterprise.tsx"

/** Auth failures carry `{ error, details }`; show both, else `fallback`. */
export const describe = (cause: unknown, fallback: string = String(cause)): string => {
  if (typeof cause === "object" && cause !== null) {
    const e = cause as { error?: unknown; details?: unknown; message?: unknown }
    if (typeof e.error === "string") return typeof e.details === "string" ? `${e.error}: ${e.details}` : e.error
    if (typeof e.message === "string" && e.message.length > 0) return e.message
  }
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  return fallback
}

function useAction() {
  const [error, setError] = createSignal<string>()
  const [done, setDone] = createSignal<string>()
  const [debug, setDebug] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const run = async (work: () => Promise<{ message: string; debug?: string | undefined } | void>) => {
    if (pending()) return
    setPending(true); setError(undefined); setDone(undefined); setDebug(undefined)
    try {
      const r = await work()
      if (r) { setDone(r.message); setDebug(r.debug) }
    } catch (cause) { setError(describe(cause)) } finally { setPending(false) }
  }
  return { error, done, debug, pending, run }
}

/** The centred document card the single-step auth pages share. */
const AuthCard = (props: { readonly title: string; readonly subtitle?: string; readonly children: JSX.Element }): JSX.Element => (
  <div class="reference-standalone-container">
    <div class="ent-card" style={{ "max-width": "24rem" }}>
      <div class="ent-card__head">
        <h1 class="ent-header__title ent-header--document">{props.title}</h1>
        <Show when={props.subtitle !== undefined}>
          <p class="ent-header__description">{props.subtitle}</p>
        </Show>
      </div>
      {props.children}
    </div>
  </div>
)

const Feedback = (props: { a: ReturnType<typeof useAction> }): JSX.Element => <>
  <Show when={props.a.done()}><Notice tone="ok">{props.a.done()}</Notice></Show>
  <Show when={props.a.debug()}><p class="break-all font-mono text-xs"><strong>{t("auth.debugLink")}: </strong>{props.a.debug()}</p></Show>
  <Show when={props.a.error()}><Notice tone="bad">{props.a.error()}</Notice></Show>
</>

export function ForgotPasswordScreen(): JSX.Element {
  const app = useApp(); const a = useAction(); const [email, setEmail] = createSignal("")
  return <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
    <form class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.forgotPassword({ payload: { email: email().trim() } }))
      return { message: r.message, debug: r.debugResetLink }
    }) }}>
      <Field label={t("auth.email")} id="forgot-email">
        <TextField id="forgot-email" type="email" value={email()} required onInput={setEmail} />
      </Field>
      <Button tone="primary" type="submit" block disabled={a.pending() || !email().trim()}>{t("auth.send")}</Button>
      <Feedback a={a} />
    </form>
  </AuthCard>
}

export function MagicLinkScreen(): JSX.Element {
  const app = useApp(); const a = useAction(); const [email, setEmail] = createSignal("")
  return <AuthCard title={t("auth.magic.title")} subtitle={t("auth.magic.subtitle")}>
    <form class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.sendMagicLink({ payload: { email: email().trim() } }))
      return { message: r.message, debug: r.debugMagicLink }
    }) }}>
      <Field label={t("auth.email")} id="magic-email">
        <TextField id="magic-email" type="email" value={email()} required onInput={setEmail} />
      </Field>
      <Button tone="primary" type="submit" block disabled={a.pending() || !email().trim()}>{t("auth.send")}</Button>
      <Feedback a={a} />
    </form>
  </AuthCard>
}

export function ResetPasswordScreen(): JSX.Element {
  const app = useApp(); const a = useAction()
  const [search] = useSearchParams<{ token?: string }>()
  const [password, setPassword] = createSignal(""); const [confirm, setConfirm] = createSignal("")
  return <AuthCard title={t("auth.reset.title")}>
    <form class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.resetPassword({ payload: { token: search.token, newPassword: password(), confirmPassword: confirm() } }))
      return { message: r.message }
    }) }}>
      <Show when={!search.token}><Notice tone="bad">{t("auth.reset.missingToken")}</Notice></Show>
      <Field label={t("auth.reset.password")} id="reset-password">
        <TextField id="reset-password" type="password" value={password()} required onInput={setPassword} />
      </Field>
      <Field label={t("auth.reset.confirm")} id="reset-confirm">
        <TextField id="reset-confirm" type="password" value={confirm()} required onInput={setConfirm} />
      </Field>
      <Button tone="primary" type="submit" block disabled={a.pending() || !search.token}>{t("auth.reset.submit")}</Button>
      <Feedback a={a} />
    </form>
  </AuthCard>
}

export function VerifyEmailScreen(): JSX.Element {
  const app = useApp(); const a = useAction()
  const [search] = useSearchParams<{ token?: string }>()
  onMount(() => { if (search.token) void a.run(async () => {
    await app.runtime.run(app.client.auth.verifyEmail({ payload: { token: search.token } }))
    return { message: t("auth.verify.done") }
  }) })
  return <AuthCard title={t("auth.verify.title")}>
    <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      <Show when={!search.token}><Notice tone="bad">{t("auth.verify.missingToken")}</Notice></Show>
      <Show when={a.pending()}><Notice>{t("auth.verify.working")}</Notice></Show>
      <Feedback a={a} />
      <A class="ent-btn" href="/">{t("activity.projects")}</A>
    </div>
  </AuthCard>
}

/**
 * `/auth/magic-link/verify` — port of `.reference/src/pages/auth/magic-link/verify.tsx`.
 *
 * One `?token=` drives `POST /api/auth/verify-magic-link`, then the legacy four states
 * (loading / success with a 2 s redirect to the dashboard / expired / error).
 */
export function MagicLinkVerifyScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [search] = useSearchParams<{ token?: string }>()
  const [status, setStatus] = createSignal<"loading" | "success" | "error" | "expired">("loading")
  const [message, setMessage] = createSignal("")
  let alive = true
  onCleanup(() => { alive = false })
  onMount(() => {
    const token = search.token
    if (!token) { setStatus("error"); setMessage(t("magicverify.noToken")); return }
    void (async () => {
      try {
        const result = await app.runtime.run(app.client.auth.verifyMagicLink({ payload: { token } }))
        if (result.body.token !== undefined) startSession(app.cache, result.body.token)
        setStatus("success")
        setMessage(t("magicverify.successBody"))
        setTimeout(() => { if (alive) navigate("/") }, 2000)
      } catch (cause) {
        const detail = describe(cause, t("magicverify.failedMessage"))
        if (detail.toLowerCase().includes("expired")) { setStatus("expired"); setMessage(t("magicverify.expiredMessage")) }
        else if (typeof cause === "object" && cause !== null && "error" in cause) { setStatus("error"); setMessage(detail) }
        else { setStatus("error"); setMessage(t("magicverify.invalidMessage")) }
      }
    })()
  })
  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "24rem" }}>
        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px", "align-items": "center", "text-align": "center" }}>
          <Show when={status() === "loading"}>
            <div class="ent-stat__icon" style={{ padding: "12px" }}><Loader size={26} aria-hidden="true" /></div>
            <h1 class="ent-header__title ent-header--document">{t("magicverify.verifying")}</h1>
            <p class="ent-header__description">{t("magicverify.wait")}</p>
          </Show>
          <Show when={status() === "success"}>
            <CircleCheck size={30} aria-hidden="true" style={{ color: "var(--ent-ok)" }} />
            <h1 class="ent-header__title ent-header--document">{t("magicverify.successTitle")}</h1>
            <p class="ent-header__description">{message()}</p>
            <p class="ent-field__hint">{t("magicverify.redirecting")}</p>
          </Show>
          <Show when={status() === "expired"}>
            <CircleX size={30} aria-hidden="true" style={{ color: "var(--ent-warn)" }} />
            <h1 class="ent-header__title ent-header--document">{t("magicverify.expiredTitle")}</h1>
            <p class="ent-header__description">{t("magicverify.expiredBody")}</p>
            <A class="ent-btn ent-btn--primary" href="/auth/signin">{t("magicverify.getNew")}</A>
          </Show>
          <Show when={status() === "error"}>
            <CircleX size={30} aria-hidden="true" style={{ color: "var(--ent-bad)" }} />
            <h1 class="ent-header__title ent-header--document">{t("magicverify.errorTitle")}</h1>
            <p class="ent-header__description">{message()}</p>
            <A class="ent-btn ent-btn--primary" href="/auth/signin">{t("magicverify.tryAgain")}</A>
          </Show>
        </div>
      </div>
    </div>
  )
}

/**
 * `/auth/verify` — the standalone centred verification card
 * (`.reference/src/pages/auth/verify.tsx`): one `?token=`, then the same three states
 * (loading / success with a 3 s redirect to sign-in / failure with a sign-in button).
 */
export function VerifyScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [search] = useSearchParams<{ token?: string }>()
  const [status, setStatus] = createSignal<"loading" | "success" | "error">("loading")
  const [message, setMessage] = createSignal("")
  let alive = true
  onCleanup(() => { alive = false })
  onMount(() => {
    const token = search.token
    if (!token) { setStatus("error"); setMessage(t("auth.verify.missingToken")); return }
    void (async () => {
      try {
        await app.runtime.run(app.client.auth.verifyEmail({ payload: { token } }))
        setStatus("success")
        setMessage(t("auth.verify.successBody"))
        setTimeout(() => { if (alive) navigate("/auth/signin") }, 3000)
      } catch (cause) { setStatus("error"); setMessage(describe(cause)) }
    })()
  })
  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "24rem" }}>
        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px", "align-items": "center", "text-align": "center" }}>
          <Show when={status() === "loading"}>
            <Loader size={26} aria-hidden="true" class="ent-stat__icon" />
            <h1 class="ent-header__title ent-header--document">{t("auth.verify.verifyingTitle")}</h1>
            <p class="ent-header__description">{t("auth.verify.verifyingBody")}</p>
          </Show>
          <Show when={status() === "success"}>
            <CircleCheck size={30} aria-hidden="true" style={{ color: "var(--ent-ok)" }} />
            <h1 class="ent-header__title ent-header--document">{t("auth.verify.successTitle")}</h1>
            <p class="ent-header__description">{message()}</p>
            <p class="ent-field__hint">{t("auth.verify.redirecting")}</p>
          </Show>
          <Show when={status() === "error"}>
            <CircleX size={30} aria-hidden="true" style={{ color: "var(--ent-bad)" }} />
            <h1 class="ent-header__title ent-header--document">{t("auth.verify.failedTitle")}</h1>
            <p class="ent-header__description">{message()}</p>
            <A class="ent-btn ent-btn--primary" href="/auth/signin">{t("auth.verify.signIn")}</A>
          </Show>
        </div>
      </div>
    </div>
  )
}
