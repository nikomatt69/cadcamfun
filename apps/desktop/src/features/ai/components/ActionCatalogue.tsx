/**
 * What the assistant is allowed to do.
 *
 * The host publishes the actions the agent may call, each with its kind: a read
 * changes nothing, a write changes the project, a destructive one removes
 * something. Showing them is the difference between trusting the assistant and
 * guessing — and it is the same catalogue the host enforces, not a second list
 * written here.
 */
import { For, Show, createResource, createSignal, type JSX } from "solid-js"
import ChevronDown from "lucide-solid/icons/chevron-down"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"

interface BridgeAction {
  readonly id: string
  readonly name: string
  readonly kind: "read" | "write" | "destructive"
}

interface BridgeTool {
  readonly id: string
  readonly description: string
  readonly kind: "read" | "write" | "destructive"
  readonly actions: ReadonlyArray<BridgeAction>
  readonly parameters: Readonly<Record<string, unknown>>
}

export function ActionCatalogue(): JSX.Element {
  const app = useApp()
  const [catalogue, { refetch }] = createResource(async (): Promise<ReadonlyArray<BridgeTool>> => {
    const reply = await app.runtime.run(app.client.ai.actions())
    return reply.tools as ReadonlyArray<BridgeTool>
  })

  return (
    <section class="assistant-action-catalogue" data-testid="ai-action-catalogue">
      <p class="assistant-meta-text mb-2">{t("ai.catalog.hint")}</p>
      <Show
        when={catalogue()}
        fallback={
          <p class="assistant-meta-text" data-testid="ai-action-catalogue-empty">
            {catalogue.error === undefined ? t("ai.catalog.unavailable") : t("ai.catalog.empty")}
          </p>
        }
      >
        {(tools) => (
          <>
            <p class="assistant-section-label">{t("ai.catalog.tools", { count: tools().length })}</p>
            <ul class="assistant-catalogue-list">
              <For each={tools()}>
                {(tool) => <CatalogueTool tool={tool} />}
              </For>
            </ul>
            <button type="button" class="assistant-link-btn mt-2" onClick={() => void refetch()}>
              {t("ai.toolbar.refresh")}
            </button>
          </>
        )}
      </Show>
    </section>
  )
}

function CatalogueTool(props: { readonly tool: BridgeTool }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <li class="assistant-catalogue-tool" data-kind={props.tool.kind} data-testid={`ai-catalogue-${props.tool.id}`}>
      <button type="button" class="assistant-catalogue-tool-head" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <span class="assistant-catalogue-tool-id">{props.tool.id}</span>
        <span class="assistant-pill" data-kind={props.tool.kind}>{kindLabel(props.tool.kind)}</span>
        <ChevronDown size={12} aria-hidden="true" class={open() ? "rotate-180 transition" : "transition"} />
      </button>
      <Show when={open()}>
        <div class="assistant-catalogue-tool-body">
          <p class="assistant-meta-text">{props.tool.description}</p>
          <Show when={props.tool.actions.length > 0}>
            <p class="assistant-section-label">{t("ai.catalog.actions", { count: props.tool.actions.length })}</p>
            <ul class="assistant-catalogue-actions">
              <For each={props.tool.actions}>
                {(action) => (
                  <li data-kind={action.kind}>
                    <code>{action.id}</code>
                    <span class="assistant-pill" data-kind={action.kind}>{kindLabel(action.kind)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
    </li>
  )
}

const kindLabel = (kind: "read" | "write" | "destructive"): string =>
  kind === "read" ? t("ai.catalog.read") : kind === "write" ? t("ai.catalog.write") : t("ai.catalog.destructive")
