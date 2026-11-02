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
import { FIELD, ICON_BUTTON, TOOLBAR_BUTTON, TOOLBAR_PRIMARY } from "../../../shared/components/WorkspacePage.tsx"

export function ConversationList(props: { readonly organizationId: string }): JSX.Element {
  const root = () => `/organizations/${encodeURIComponent(props.organizationId)}`

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <div class="border-b border-slate-200 p-3 dark:border-slate-700/70">
        <h2 class="flex items-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-white">
          <MessageCircle size={14} aria-hidden="true" />
          {t("chat.messages")}
        </h2>

        <div class="mt-3 flex items-center gap-1">
          <div class="relative flex-1">
            <input type="text" placeholder={t("chat.searchPlaceholder")} class={`${FIELD} pl-8`} />
            <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          </div>
          <A href={`${root()}/chat/new`} title={t("chat.newDm")} aria-label={t("chat.newDm")} class={ICON_BUTTON}>
            <User size={14} aria-hidden="true" />
          </A>
          <A href={`${root()}/chat/new-group`} title={t("chat.newGroup")} aria-label={t("chat.newGroup")} class={ICON_BUTTON}>
            <Users size={14} aria-hidden="true" />
          </A>
        </div>
      </div>

      {/* Conversations list — no feed endpoint, so the legacy empty state is the answer. */}
      <div class="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center">
        <h3 class="text-xs font-semibold text-slate-900 dark:text-white">{t("chat.noConversations")}</h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("chat.noConversationsBody")}</p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <A href={`${root()}/chat/new`} class={TOOLBAR_PRIMARY}>
            <User size={14} aria-hidden="true" />
            {t("chat.newMessage")}
          </A>
          <A href={`${root()}/chat/new-group`} class={TOOLBAR_BUTTON}>
            <Users size={14} aria-hidden="true" />
            {t("chat.newGroupShort")}
          </A>
        </div>
      </div>
    </div>
  )
}
