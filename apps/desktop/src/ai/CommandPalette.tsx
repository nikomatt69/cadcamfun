/**
 * The slash-command palette that opens above the composer when the draft starts
 * with `/` — nikcli's behaviour, in a panel.
 *
 * It is deliberately not a modal: the textarea keeps focus and the keyboard, so
 * ↑/↓ move the selection, ⏎ runs the command, Tab completes its name and Esc
 * closes the list without touching the draft. Clicking works too, because a
 * mouse user should not have to learn the shortcuts.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import CornerDownLeft from "lucide-solid/icons/corner-down-left"
import Search from "lucide-solid/icons/search"
import { t } from "../i18n/index.ts"
import { COMMAND_GROUP_ORDER, searchCommands, type CommandGroup, type SlashCommand } from "./commands.ts"

interface Props {
  readonly draft: string
  readonly activeId: string | undefined
  readonly onSelect: (command: SlashCommand) => void
  readonly onHighlight: (id: string) => void
}

interface Group {
  readonly group: CommandGroup
  readonly commands: ReadonlyArray<SlashCommand>
}

/** The query is what follows the slash; the leading `/` is not part of it. */
const queryOf = (draft: string): string => (draft.startsWith("/") ? draft.slice(1) : draft)

export function CommandPalette(props: Props): JSX.Element {
  const commands = createMemo(() => searchCommands(queryOf(props.draft)))
  const groups = createMemo<ReadonlyArray<Group>>(() => {
    const byGroup = new Map<CommandGroup, SlashCommand[]>()
    for (const command of commands()) {
      const bucket = byGroup.get(command.group) ?? []
      bucket.push(command)
      byGroup.set(command.group, bucket)
    }
    return COMMAND_GROUP_ORDER
      .filter((group) => byGroup.has(group))
      .map((group) => ({ group, commands: byGroup.get(group)! }))
  })

  return (
    <div
      class="assistant-palette"
      role="listbox"
      aria-label={t("ai.palette.title")}
      data-testid="ai-command-palette"
    >
      <p class="assistant-palette-head">
        <Search size={11} aria-hidden="true" />
        <span>{t("ai.palette.title")}</span>
        <Show when={queryOf(props.draft).trim() !== ""}>
          <span class="assistant-palette-query" data-testid="ai-command-query">{queryOf(props.draft).trim()}</span>
        </Show>
      </p>
      <Show
        when={groups().length > 0}
        fallback={<p class="assistant-palette-empty" data-testid="ai-command-empty">{t("ai.palette.empty")}</p>}
      >
        <div class="assistant-palette-scroll">
          <For each={groups()}>
            {(group) => (
              <section class="assistant-palette-group">
                <p class="assistant-palette-group-label">{t(`ai.cmd.group.${group.group}` as never)}</p>
                <ul>
                  <For each={group.commands}>
                    {(command) => (
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={props.activeId === command.name}
                          data-testid={`ai-command-${command.name}`}
                          class="assistant-palette-item"
                          classList={{ "is-active": props.activeId === command.name }}
                          onMouseEnter={() => props.onHighlight(command.name)}
                          onClick={() => props.onSelect(command)}
                        >
                          <span class="assistant-palette-name">
                            /{command.name}
                            <Show when={command.args}>
                              <span class="assistant-palette-args">{command.args}</span>
                            </Show>
                          </span>
                          <span class="assistant-palette-title">{t(command.title)}</span>
                          <span class="assistant-palette-desc">{t(command.description)}</span>
                          <Show when={props.activeId === command.name}>
                            <CornerDownLeft size={12} class="assistant-palette-enter" aria-hidden="true" />
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </Show>
      <p class="assistant-palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd>{t("ai.palette.nav")}</span>
        <span><kbd>⏎</kbd>{t("ai.palette.run")}</span>
        <span><kbd>Tab</kbd>{t("ai.palette.complete")}</span>
        <span><kbd>Esc</kbd>{t("ai.palette.close")}</span>
      </p>
    </div>
  )
}