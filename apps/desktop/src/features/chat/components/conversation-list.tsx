/**
 * `ConversationList` — port of `.reference/src/components/chat/ConversationList.tsx`.
 *
 * The legacy list is backed by `GET /api/organizations/:id/conversations`, which v6 does
 * not expose, so the component renders the legacy state that follows from an empty
 * answer: the search field, the two shortcuts and the "Nessuna conversazione" empty
 * state. The pull-to-refresh / infinite-scroll handlers only ever run against that same
 * missing feed and are therefore not carried over.
 */
import type { JSX } from "solid-js"
import { A } from "@solidjs/router"
import { MessageCircle, Search, User, Users } from "lucide-solid"
import { t } from "../../../i18n/index.ts"

const SHORTCUT =
  "rounded-md bg-blue-50 p-2 text-blue-600 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
const EMPTY_CTA =
  "inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"

export function ConversationList(props: { readonly organizationId: string }): JSX.Element {
  const root = () => `/organizations/${encodeURIComponent(props.organizationId)}`

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-md dark:bg-gray-800">
      <div class="border-b border-gray-200 p-4 dark:border-gray-700">
        <h2 class="flex items-center text-lg font-semibold text-gray-900 dark:text-gray-100">
          <MessageCircle class="mr-2 h-5 w-5" aria-hidden="true" />
          {t("chat.messages")}
        </h2>

        <div class="mt-2 flex">
          <div class="relative flex-1">
            <input
              type="text"
              placeholder={t("chat.searchPlaceholder")}
              class="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <Search class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          </div>

          <div class="ml-2 flex">
            <A href={`${root()}/chat/new`} title={t("chat.newDm")} class={SHORTCUT}>
              <User class="h-4 w-4" aria-hidden="true" />
            </A>
            <A href={`${root()}/chat/new-group`} title={t("chat.newGroup")} class={`ml-1 ${SHORTCUT}`}>
              <Users class="h-4 w-4" aria-hidden="true" />
            </A>
          </div>
        </div>
      </div>

      {/* Conversations list — no feed endpoint, so the legacy empty state is the answer. */}
      <div class="flex-1 overflow-y-auto p-2">
        <div class="py-8 text-center">
          <MessageCircle class="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" aria-hidden="true" />
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{t("chat.noConversations")}</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("chat.noConversationsBody")}</p>
          <div class="mt-4 flex justify-center space-x-2">
            <A href={`${root()}/chat/new`} class={EMPTY_CTA}>
              <User class="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t("chat.newMessage")}
            </A>
            <A href={`${root()}/chat/new-group`} class={EMPTY_CTA}>
              <Users class="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t("chat.newGroupShort")}
            </A>
          </div>
        </div>
      </div>
    </div>
  )
}
