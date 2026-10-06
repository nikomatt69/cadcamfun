/**
 * The e-mail based auth pages (forgot password, reset password, magic link, e-mail
 * verification). The desktop app has no login screen (a single local profile); these
 * pages exist for route parity and drive the same legacy endpoints.
 */
import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { CircleCheck, CircleX } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { ErrorState, ScreenHeader, Toast } from "./screen-parts.tsx"

/** Auth failures carry `{ error, details }`; show both. */
const describe = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    const e = cause as { error?: unknown; details?: unknown; message?: unknown }
    if (typeof e.error === "string") return typeof e.details === "string" ? `${e.error}: ${e.details}` : e.error
    if (typeof e.message === "string") return e.message
  }
  return String(cause)
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

const Feedback = (props: { a: ReturnType<typeof useAction> }): JSX.Element => <>
  <Toast message={props.a.done()} />
  <Show when={props.a.debug()}><p class="break-all font-mono text-xs"><strong>{t("auth.debugLink")}: </strong>{props.a.debug()}</p></Show>
  <Show when={props.a.error()}><ErrorState label={t("common.error")} detail={props.a.error()} /></Show>
</>

export function ForgotPasswordScreen(): JSX.Element {
  const app = useApp(); const a = useAction(); const [email, setEmail] = createSignal("")
  return <section>
    <ScreenHeader title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")} />
    <form class="card m-5 grid max-w-md gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.forgotPassword({ payload: { email: email().trim() } }))
      return { message: r.message, debug: r.debugResetLink }
    }) }}>
      <label class="form-label">{t("auth.email")}<input class="form-input" type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} /></label>
      <button class="btn btn-primary" disabled={a.pending() || !email().trim()}>{t("auth.send")}</button>
      <Feedback a={a} />
    </form>
  </section>
}

export function MagicLinkScreen(): JSX.Element {
  const app = useApp(); const a = useAction(); const [email, setEmail] = createSignal("")
  return <section>
    <ScreenHeader title={t("auth.magic.title")} subtitle={t("auth.magic.subtitle")} />
    <form class="card m-5 grid max-w-md gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.sendMagicLink({ payload: { email: email().trim() } }))
      return { message: r.message, debug: r.debugMagicLink }
    }) }}>
      <label class="form-label">{t("auth.email")}<input class="form-input" type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} /></label>
      <button class="btn btn-primary" disabled={a.pending() || !email().trim()}>{t("auth.send")}</button>
      <Feedback a={a} />
    </form>
  </section>
}

export function ResetPasswordScreen(): JSX.Element {
  const app = useApp(); const a = useAction()
  const [search] = useSearchParams<{ token?: string }>()
  const [password, setPassword] = createSignal(""); const [confirm, setConfirm] = createSignal("")
  return <section>
    <ScreenHeader title={t("auth.reset.title")} />
    <form class="card m-5 grid max-w-md gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void a.run(async () => {
      const r = await app.runtime.run(app.client.auth.resetPassword({ payload: { token: search.token, newPassword: password(), confirmPassword: confirm() } }))
      return { message: r.message }
    }) }}>
      <Show when={!search.token}><ErrorState label={t("auth.reset.missingToken")} /></Show>
      <label class="form-label">{t("auth.reset.password")}<input class="form-input" type="password" minLength={8} required value={password()} onInput={(e) => setPassword(e.currentTarget.value)} /></label>
      <label class="form-label">{t("auth.reset.confirm")}<input class="form-input" type="password" minLength={8} required value={confirm()} onInput={(e) => setConfirm(e.currentTarget.value)} /></label>
      <button class="btn btn-primary" disabled={a.pending() || !search.token}>{t("auth.reset.submit")}</button>
      <Feedback a={a} />
    </form>
  </section>
}

export function VerifyEmailScreen(): JSX.Element {
  const app = useApp(); const a = useAction()
  const [search] = useSearchParams<{ token?: string }>()
  onMount(() => { if (search.token) void a.run(async () => {
    await app.runtime.run(app.client.auth.verifyEmail({ payload: { token: search.token } }))
    return { message: t("auth.verify.done") }
  }) })
  return <section>
    <ScreenHeader title={t("auth.verify.title")} />
    <div class="card m-5 grid max-w-md gap-3 p-4">
      <Show when={!search.token}><ErrorState label={t("auth.verify.missingToken")} /></Show>
      <Show when={a.pending()}><p aria-busy="true">{t("auth.verify.working")}</p></Show>
      <Feedback a={a} />
      <A class="btn btn-outline" href="/">{t("activity.projects")}</A>
    </div>
  </section>
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
    <section class="flex min-h-[70vh] items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-12 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900 sm:px-6 lg:px-8">
      <div class="w-full max-w-md space-y-6 rounded-2xl border border-gray-200/50 bg-white/80 p-8 text-center shadow-2xl backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-800/80 sm:p-10">
        <Show when={status() === "loading"}>
          <div class="h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto" />
          <div>
            <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t("auth.verify.verifyingTitle")}</h2>
            <p class="text-gray-600 dark:text-gray-400">{t("auth.verify.verifyingBody")}</p>
          </div>
        </Show>
        <Show when={status() === "success"}>
          <CircleCheck class="mx-auto h-16 w-16 text-green-500" />
          <div>
            <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t("auth.verify.successTitle")}</h2>
            <p class="mb-6 text-gray-600 dark:text-gray-400">{message()}</p>
            <p class="animate-pulse text-sm text-blue-600 dark:text-blue-400">{t("auth.verify.redirecting")}</p>
          </div>
        </Show>
        <Show when={status() === "error"}>
          <CircleX class="mx-auto h-16 w-16 text-red-500" />
          <div>
            <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t("auth.verify.failedTitle")}</h2>
            <p class="mb-6 text-gray-600 dark:text-gray-400">{message()}</p>
            <A class="btn btn-primary" href="/auth/signin">{t("auth.verify.signIn")}</A>
          </div>
        </Show>
      </div>
    </section>
  )
}
