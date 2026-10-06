import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { useApp } from "../state/context.ts"
import { ErrorState, ScreenHeader, Toast } from "./screen-parts.tsx"
import { LegacyNotice, lt } from "./legacy-parts.tsx"

export function LegacyProfile(props: { readonly settings?: boolean }): JSX.Element {
  const app = useApp()
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [message, setMessage] = createSignal<string>()
  const signout = async () => {
    if (pending()) return
    setPending(true); setError(undefined); setMessage(undefined)
    try {
      const result = await app.runtime.run(app.client.auth.signout())
      setMessage(result.body.message)
    } catch (cause) { setError(String(cause)) } finally { setPending(false) }
  }
  return <section>
    <ScreenHeader title={lt(props.settings ? "legacy.profileSettings" : "legacy.profile")} actions={<A class="btn btn-outline" href={props.settings ? "/profile" : "/profile/settings"}>{lt(props.settings ? "legacy.profile" : "legacy.profileSettings")}</A>} />
    <div class="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 md:grid-cols-[16rem_1fr]">
      <aside class="card space-y-4 rounded-2xl p-5">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-3xl text-blue-600 dark:bg-gray-800" aria-hidden="true">?</div>
        <h2 class="font-semibold">{lt("legacy.account")}</h2>
        <nav class="grid gap-2" aria-label={lt("legacy.profile")}><A class="btn btn-outline" href="/projects">{lt("legacy.projects")}</A><A class="btn btn-outline" href="/organizations">{lt("legacy.members")}</A><A class="btn btn-outline" href="/auth/forgot-password">{lt("legacy.security")}</A></nav>
        <button class="btn btn-outline w-full" disabled={pending()} onClick={() => void signout()}>{lt("legacy.signout")}</button>
      </aside>
      <div class="space-y-4"><LegacyNotice message={lt("legacy.profileGap")} /><Show when={error()}><ErrorState label={lt("legacy.error")} detail={error()} /></Show><Toast message={message()} />
        <div class="card rounded-2xl p-5"><h2 class="mb-3 font-semibold">{lt("legacy.security")}</h2><div class="flex flex-wrap gap-2"><A class="btn btn-outline" href="/auth/forgot-password">{lt("legacy.forgotPassword")}</A><A class="btn btn-outline" href="/auth/magic-link">{lt("legacy.magicLink")}</A></div></div>
      </div>
    </div>
  </section>
}

export function LegacyAuth(props: { readonly mode: "signin" | "signup" | "two-factor" | "magic-link" }): JSX.Element {
  return <section>
    <ScreenHeader title={lt(props.mode === "signin" ? "legacy.signin" : props.mode === "signup" ? "legacy.signup" : props.mode === "two-factor" ? "legacy.twoFactor" : "legacy.magicVerify")} />
    <div class="mx-auto my-8 max-w-lg space-y-5 p-5">
      <LegacyNotice message={lt("legacy.authGap")} />
      <div class="card grid gap-3 rounded-2xl p-6"><A class="btn btn-primary" href="/auth/magic-link">{lt("legacy.magicLink")}</A><A class="btn btn-outline" href="/auth/forgot-password">{lt("legacy.forgotPassword")}</A><A class="btn btn-outline" href="/auth/verify-email">{lt("legacy.verifyEmail")}</A><A class="btn btn-outline" href="/">{lt("legacy.backDashboard")}</A></div>
    </div>
  </section>
}

export function LegacyAI(): JSX.Element {
  const [tab, setTab] = createSignal<"legacy.aiChat" | "legacy.aiGcode" | "legacy.aiDesign">("legacy.aiChat")
  return <section>
    <ScreenHeader title={lt("legacy.ai")} subtitle={lt("legacy.aiDetail")} />
    <div class="space-y-5 p-4 sm:p-6">
      <LegacyNotice message={lt("legacy.aiGap")} />
      <div class="grid gap-4 md:grid-cols-[15rem_1fr]">
        <nav class="card grid content-start gap-2 rounded-2xl p-4" aria-label={lt("legacy.ai")}>
          <For each={["legacy.aiChat", "legacy.aiGcode", "legacy.aiDesign"] as const}>{(key) => <button class="btn btn-outline" aria-pressed={tab() === key} onClick={() => setTab(key)}>{lt(key)}</button>}</For>
        </nav>
        <article class="card flex min-h-[28rem] flex-col gap-5 rounded-2xl p-5">
          <h2 class="text-lg font-semibold">{lt(tab())}</h2>
          <p class="flex-1 text-sm text-gray-500 dark:text-gray-400">{lt("legacy.aiGap")}</p>
          <p class="text-sm text-amber-700 dark:text-amber-300">{lt("legacy.aiSafety")}</p>
          <label class="form-label">{lt("legacy.aiPrompt")}<textarea class="form-textarea" disabled /></label>
          <button class="btn btn-primary self-end" disabled>{lt("legacy.send")}</button>
        </article>
      </div>
    </div>
  </section>
}
