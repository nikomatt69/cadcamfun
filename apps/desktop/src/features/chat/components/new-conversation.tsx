/**
 * `NewConversation` — port of `.reference/src/components/chat/NewConversation.tsx`.
 *
 * Members come from `GET /api/organizations/:id`, whose reply already carries them:
 * the legacy `…/members?search=` call is folded into a client-side filter over that
 * list (there is no member-search endpoint in v6), and the chips / group-name field
 * behave exactly like the legacy local state.
 *
 * `POST`ing the conversation has no v6 counterpart, so the submit button keeps its
 * legacy disabled rule (`no selection`) and performs no request.
 */
import { For, Show, createSignal, createUniqueId, type JSX } from "solid-js"
import { ArrowLeft, Check, Search, User, X } from "lucide-solid"
import { useRead } from "../../../app/queries.ts"
import { t } from "../../../i18n/index.ts"
import { FIELD, ICON_BUTTON, LABEL, StageLoading, TOOLBAR_PRIMARY } from "../../../shared/components/WorkspacePage.tsx"

interface ChatMember {
  readonly id: string
  readonly name: string | null
  readonly email: string | null
  readonly image: string | null
  readonly role: "ADMIN" | "MANAGER" | "MEMBER"
}

export interface NewConversationProps {
  readonly organizationId: string
  readonly isGroupChat?: boolean
  readonly onBack?: () => void
}

export function NewConversation(props: NewConversationProps): JSX.Element {
  const fieldId = createUniqueId()
  const organization = useRead((c) => c.organizations.get({ params: { id: props.organizationId } }))
  const [selected, setSelected] = createSignal<ReadonlyArray<ChatMember>>([])
  const [searchQuery, setSearchQuery] = createSignal("")
  const [groupName, setGroupName] = createSignal("")

  const members = (): ReadonlyArray<ChatMember> => organization.data()?.members ?? []
  const filteredMembers = (): ReadonlyArray<ChatMember> => {
    const chosen = new Set(selected().map((member) => member.id))
    const query = searchQuery().trim().toLowerCase()
    return members().filter((member) => {
      if (chosen.has(member.id)) return false
      if (query.length === 0) return true
      return `${member.name ?? ""} ${member.email ?? ""}`.toLowerCase().includes(query)
    })
  }

  const selectMember = (member: ChatMember): void => {
    setSelected(props.isGroupChat === true ? [...selected(), member] : [member])
    setSearchQuery("")
  }
  const removeMember = (memberId: string): void => {
    setSelected(selected().filter((member) => member.id !== memberId))
  }

  /** Legacy `handleCreateConversation` → `createConversation`; no endpoint in v6. */
  const createConversation = (): void => undefined

  const memberButton =
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800"

  return (
    <div class="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700/70">
        <button type="button" onClick={props.onBack} class={ICON_BUTTON} aria-label={t("common.back")}>
          <ArrowLeft size={14} aria-hidden="true" />
        </button>

        <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">
          {props.isGroupChat === true ? t("chat.newGroup") : t("chat.newDm")}
        </h2>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-3">
        <Show when={props.isGroupChat === true}>
          <div class="mb-4">
            <label for={`${fieldId}-group`} class={LABEL}>
              {t("chat.groupName")}
            </label>
            <input
              type="text"
              id={`${fieldId}-group`}
              value={groupName()}
              onInput={(event) => setGroupName(event.currentTarget.value)}
              placeholder={t("chat.groupNamePlaceholder")}
              class={FIELD}
            />
          </div>
        </Show>

        <div class="mb-4">
          <label for={`${fieldId}-members`} class={LABEL}>
            {props.isGroupChat === true ? t("chat.addMembers") : t("chat.selectMember")}
          </label>

          <div class="relative">
            <input
              type="text"
              id={`${fieldId}-members`}
              value={searchQuery()}
              onInput={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder={t("chat.memberSearch")}
              class={`${FIELD} pl-8`}
            />
            <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          </div>
        </div>

        <Show when={selected().length > 0}>
          <div class="mb-4">
            <p class={LABEL}>
              {props.isGroupChat === true ? t("chat.selectedMembers") : t("chat.recipient")}
            </p>

            <div class="flex flex-wrap gap-2">
              <For each={selected()}>
                {(member) => (
                  <div class="inline-flex items-center gap-1 rounded-[5px] bg-blue-50 py-1 pl-2 pr-1 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    <span class="text-xs font-medium">{member.name ?? member.email ?? ""}</span>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      class="rounded-[4px] p-0.5 text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-800/60"
                      aria-label={`${t("common.close")}: ${member.name ?? member.email ?? member.id}`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show
          when={!organization.loading()}
          fallback={<StageLoading label={t("common.loading")} />}
        >
          <div class="space-y-1">
            <h3 class="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {filteredMembers().length > 0 ? t("chat.orgMembers") : t("chat.noMembersFound")}
            </h3>

            <For each={filteredMembers()}>
              {(member) => (
                <button type="button" class={memberButton} onClick={() => selectMember(member)}>
                  <div class="flex-shrink-0">
                    <Show
                      when={member.image !== null && member.image.length > 0}
                      fallback={
                        <div class="flex h-7 w-7 items-center justify-center rounded-[4px] bg-slate-100 dark:bg-slate-800">
                          <User size={14} class="text-slate-500 dark:text-slate-400" aria-hidden="true" />
                        </div>
                      }
                    >
                      <img
                        class="h-7 w-7 rounded-[4px] object-cover"
                        src={member.image ?? ""}
                        alt={member.name ?? t("org.members.avatarAlt")}
                      />
                    </Show>
                  </div>

                  <div class="min-w-0 flex-1 text-left">
                    <p class="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      {member.name ?? t("chat.unnamedUser")}
                    </p>
                    <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {member.email ?? t("chat.noEmail")} • {member.role}
                    </p>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div class="border-t border-slate-200 p-3 dark:border-slate-700/70">
        <button
          type="button"
          onClick={createConversation}
          disabled={selected().length === 0}
          class={`${TOOLBAR_PRIMARY} w-full justify-center`}
        >
          <Check size={14} aria-hidden="true" />
          {props.isGroupChat === true ? t("chat.createGroup") : t("chat.startConversation")}
        </button>
      </div>
    </div>
  )
}
