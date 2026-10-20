import { Show, createEffect, createUniqueId, onCleanup, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { Library, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"

interface UnifiedLibraryModalProps {
  readonly isOpen: boolean
  onClose(): void
  readonly children?: JSX.Element
}

export default function UnifiedLibraryModal(props: UnifiedLibraryModalProps): JSX.Element {
  const id = createUniqueId()
  let dialog: HTMLDivElement | undefined
  createEffect(() => {
    if (!props.isOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    queueMicrotask(() => dialog?.querySelector<HTMLButtonElement>("button")?.focus())
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); return }
      if (event.key !== "Tab" || !dialog) return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.tabIndex >= 0 && !element.hidden)
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => { window.removeEventListener("keydown", onKeyDown); if (previous?.isConnected) previous.focus() })
  })

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="library-dialog-scrim" onClick={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
          <div ref={dialog} class="library-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
            <header class="library-dialog-header">
              <div class="library-dialog-heading"><span class="library-dialog-icon"><Library size={20} aria-hidden="true" /></span><div><h2 id={`${id}-title`}>{t("cad.unifiedLibrary")}</h2><p id={`${id}-description`}>{t("library.dialogDescription")}</p></div></div>
              <button type="button" class="library-icon-button" aria-label={t("library.close")} onClick={() => props.onClose()}><X size={18} /></button>
            </header>
            <div class="library-dialog-body">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
