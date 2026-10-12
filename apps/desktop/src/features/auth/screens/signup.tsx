/**
 * `/auth/signup` — port of `.reference/src/pages/auth/signup.tsx`.
 *
 * The glass card, the two social buttons, the passkey note, the divider, the name /
 * e-mail / password form, the magic-link block and the sign-in link are the legacy
 * markup class for class.
 *
 * Behaviour: `POST /api/auth/signup`. The legacy form has no confirm-password field
 * (Better Auth did not ask for one) while the v6 handler validates all four fields, so
 * `confirmPassword` mirrors the password the user typed. The social buttons have no v6
 * route and surface the legacy failure copy for their provider.
 */
import { Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { startSession } from "../../../shared/state/session.ts"
import { describe } from "./auth.tsx"

type LoadingType = "email" | "github" | "google" | "magic-link"

export function SignUpScreen(): JSX.Element {
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

  const handleSubmit = (event: Event): void => {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    const name = String(data.get("name") ?? "")
    const email = String(data.get("email") ?? "")
    const password = String(data.get("password") ?? "")
    void run("email", async () => {
      await app.runtime.run(app.client.auth.signup({
        payload: { name, email, password, confirmPassword: password }
      }))
      const session = await app.runtime.run(app.client.auth.signinDirect({ payload: { email, password } }))
      startSession(app.cache, session.body.token)
      navigate("/")
    })
  }

  const handleGitHubSignUp = (): void => {
    // Better Auth `signIn.social({ provider: "github" })` has no v6 route.
    setError(t("signup.githubFailed"))
  }

  const handleGoogleSignUp = (): void => {
    // Better Auth `signIn.social({ provider: "google" })` has no v6 route.
    setError(t("signup.googleFailed"))
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
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full">
        {/* Glass Card */}
        <div class="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 p-8">
          {/* Header */}
          <div class="text-center mb-8">
            <img src="/logo.png" alt="CAD/CAM FUN" class="h-16 w-auto mx-auto mb-4" />
            <h2 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {t("signup.title")}
            </h2>
            <p class="mt-2 text-gray-600 dark:text-gray-400">{t("signup.subtitle")}</p>
          </div>

          {/* Error Message */}
          <Show when={error() !== undefined}>
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6">
              {error()}
            </div>
          </Show>

          {/* Social Sign Up Buttons */}
          <div class="space-y-3 mb-6">
            <button
              type="button"
              onClick={handleGitHubSignUp}
              disabled={busy("github")}
              class="w-full bg-gray-800 text-white py-3 px-4 rounded-xl hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center font-medium transition-colors duration-150"
            >
              {busy("github") ? t("signup.connecting") : t("signup.github")}
            </button>

            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={busy("google")}
              class="w-full bg-red-600 text-white py-3 px-4 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center font-medium transition-colors duration-150"
            >
              {busy("google") ? t("signup.connecting") : t("signup.google")}
            </button>
          </div>

          {/* Passkey Info */}
          <div class="mb-6">
            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl text-sm">
              💡 <strong>Passkey:</strong> Create your account first, then add biometric authentication from your profile
              settings.
            </div>
          </div>

          {/* Divider */}
          <div class="relative mb-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white/80 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400">
                {t("auth.emailDivider")}
              </span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form class="space-y-6 mb-6" onSubmit={handleSubmit}>
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("signup.nameLabel")}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-[border-color,box-shadow,background-color] duration-150"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("signup.emailLabel")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-[border-color,box-shadow,background-color] duration-150"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("signup.passwordLabel")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-[border-color,box-shadow,background-color] duration-150"
                placeholder="Enter your password"
                minLength={8}
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Password must be at least 8 characters long
              </p>
            </div>

            <button
              type="submit"
              disabled={busy("email")}
              class="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium disabled:opacity-50 transition-[background-color,border-color,color,box-shadow,opacity] duration-150 shadow-lg hover:shadow-xl"
            >
              {busy("email") ? t("signup.submitBusy") : t("signup.title")}
            </button>
          </form>

          {/* Magic Link Section */}
          <Show
            when={!magicLinkSent()}
            fallback={
              <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl mb-6">
                {t("auth.magicSent")}
              </div>
            }
          >
            <div class="space-y-3 mb-6">
              <div>
                <label for="magic-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t("auth.magicLabel")}
                </label>
                <input
                  id="magic-email"
                  name="magic-email"
                  type="email"
                  value={magicLinkEmail()}
                  onInput={(event) => setMagicLinkEmail(event.currentTarget.value)}
                  class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-[border-color,box-shadow,background-color] duration-150"
                  placeholder="Enter your email"
                />
              </div>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={busy("magic-link")}
                class="w-full bg-purple-600 text-white py-3 px-4 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors duration-150"
              >
                {busy("magic-link") ? t("auth.magicSending") : t("auth.magicSend")}
              </button>
            </div>
          </Show>

          {/* Sign In Link */}
          <div class="text-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {t("signup.haveAccount")}{" "}
              <A
                href="/auth/signin"
                class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors duration-150"
              >
                {t("signup.signinLink")}
              </A>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
