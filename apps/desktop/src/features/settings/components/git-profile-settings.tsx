/**
 * The user's local git identity (`GET/PUT /api/user/git-profile`): the name and email that sign every commit,
 * restore and merge they make in a project's history, and the assistant's commits on their behalf as `<name> (AI)`.
 * The sidecar creates it from the account the first time it is read, so there is always one to show.
 */
import { Show, createEffect, createSignal, type JSX } from "solid-js"
import { GitBranch } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { toast } from "../../../shared/ui/feedback.tsx"

const failureMessage = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && typeof (cause as { message?: unknown }).message === "string") {
    return (cause as { message: string }).message
  }
  return t("vcs.profile.saveFailed")
}

export function GitProfileSettings(): JSX.Element {
  const app = useApp()
  const profile = useRead((client) => client.user.gitProfile())
  const [name, setName] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [saved, setSaved] = createSignal<{ name: string; email: string }>()

  createEffect(() => {
    const data = profile.data()
    if (data === undefined) return
    setName(data.name)
    setEmail(data.email)
    setSaved(data)
  })

  const changed = (): boolean => {
    const data = saved()
    return data !== undefined && (name().trim() !== data.name || email().trim() !== data.email)
  }

  const save = async (): Promise<void> => {
    if (saving() || !changed()) return
    try {
      setSaving(true)
      const data = await app.runtime.run(app.client.user.updateGitProfile({ payload: { name: name(), email: email() } }))
      setName(data.name)
      setEmail(data.email)
      setSaved(data)
      toast.success(t("vcs.profile.saved"))
    } catch (cause) {
      toast.error(failureMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const field = "w-full rounded-md border border-slate-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"

  return (
    <div class="rounded-xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
      <h3 class="mb-1 flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
        <GitBranch class="mr-2 h-4 w-4" />
        {t("vcs.profile.title")}
      </h3>
      <p class="mb-4 text-xs text-slate-500 dark:text-slate-400">{t("vcs.profile.description")}</p>
      <Show when={profile.loading()}>
        <p role="status" class="text-sm text-slate-500">{t("common.loading")}</p>
      </Show>
      <Show when={profile.error()}>
        <div role="alert" class="flex items-center gap-3 text-sm text-red-600 dark:text-red-400">
          <p>{t("vcs.profile.loadFailed")}</p>
          <button type="button" onClick={() => void profile.refetch()} class="underline">{t("common.retry")}</button>
        </div>
      </Show>
      <Show when={profile.data()}>
      <form onSubmit={(event) => { event.preventDefault(); void save() }} aria-busy={saving()}>
      <fieldset disabled={saving()}>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="git-profile-name" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("vcs.profile.name")}</label>
          <input id="git-profile-name" type="text" required maxlength={100} autocomplete="name" value={name()} onInput={(event) => setName(event.currentTarget.value)} class={field} />
        </div>
        <div>
          <label for="git-profile-email" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("vcs.profile.email")}</label>
          <input id="git-profile-email" type="email" required maxlength={254} autocomplete="email" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} class={field} />
        </div>
      </div>
      <Show when={changed()}>
        <div class="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving()}
            class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700 disabled:opacity-50"
          >
            <Show when={saving()}>
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </Show>
            {t("vcs.profile.save")}
          </button>
        </div>
      </Show>
      </fieldset>
      </form>
      </Show>
    </div>
  )
}
