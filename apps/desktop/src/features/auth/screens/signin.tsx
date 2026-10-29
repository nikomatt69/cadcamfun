/**
 * `/auth/signin` — local email/password account access and optional magic links.
 *
 * The screen renders in the shared document language: one flat card, one
 * accent, the shared field and button vocabulary. It is a document page, not a
 * marketing page — the reader is here to sign in, so nothing competes with the
 * form.
 */
import { Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { startSession } from "../../../shared/state/session.ts"
import { Button, Field, Notice, TextField } from "../../../shared/components/enterprise.tsx"
import { describe } from "./auth.tsx"

type LoadingType = "email" | "google" | "passkey" | "magic-link"

export function SignInScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = createSignal(false)
  const [loadingType, setLoadingType] = createSignal<LoadingType | null>(null)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [magicLinkSent, setMagicLinkSent] = createSignal(false)
  const [magicLinkEmail, setMagicLinkEmail] = createSignal("")

  const busy = (type: LoadingType): boolean => isLoading() && loadingType() === type

  const run = async (type: LoadingType, work: () => Promise<void>): Promise<void> => {
    setIsLoading(true)
    setLoadingType(type)
    setError(undefined)
    try {
      await work()
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setIsLoading(false)
      setLoadingType(null)
    }
  }

  const handleEmailSignIn = (event: Event): void => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    void run("email", async () => {
      const result = await app.runtime.run(app.client.auth.signinDirect({
        payload: { email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") }
      }))
      startSession(app.cache, result.body.token)
      navigate("/")
    })
  }

  const handleGoogleSignIn = (): void => {
    // Better Auth `signIn.social({ provider: "google" })` has no v6 route.
    setError(t("signin.googleFailed"))
  }

  const handlePasskeySignIn = (): void => {
    // The legacy `signInWithPasskey()` has no v6 route (`passkey-register` answers 501).
    setError(t("signin.passkeyFailed"))
  }

  const handleMagicLink = (): void => {
    const email = magicLinkEmail()
    if (!email || !email.includes("@")) {
      setError(t("auth.invalidEmail"))
      return
    }
    void run("magic-link", async () => {
      const result = await app.runtime.run(app.client.auth.sendMagicLink({ payload: { email, callbackURL: "/" } }))
      if (result.success || result.message.length > 0) setMagicLinkSent(true)
      else setError(t("auth.magicFailed"))
    })
  }

  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "26rem" }}>
        <div class="ent-card__head" style={{ "text-align": "center" }}>
          <img src="/logo.png" alt={t("shell.brand")} style={{ height: "40px", width: "auto", "margin-inline": "auto", display: "block", "margin-bottom": "10px" }} />
          <h1 class="ent-header__title" style={{ "font-size": "17px", "text-align": "center" }}>{t("signin.title")}</h1>
          <p class="ent-header__description" style={{ "text-align": "center", "margin-inline": "auto" }}>{t("signin.subtitle")}</p>
        </div>

        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <Show when={error() !== undefined}>
            <Notice tone="bad">{error()}</Notice>
          </Show>

          <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <Button block onClick={handleGoogleSignIn} disabled={busy("google")}>
              {busy("google") ? t("signin.busy") : t("signin.google")}
            </Button>
            <Button block onClick={handlePasskeySignIn} disabled={busy("passkey")}>
              {busy("passkey") ? t("signin.passkeyBusy") : t("signin.passkey")}
            </Button>
          </div>

          <div class="ent-section" style={{ margin: "2px 0 0" }}>
            <span class="ent-section__title">{t("auth.emailDivider")}</span>
            <span class="ent-section__rule" aria-hidden="true" />
          </div>

          <form style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={handleEmailSignIn}>
            <Field label={t("signin.emailLabel")} id="email">
              <TextField id="email" name="email" type="email" required placeholder="Enter your email" />
            </Field>
            <Field label={t("signin.passwordLabel")} id="password">
              <TextField id="password" name="password" type="password" required placeholder="Enter your password" />
            </Field>

            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "8px" }}>
              <A href="/auth/forgot-password" class="ent-btn ent-btn--ghost" style={{ "padding-inline": "0" }}>{t("auth.signin.forgot")}</A>
            </div>

            <Button tone="primary" type="submit" block disabled={busy("email")}>
              {busy("email") ? t("signin.busy") : t("signin.title")}
            </Button>
          </form>

          <Show when={!magicLinkSent()} fallback={<Notice tone="ok">{t("auth.magicSent")}</Notice>}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <Field label={t("auth.magicLabel")} id="magic-email">
                <TextField id="magic-email" type="email" value={magicLinkEmail()} placeholder="Enter your email" onInput={setMagicLinkEmail} />
              </Field>
              <Button block onClick={handleMagicLink} disabled={busy("magic-link")}>
                {busy("magic-link") ? t("auth.magicSending") : t("auth.magicSend")}
              </Button>
            </div>
          </Show>
        </div>

        <div class="ent-card__foot" style={{ "text-align": "center", "font-size": "12px", color: "var(--ent-text-muted)" }}>
          {t("signin.noAccount")}{" "}
          <A href="/auth/signup" style={{ color: "var(--ent-accent)", "font-weight": "500" }}>{t("signin.signupLink")}</A>
        </div>
      </div>
    </div>
  )
}
