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
import { For, Show, createSignal, type JSX } from "solid-js"
import { ArrowLeft, Check, Search, User, X } from "lucide-solid"
import { useRead } from "../../../app/queries.ts"
import { t } from "../../../i18n/index.ts"

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
    setSelected([...selected(), member])
    setSearchQuery("")
  }
  const removeMember = (memberId: string): void => {
    setSelected(selected().filter((member) => member.id !== memberId))
  }

  /** Legacy `handleCreateConversation` → `createConversation`; no endpoint in v6. */
  const createConversation = (): void => undefined

  const memberButton =
    "flex w-full items-center rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700"

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-md dark:bg-gray-800">
      {/* Header */}
      <div class="flex items-center border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={props.onBack}
          class="mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          aria-label={t("common.back")}
        >
          <ArrowLeft class="h-5 w-5" aria-hidden="true" />
        </button>

        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">
          {props.isGroupChat === true ? t("chat.newGroup") : t("chat.newDm")}
        </h2>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-4">
        <Show when={props.isGroupChat === true}>
          <div class="mb-4">
            <label for="groupName" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("chat.groupName")}
            </label>
            <input
              type="text"
              id="groupName"
              value={groupName()}
              onInput={(event) => setGroupName(event.currentTarget.value)}
              placeholder={t("chat.groupNamePlaceholder")}
              class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </Show>

        <div class="mb-4">
          <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {props.isGroupChat === true ? t("chat.addMembers") : t("chat.selectMember")}
          </label>

          <div class="relative">
            <input
              type="text"
              value={searchQuery()}
              onInput={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder={t("chat.memberSearch")}
              class="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-4 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <Search class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          </div>
        </div>

        <Show when={selected().length > 0}>
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {props.isGroupChat === true ? t("chat.selectedMembers") : t("chat.recipient")}
            </label>

            <div class="flex flex-wrap gap-2">
              <For each={selected()}>
                {(member) => (
                  <div class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    <span class="text-sm font-medium">{member.name ?? member.email ?? ""}</span>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      class="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      aria-label={t("common.close")}
                    >
                      <X class="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show
          when={!organization.loading()}
          fallback={
            <div class="flex h-32 items-center justify-center">
              <span class="h-6 w-6 animate-spin rounded-full border-2 border-b-2 border-blue-500" aria-hidden="true" />
            </div>
          }
        >
          <div class="space-y-1">
            <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {filteredMembers().length > 0 ? t("chat.orgMembers") : t("chat.noMembersFound")}
            </h3>

            <For each={filteredMembers()}>
              {(member) => (
                <button type="button" class={memberButton} onClick={() => selectMember(member)}>
                  <div class="flex-shrink-0">
                    <Show
                      when={member.image !== null && member.image.length > 0}
                      fallback={
                        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                          <User class="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                        </div>
                      }
                    >
                      <img
                        class="h-10 w-10 rounded-full"
                        src={member.image ?? ""}
                        alt={member.name ?? t("org.members.avatarAlt")}
                      />
                    </Show>
                  </div>

                  <div class="ml-3 flex-1 text-left">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {member.name ?? t("chat.unnamedUser")}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
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
      <div class="border-t border-gray-200 p-4 dark:border-gray-700">
        <button
          type="button"
          onClick={createConversation}
          disabled={selected().length === 0}
          class="flex w-full items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <Check class="mr-2 h-4 w-4" aria-hidden="true" />
          {props.isGroupChat === true ? t("chat.createGroup") : t("chat.startConversation")}
        </button>
      </div>
    </div>
  )
}
