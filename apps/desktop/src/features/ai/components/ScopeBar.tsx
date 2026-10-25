/**
 * What the assistant is working on: the drawing in front of the user and the
 * machine it runs on.
 *
 * It was a component inside the assistant's main file, with its own copy of the
 * "click outside closes it" rule. It is on its own now, and the rule comes from
 * `lib/dismiss.ts` like every other menu in the assistant.
 */
import { For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import Check from "lucide-solid/icons/check"
import ChevronDown from "lucide-solid/icons/chevron-down"
import FolderOpen from "lucide-solid/icons/folder-open"
import Monitor from "lucide-solid/icons/monitor"
import Settings2 from "lucide-solid/icons/settings-2"
import Smartphone from "lucide-solid/icons/smartphone"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { createDismissable } from "../lib/dismiss.ts"

interface ScopeProject {
  readonly id: string
  readonly name: string
  readonly drawings: ReadonlyArray<{ readonly id: string; readonly name: string }>
}

interface ScopeDevice {
  readonly id: string
  readonly name: string
  readonly lastSeen: string | null
}

/** Real project/drawing and companion-device data, kept in the composer's context rail. */
export function ScopeBar(): JSX.Element {
  const app = useApp()
  const document = useDocumentStore()
  const navigate = useNavigate()
  const [scopeOpen, setScopeOpen] = createSignal(false)
  const [projects] = createResource(async (): Promise<ReadonlyArray<ScopeProject>> => {
    try {
      const rows = await app.runtime.run(app.client.projects.list()) as ReadonlyArray<{ readonly id: string; readonly name: string }>
      return await Promise.all(rows.map(async (project) => ({
        ...project,
        drawings: await app.runtime.run(app.client.drawings.listForProject({ params: { id: project.id } })) as ReadonlyArray<{ readonly id: string; readonly name: string }>
      })))
    } catch {
      return []
    }
  })
  const [devices] = createResource(async (): Promise<{ readonly enabled: boolean; readonly devices: ReadonlyArray<ScopeDevice> }> => {
    try {
      const status = await app.runtime.run(app.client.companion.status())
      return { enabled: status.enabled, devices: status.devices }
    } catch {
      return { enabled: false, devices: [] }
    }
  })

  const drawingValue = (): string => document.drawingId ?? ""
  const scopeLabel = createMemo(() => {
    if (!document.drawingId) return document.name ?? t("ai.composer.unsavedDrawing", { name: app.drawing().name })
    for (const project of projects() ?? []) {
      const drawing = project.drawings.find((candidate) => candidate.id === document.drawingId)
      if (drawing) return t("ai.composer.drawingInProject", { drawing: drawing.name, project: project.name })
    }
    return document.name ?? app.drawing().name
  })
  const selectDrawing = (value: string): void => {
    if (value === "") return
    const [kind, id] = value.split(":", 2)
    if (!id) return
    app.setActivity(kind === "drawing" ? "cad" : "projects")
    navigate(kind === "drawing" ? `/cad?drawingId=${encodeURIComponent(id)}` : `/projects/${encodeURIComponent(id)}`)
  }

  createDismissable({ open: scopeOpen, root: ".assistant-scope-control-root", onDismiss: () => setScopeOpen(false) })

  return (
    <div class="assistant-compose-scope" aria-label={t("ai.composer.scope")}>
      <div class="assistant-scope-control-root">
        <button
          type="button"
          class="assistant-scope-control"
          title={`${t("ai.composer.drawingTitle")}: ${scopeLabel()}`}
          aria-label={`${t("ai.composer.drawing")}: ${scopeLabel()}`}
          aria-haspopup="listbox"
          aria-expanded={scopeOpen()}
          onClick={() => setScopeOpen((open) => !open)}
        >
          <FolderOpen size={14} aria-hidden="true" />
          <span class="assistant-scope-label">{scopeLabel()}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        <Show when={scopeOpen()}>
          <div class="assistant-scope-menu" role="listbox" aria-label={t("ai.composer.drawing")}>
            <button
              type="button"
              role="option"
              aria-selected={drawingValue() === ""}
              class="assistant-scope-option"
              classList={{ "is-active": drawingValue() === "" }}
              onClick={() => setScopeOpen(false)}
            >
              <span class="assistant-scope-check">{drawingValue() === "" ? <Check size={13} aria-hidden="true" /> : null}</span>
              <span>{document.name ?? t("ai.composer.unsavedDrawing", { name: app.drawing().name })}</span>
            </button>
            <For each={projects()}>
              {(project) => (
                <section class="assistant-scope-group">
                  <p>{project.name}</p>
                  <For
                    each={project.drawings}
                    fallback={
                      <button type="button" role="option" aria-selected="false" class="assistant-scope-option" onClick={() => { selectDrawing(`project:${project.id}`); setScopeOpen(false) }}>
                        <span class="assistant-scope-check" />
                        <span>{t("ai.composer.openProject", { name: project.name })}</span>
                      </button>
                    }
                  >
                    {(drawing) => {
                      const active = (): boolean => drawing.id === drawingValue()
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={active()}
                          class="assistant-scope-option"
                          classList={{ "is-active": active() }}
                          onClick={() => { selectDrawing(`drawing:${drawing.id}`); setScopeOpen(false) }}
                        >
                          <span class="assistant-scope-check">{active() ? <Check size={13} aria-hidden="true" /> : null}</span>
                          <span>{t("ai.composer.drawingInProject", { drawing: drawing.name, project: project.name })}</span>
                        </button>
                      )
                    }}
                  </For>
                </section>
              )}
            </For>
          </div>
        </Show>
      </div>

      <details class="assistant-device-control">
        <summary title={t("ai.composer.deviceTitle")}>
          <Monitor size={14} aria-hidden="true" />
          <span>{t("ai.composer.thisComputer")}</span>
          <Show when={(devices()?.devices.length ?? 0) > 0}>
            <span class="assistant-device-count">{devices()?.devices.length}</span>
          </Show>
          <ChevronDown size={12} aria-hidden="true" />
        </summary>
        <div class="assistant-device-menu">
          <p class="assistant-device-menu-title">{t("ai.composer.executionDevice")}</p>
          <div class="assistant-device-row is-active">
            <Monitor size={14} aria-hidden="true" />
            <span><strong>{t("ai.composer.thisComputer")}</strong><small>{t("ai.composer.executionHost")}</small></span>
            <Check size={13} aria-hidden="true" />
          </div>
          <For each={devices()?.devices ?? []}>
            {(device) => (
              <div class="assistant-device-row">
                <Smartphone size={14} aria-hidden="true" />
                <span>
                  <strong>{device.name}</strong>
                  <small>{device.lastSeen ? t("ai.composer.lastSeen", { when: new Date(device.lastSeen).toLocaleString() }) : t("ai.composer.pairedCompanion")}</small>
                </span>
              </div>
            )}
          </For>
          <button type="button" class="assistant-device-manage" onClick={() => navigate("/settings/companion")}>
            <Settings2 size={13} aria-hidden="true" />
            {t("ai.composer.manageDevices")}
          </button>
        </div>
      </details>
    </div>
  )
}
