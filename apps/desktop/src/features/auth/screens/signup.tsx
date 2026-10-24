/**
 * `/auth/signup` — local account creation and optional magic links.
 *
 * The screen renders in the shared document language: one flat card, one
 * accent, the shared field and button vocabulary. It is a document page, not a
 * marketing page — the reader is here to create an account, so nothing competes
 * with the form.
 */
import { Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { startSession } from "../../../shared/state/session.ts"
import { Button, Field, Notice, TextField } from "../../../shared/components/enterprise.tsx"
import { describe } from "./auth.tsx"

type LoadingType = "email" | "google" | "magic-link"

export function SignUpScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = createSignal(false)
  const [loadingType, setLoadingType] = createSignal<LoadingType | null>(null)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [magicLinkSent, setMagicLinkSent] = createSignal(false)
  const [magicLinkEmail, setMagicLinkEmail] = createSignal("")
  const [name, setName] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [password, setPassword] = createSignal("")

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

  const handleSubmit = (event: Event): void => {
    event.preventDefault()
    void run("email", async () => {
      await app.runtime.run(app.client.auth.signup({
        payload: { name: name().trim(), email: email().trim(), password: password(), confirmPassword: password() }
      }))
      const session = await app.runtime.run(app.client.auth.signinDirect({ payload: { email: email().trim(), password: password() } }))
      startSession(app.cache, session.body.token)
      navigate("/")
    })
  }

  const handleGoogleSignUp = (): void => {
    // Better Auth `signIn.social({ provider: "google" })` has no v6 route.
    setError(t("signup.googleFailed"))
  }

  const handleMagicLink = (): void => {
    const address = magicLinkEmail()
    if (!address || !address.includes("@")) {
      setError(t("auth.invalidEmail"))
      return
    }
    void run("magic-link", async () => {
      const result = await app.runtime.run(app.client.auth.sendMagicLink({ payload: { email: address, callbackURL: "/" } }))
      if (result.success || result.message.length > 0) setMagicLinkSent(true)
      else setError(t("auth.magicFailed"))
    })
  }

  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "26rem" }}>
        <div class="ent-card__head" style={{ "text-align": "center" }}>
          <img src="/logo.png" alt="CAD/CAM FUN" style={{ height: "40px", width: "auto", "margin-inline": "auto", display: "block", "margin-bottom": "10px" }} />
          <h1 class="ent-header__title" style={{ "font-size": "17px", "text-align": "center" }}>{t("signup.title")}</h1>
          <p class="ent-header__description" style={{ "text-align": "center", "margin-inline": "auto" }}>{t("signup.subtitle")}</p>
        </div>

        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <Show when={error() !== undefined}>
            <Notice tone="bad">{error()}</Notice>
          </Show>

          <Button block onClick={handleGoogleSignUp} disabled={busy("google")}>
            {busy("google") ? t("signup.connecting") : t("signup.google")}
          </Button>

          <Notice tone="default">
            <strong>Passkey:</strong> Create your account first, then add biometric authentication from your profile settings.
          </Notice>

          <div class="ent-section" style={{ margin: "2px 0 0" }}>
            <span class="ent-section__title">{t("auth.emailDivider")}</span>
            <span class="ent-section__rule" aria-hidden="true" />
          </div>

          <form style={{ display: "flex", "flex-direction": "column", gap: "12px" }} onSubmit={handleSubmit}>
            <Field label={t("signup.nameLabel")} id="name">
              <TextField id="name" value={name()} required placeholder="Enter your name" onInput={setName} />
            </Field>
            <Field label={t("signup.emailLabel")} id="email">
              <TextField id="email" type="email" value={email()} required placeholder="Enter your email" onInput={setEmail} />
            </Field>
            <Field label={t("signup.passwordLabel")} id="password" hint="Password must be at least 8 characters long">
              <TextField id="password" type="password" value={password()} required placeholder="Enter your password" onInput={setPassword} />
            </Field>

            <Button tone="primary" type="submit" block disabled={busy("email")}>
              {busy("email") ? t("signup.submitBusy") : t("signup.title")}
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
          {t("signup.haveAccount")}{" "}
          <A href="/auth/signin" style={{ color: "var(--ent-accent)", "font-weight": "500" }}>{t("signup.signinLink")}</A>
        </div>
      </div>
    </div>
  )
}
