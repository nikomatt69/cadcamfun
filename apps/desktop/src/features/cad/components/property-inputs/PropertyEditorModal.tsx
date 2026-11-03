import { t } from "../../../../i18n/index.ts"
/**
 * The dialog every property editor opens: a wide modal centred on the window.
 *
 * The property panel is a narrow column at the right of the workspace, so an editor that
 * opens *inside* it is squeezed into a sliver, clipped by the panel's scroll box and covered
 * by the panel content behind it. This dialog is portalled to the body, so it covers the
 * whole window, and it says what is being edited, what the constraints are and keeps the
 * actions in sight.
 */
import { type JSX, Show } from "solid-js"
import { Modal } from "../../../../shared/ui/modal.tsx"

export interface PropertyEditorModalProps {
  readonly open: boolean
  /** What is being edited ("Edit points", "Select faces"...). */
  readonly title: string
  /** Which field it is and how many items it holds. */
  readonly subtitle?: string | undefined
  readonly size?: "md" | "lg" | "xl"
  readonly onClose: () => void
  readonly onSave: () => void
  readonly saveLabel?: string
  readonly cancelLabel?: string
  readonly saveDisabled?: boolean
  /** Why the editor cannot be saved yet: shown next to the actions instead of an alert. */
  readonly error?: string | undefined
  readonly children: JSX.Element
}

const CANCEL = "rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-4 py-2 text-sm font-medium text-[color:var(--ent-text)] hover:bg-[color:var(--ent-surface-subtle)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ent-accent)]"
const SAVE = "rounded-md bg-[color:var(--ent-action)] px-4 py-2 text-sm font-medium text-[color:var(--ent-action-text)] hover:bg-[color:var(--ent-action-hover)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ent-accent)] disabled:cursor-not-allowed disabled:opacity-50"

/** The dialog of a property editor: centred, wide, with the actions pinned at the bottom. */
export function PropertyEditorModal(props: PropertyEditorModalProps): JSX.Element {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size={props.size ?? "lg"}
      footer={
        <div class="flex w-full items-center gap-3">
          <Show when={props.error !== undefined}>
            <p class="min-w-0 flex-1 text-xs text-[color:var(--ent-bad)]" role="alert">{props.error}</p>
          </Show>
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" class={CANCEL} onClick={props.onClose}>{props.cancelLabel ?? t("cad.assembly.cancel")}</button>
            <button type="button" class={SAVE} disabled={props.saveDisabled ?? false} onClick={props.onSave}>{props.saveLabel ?? t("cad.titleBlock.save")}</button>
          </div>
        </div>
      }
    >
      <div
        class="flex flex-col gap-3"
        onKeyDown={(event) => {
          // Enter saves, unless the person is typing in a field (there it commits the value)
          // or is on a button (there it presses the button).
          if (event.key !== "Enter" || props.saveDisabled === true) return
          const target = event.target as HTMLElement | null
          if (target !== null && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return
          event.preventDefault()
          props.onSave()
        }}
      >
        <Show when={props.subtitle !== undefined}>
          <p class="text-xs text-[color:var(--ent-text-muted)]">{props.subtitle}</p>
        </Show>
        {props.children}
      </div>
    </Modal>
  )
}
