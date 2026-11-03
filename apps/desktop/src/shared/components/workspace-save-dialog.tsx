import { For, Show, type JSX } from "solid-js"
import { FolderPlus, Save, Users } from "lucide-solid"
import { Modal } from "../ui/modal.tsx"
import { CANCEL_BUTTON, FIELD, SUBMIT_BUTTON } from "./WorkspacePage.tsx"
import { t } from "../../i18n/index.ts"

export const SAVE_FIELD = FIELD
const LABEL = "mb-1 block text-[11px] font-medium text-[color:var(--ent-text-muted)]"
const SECONDARY = CANCEL_BUTTON
const PRIMARY = SUBMIT_BUTTON
const FOOTER = "sticky bottom-0 flex items-center justify-end gap-2 rounded-b-[var(--ent-radius)] border-t border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] px-6 py-3"

export interface SaveSummaryRow { readonly label: string; readonly value: string | number }

export function SaveContentsSummary(props: { readonly rows: ReadonlyArray<SaveSummaryRow> }): JSX.Element {
  return <details open class="mb-4 rounded-[var(--ent-radius)] border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] p-3 text-xs" data-testid="save-contents-summary">
    <summary class="cursor-pointer font-medium text-[color:var(--ent-text)]">{t("save.contents")}</summary>
    <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
      <For each={props.rows}>{(row) => <><dt class="text-[color:var(--ent-text-muted)]">{row.label}</dt><dd class="break-words text-right text-[color:var(--ent-text)]">{row.value}</dd></>}</For>
    </dl>
  </details>
}

/** CAD and CAM share the exact export layout shown by the owner. */
export function WorkspaceExportDialog(props: {
  readonly open: boolean; readonly title: string; readonly name: string; readonly onName: (value: string) => void;
  readonly format: string; readonly onFormat: (value: string) => void; readonly formats: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly projectBody: string; readonly onProject: () => void; readonly onExport: () => void; readonly onClose: () => void;
  readonly busy?: boolean; readonly error?: string | undefined
}): JSX.Element {
  return <Modal open={props.open} variant="workspace" title={props.title} onClose={props.onClose}>
    <div class="px-6 py-4" data-testid="workspace-export-dialog">
      <div class="mb-4"><label for="fileName" class={LABEL}>{t("cad.importExport.fileName")}</label><input id="fileName" name="fileName" class={SAVE_FIELD} value={props.name} disabled={props.busy} onInput={(event) => props.onName(event.currentTarget.value)} /></div>
      <div class="mb-4"><label for="fileFormat" class={LABEL}>{t("cad.importExport.fileFormat")}</label><select id="fileFormat" name="fileFormat" class={SAVE_FIELD} value={props.format} disabled={props.busy} onChange={(event) => props.onFormat(event.currentTarget.value)}><For each={props.formats}>{(format) => <option value={format.id}>{format.label}</option>}</For></select></div>
      <div class="mb-4 flex items-start rounded-[var(--ent-radius)] border border-[color:var(--ent-line)] bg-[color:var(--ent-accent-soft)] p-3">
        <div class="flex-shrink-0"><FolderPlus size={16} class="text-[color:var(--ent-accent)]" /></div>
        <div class="ml-3"><h3 class="text-xs font-medium text-[color:var(--ent-text)]">{t("cad.importExport.saveAsProject")}</h3><div class="mt-1 text-xs text-[color:var(--ent-text-muted)]"><p>{props.projectBody}</p><button type="button" data-testid="workspace-save-as-project" onClick={props.onProject} disabled={props.busy} class="mt-1 font-medium text-[color:var(--ent-accent)] transition-colors hover:text-[color:var(--ent-accent-hover)]">{t("cad.importExport.saveAsProject")}</button></div></div>
      </div>
      <Show when={props.error}><p role="alert" class="text-xs text-[color:var(--ent-bad)]">{props.error}</p></Show>
    </div>
    <div class={FOOTER}><button type="button" class={SECONDARY} onClick={props.onClose} disabled={props.busy}>{t("common.cancel")}</button><button type="button" data-testid="workspace-export-file" onClick={props.onExport} class={PRIMARY} disabled={props.busy || !props.name.trim()}><span class="flex items-center"><Save size={14} class="mr-1.5" />{t(props.busy ? "save.exporting" : "cad.importExport.exportFile")}</span></button></div>
  </Modal>
}

/** One form owns the common project fields, visual structure and contents summary for both editors. */
export function WorkspaceProjectDialog(props: {
  readonly open: boolean; readonly name: string; readonly onName: (value: string) => void; readonly nameReadOnly?: boolean;
  readonly description: string; readonly onDescription: (value: string) => void;
  readonly organizationId: string; readonly onOrganization: (value: string) => void;
  readonly isPublic: boolean; readonly onPublic: (value: boolean) => void;
  readonly organizations: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly summary: ReadonlyArray<SaveSummaryRow>; readonly controls?: JSX.Element; readonly afterFields?: JSX.Element;
  readonly busy: boolean; readonly canSave: boolean; readonly error?: string | null | undefined;
  readonly onSubmit: () => void; readonly onClose: () => void
}): JSX.Element {
  return <Modal open={props.open} variant="workspace" title={t("cad.importExport.saveAsProject")} onClose={props.onClose}>
    <form onSubmit={(event) => { event.preventDefault(); props.onSubmit() }} data-testid="workspace-project-dialog">
      <div class="px-6 py-4">
        <Show when={props.error}><div role="alert" class="mb-4 rounded-[var(--ent-radius)] border border-[color:var(--ent-bad)] bg-[color:var(--ent-bad-soft)] p-3 text-xs text-[color:var(--ent-bad)]">{props.error}</div></Show>
        {props.controls}
        <div class="mb-4"><label for="projectName" class={LABEL}>{t("save.projectName")} <span class="text-[color:var(--ent-bad)]">*</span></label><input id="projectName" name="projectName" type="text" class={SAVE_FIELD} value={props.name} disabled={props.busy} readOnly={props.nameReadOnly} onInput={(event) => props.onName(event.currentTarget.value)} required placeholder={t("save.projectNamePlaceholder")} /></div>
        <div class="mb-4"><label for="description" class={LABEL}>{t("save.description")}</label><textarea id="description" name="description" rows={3} class={SAVE_FIELD} value={props.description} disabled={props.busy} onInput={(event) => props.onDescription(event.currentTarget.value)} placeholder={t("save.descriptionPlaceholder")} /></div>
        <div class="mb-4"><label for="organization" class={LABEL}>{t("save.organization")}</label><div class="relative"><Users size={14} class="pointer-events-none absolute left-2.5 top-[7px] text-[color:var(--ent-text-faint)]" /><select id="organization" name="organization" class={`${SAVE_FIELD} pl-8`} value={props.organizationId} disabled={props.busy || props.nameReadOnly} onChange={(event) => props.onOrganization(event.currentTarget.value)}><option value="">{t("save.personalProject")}</option><For each={props.organizations}>{(org) => <option value={org.id}>{org.name}</option>}</For></select></div></div>
        <label class="mb-4 flex items-start gap-3 text-xs"><input id="public" name="public" type="checkbox" checked={props.isPublic} disabled={props.busy} onChange={(event) => props.onPublic(event.currentTarget.checked)} class="mt-0.5 h-3.5 w-3.5 accent-[color:var(--ent-accent)]" /><span><span class="font-medium text-[color:var(--ent-text)]">{t("save.publicProject")}</span><span class="block text-[color:var(--ent-text-muted)]">{t("save.publicHint")}</span></span></label>
        <SaveContentsSummary rows={props.summary} />
        {props.afterFields}
      </div>
      <div class={FOOTER}><button type="button" class={SECONDARY} onClick={props.onClose} disabled={props.busy}>{t("common.cancel")}</button><button type="submit" data-testid="workspace-save-project" class={PRIMARY} disabled={props.busy || !props.canSave}><span class="flex items-center"><Save size={14} class="mr-1.5" />{t(props.busy ? "cam.save.saving" : "cad.importExport.saveAsProject")}</span></button></div>
    </form>
  </Modal>
}
