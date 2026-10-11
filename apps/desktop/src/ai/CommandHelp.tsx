/**
 * The full command reference, opened with `/help`.
 *
 * The palette is transient and filtered; this is the same registry at rest, so
 * a user can read what every `/` command does without holding the composer open.
 * Groups and wording come from `commands.ts` — there is one source of truth.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import { COMMAND_GROUP_ORDER, COMMANDS, type CommandGroup } from "./commands.ts"

interface Props {
  readonly onRun: (name: string) => void
}

export function CommandHelp(props: Props): JSX.Element {
  const groups = createMemo<ReadonlyArray<{ group: CommandGroup; names: ReadonlyArray<string> }>>(() =>
    COMMAND_GROUP_ORDER
      .map((group) => ({ group, names: COMMANDS.filter((command) => command.group === group).map((command) => command.name) }))
      .filter((entry) => entry.names.length > 0)
  )

  return (
    <div class="assistant-cmd-help" data-testid="ai-command-help">
      <p class="text-xs text-gray-500">{t("ai.cmd.help.hint")}</p>
      <For each={groups()}>
        {(group) => (
          <section>
            <p class="assistant-cmd-help-group">{t(`ai.cmd.group.${group.group}` as never)}</p>
            <dl class="assistant-cmd-help-list">
              <For each={COMMANDS.filter((command) => command.group === group.group)}>
                {(command) => (
                  <div data-testid={`ai-help-${command.name}`}>
                    <dt>
                      <button type="button" onClick={() => props.onRun(command.name)}>
                        /{command.name}
                        <Show when={command.args}><span class="assistant-palette-args">{command.args}</span></Show>
                      </button>
                    </dt>
                    <dd>{t(command.description)}</dd>
                  </div>
                )}
              </For>
            </dl>
          </section>
        )}
      </For>
    </div>
  )
}