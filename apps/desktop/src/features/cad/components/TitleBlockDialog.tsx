import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { drawing } from "@cadcamfun/core"
import { Modal } from "../../../shared/ui/modal.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { Field, Grid, Group, INPUT, NumberField } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { projectSession } from "../../projects/lib/project-session.ts"
import { currentTitleBlock } from "../lib/document-setup.ts"
import { useDocumentStore } from "../store/documentStore.ts"

const GROUPS = ["document", "people", "part", "views", "cam"] as const
const OPTIONS = ["part", "assembly", "cam-setup", "cam-program", "sketch", "draft", "in-review", "released", "obsolete", "first", "third", "mm", "in"]

/** A choice as the form words it: the known ones in the app's language, the rest (a standard's name) as it is. */
const optionLabel = (value: string): string => (OPTIONS.includes(value) ? t(`cad.titleBlock.option.${value as "part"}`) : value)

/**
 * The form of the drawing's title block (ISO 7200 data fields): creates it, edits it, and is the same dialog from the CAD and the CAM
 * workspace. It is built from the field list the server validates against, so the form, the block on the views, the drawing sheet and the
 * assistant can never disagree about what a field is. Saving puts the block in the drawing and saves the drawing.
 */
export default function TitleBlockDialog(props: { readonly open: boolean; readonly onClose: () => void; readonly cam?: boolean }): JSX.Element {
  const app = useApp()
  const [draft, setDraft] = createSignal<drawing.CompleteTitleBlock>(currentTitleBlock())
  const [saving, setSaving] = createSignal(false)
  createEffect(on(() => props.open, (open) => { if (open) setDraft(currentTitleBlock()) }))

  const errors = createMemo(() => new Map(drawing.titleBlockErrors(draft()).map((e) => [e.key, e.message])))
  const missing = createMemo(() => drawing.titleBlockIssues(draft()).map((i) => t(`cad.titleBlock.field.${i.key}`)))
  const fields = (group: (typeof GROUPS)[number]): ReadonlyArray<drawing.TitleBlockField> =>
    drawing.TITLE_BLOCK_FIELDS.filter((f) => f.group === group && (f.cam !== true || props.cam === true || drawing.titleBlockFieldsFor(draft()).includes(f)))
  const set = <K extends drawing.TitleBlockKey>(key: K, value: drawing.CompleteTitleBlock[K]): void => { setDraft({ ...draft(), [key]: value }) }

  const input = (field: drawing.TitleBlockField): JSX.Element => {
    const id = `title-block-${field.key}`
    const value = (): string => String(draft()[field.key])
    if (field.kind === "number") {
      return <NumberField id={id} value={draft().mass} accept={(v) => v >= 0} onValue={(v) => set("mass", v)} />
    }
    if (field.kind === "select") {
      return (
        <select id={id} class={INPUT} value={value()} onChange={(e) => set(field.key, e.currentTarget.value as never)}>
          <For each={field.options}>{(option) => <option value={option}>{optionLabel(option)}</option>}</For>
        </select>
      )
    }
    return <input id={id} class={INPUT} type={field.kind === "date" ? "date" : "text"} value={value()} aria-invalid={errors().has(field.key)} onInput={(e) => set(field.key, e.currentTarget.value as never)} />
  }

  const save = async (): Promise<void> => {
    if (errors().size > 0 || saving()) return
    setSaving(true)
    try {
      useDocumentStore.getState().setTitleBlock(drawing.validTitleBlockFields(draft()))
      // The block is part of the drawing: it goes to the server with the next save, which is now.
      await projectSession(app).document.saveNow("manual")
      toast.success(t("cad.titleBlock.saved"))
      props.onClose()
    } catch {
      toast.error(t("cad.titleBlock.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title={t("cad.titleBlock.title")} size="lg"
      footer={
        <div class="flex items-center justify-between gap-3 px-6 py-3">
          <button type="button" class="panel-btn" onClick={() => { setDraft(currentTitleBlock({})) }}>{t("cad.titleBlock.reset")}</button>
          <span class="flex gap-2">
            <button type="button" class="panel-btn" onClick={props.onClose}>{t("cad.titleBlock.cancel")}</button>
            <button type="button" class="panel-btn panel-btn--primary" data-testid="title-block-save" disabled={errors().size > 0 || saving()} onClick={() => void save()}>{t("cad.titleBlock.save")}</button>
          </span>
        </div>
      }>
      <form class="space-y-4 px-6 py-4" data-testid="title-block-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <p class="text-xs text-gray-500 dark:text-gray-400">{t("cad.titleBlock.intro")}</p>
        <For each={GROUPS}>
          {(group) => (
            <Show when={fields(group).length > 0}>
              <Group title={t(`cad.titleBlock.group.${group}`)}>
                <Grid cols={2}>
                  <For each={fields(group)}>
                    {(field) => (
                      <Field label={`${t(`cad.titleBlock.field.${field.key}`)}${field.required === true ? " *" : ""}`} for={`title-block-${field.key}`}
                        {...(errors().has(field.key) ? { hint: t("cad.titleBlock.invalid", { message: errors().get(field.key)! }) } : field.format !== undefined ? { hint: field.format } : {})}>
                        {input(field)}
                      </Field>
                    )}
                  </For>
                </Grid>
              </Group>
            </Show>
          )}
        </For>
        <Show when={missing().length > 0}><p class="text-xs text-amber-700 dark:text-amber-400" role="status">{t("cad.titleBlock.missing", { fields: missing().join(", ") })}</p></Show>
      </form>
    </Modal>
  )
}
