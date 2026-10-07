/**
 * Skills of the assistant (Settings → AI): the built-in playbooks and the ones the user loads. A skill is a `SKILL.md`
 * (front matter `name` + `description`, then Markdown instructions) the model reads when a task fits; it can run nothing.
 * Loading goes through the sidecar, which validates the skill, stores it under the data directory and tells the live
 * assistant to re-read its skills.
 */
import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import Trash2 from "lucide-solid/icons/trash-2"
import Upload from "lucide-solid/icons/upload"
import { t } from "../i18n/index.ts"
import { toast } from "../components/ui/toast.tsx"
import { useApp } from "../state/context.ts"

interface SkillInfo {
  readonly name: string
  readonly description: string
  readonly builtIn: boolean
  readonly category: string
}

const FIELD =
  "w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"

const TEMPLATE = `---
name: my-skill
description: When to use this skill, in one line
---

# My skill

Steps the assistant follows, using the tools it has (cad_add_elements, cam_create_operation, cam_verify_toolpath, ...).
`

export function SkillsSettings(): JSX.Element {
  const app = useApp()
  const [skills, setSkills] = createSignal<ReadonlyArray<SkillInfo>>([])
  const [max, setMax] = createSignal(50)
  const [markdown, setMarkdown] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<string | undefined>()
  let picker: HTMLInputElement | undefined

  const load = async (): Promise<void> => {
    try {
      const out = await app.runtime.run(app.client.ai.skills())
      setSkills(out.skills)
      setMax(out.max)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("ai.skills.failed"))
    }
  }
  onMount(() => { void load() })

  const save = async (): Promise<void> => {
    if (markdown().trim().length === 0) return
    setBusy(true)
    setProblem(undefined)
    try {
      const out = await app.runtime.run(app.client.ai.saveSkill({ payload: { markdown: markdown() } }))
      setSkills(out.skills)
      setMarkdown("")
      toast.success(out.live ? t("ai.skills.loaded", { name: out.skill.name }) : t("ai.skills.loadedLater", { name: out.skill.name }))
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("ai.skills.failed"))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string): Promise<void> => {
    setBusy(true)
    setProblem(undefined)
    try {
      const out = await app.runtime.run(app.client.ai.deleteSkill({ params: { name } }))
      setSkills(out.skills)
      toast.success(t("ai.skills.removed", { name }))
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("ai.skills.failed"))
    } finally {
      setBusy(false)
    }
  }

  const readFile = async (list: FileList | null): Promise<void> => {
    const file = list?.[0]
    if (file === undefined) return
    if (file.size > 100_000) {
      setProblem(t("ai.skills.tooBig"))
      return
    }
    setMarkdown(await file.text())
  }

  const user = (): ReadonlyArray<SkillInfo> => skills().filter((s) => !s.builtIn)
  const builtIn = (): ReadonlyArray<SkillInfo> => skills().filter((s) => s.builtIn)

  return (
    <div class="space-y-2" data-testid="ai-skills">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("ai.skills.title")}</h3>
        <span class="text-[11px] text-gray-500">{t("ai.skills.count", { user: user().length, max: max(), builtIn: builtIn().length })}</span>
      </div>
      <p class="text-xs text-gray-500">{t("ai.skills.hint")}</p>

      <ul class="space-y-1" data-testid="ai-skills-list">
        <For each={skills()}>{(skill) => (
          <li class="flex items-start gap-2 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700" data-testid={`ai-skill-${skill.name}`}>
            <div class="min-w-0 flex-1">
              <span class="font-mono font-medium">{skill.name}</span>
              <span class="ml-2 rounded bg-gray-100 px-1 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">{skill.builtIn ? t("ai.skills.builtIn") : t("ai.skills.yours")}</span>
              <p class="truncate text-gray-500" title={skill.description}>{skill.description}</p>
            </div>
            <Show when={!skill.builtIn}>
              <button type="button" class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t("ai.skills.remove", { name: skill.name })} disabled={busy()} onClick={() => void remove(skill.name)}>
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </Show>
          </li>
        )}</For>
      </ul>

      <label class="sr-only" for="ai-skill-markdown">{t("ai.skills.editor")}</label>
      <textarea
        id="ai-skill-markdown"
        class={`${FIELD} min-h-32 font-mono`}
        placeholder={TEMPLATE}
        value={markdown()}
        onInput={(event) => setMarkdown(event.currentTarget.value)}
        data-testid="ai-skill-markdown"
      />
      <Show when={problem()}>
        <p role="alert" class="text-xs text-red-600 dark:text-red-400" data-testid="ai-skill-problem">{problem()}</p>
      </Show>
      <div class="flex gap-2">
        <input ref={picker} type="file" accept=".md,text/markdown,text/plain" class="hidden" onChange={(event) => { void readFile(event.currentTarget.files); event.currentTarget.value = "" }} />
        <button type="button" class="btn btn-outline" onClick={() => picker?.click()}>
          <Upload size={12} aria-hidden="true" />
          {t("ai.skills.open")}
        </button>
        <button type="button" class="btn btn-outline" onClick={() => setMarkdown(TEMPLATE)}>{t("ai.skills.template")}</button>
        <button type="button" class="btn btn-primary" disabled={busy() || markdown().trim().length === 0} onClick={() => void save()} data-testid="ai-skill-save">
          {t("ai.skills.load")}
        </button>
      </div>
    </div>
  )
}
