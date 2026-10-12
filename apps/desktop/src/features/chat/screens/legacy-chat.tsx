/**
 * The organization chat routes — `/organizations/:id/chat{,/new,/new-group,/:conversationId}`.
 *
 * Ports of `.reference/src/pages/organizations/[id]/chat/*.tsx` plus the three chat
 * components they compose (`ConversationList`, `ConversationDetail`, `NewConversation`).
 *
 * v6 exposes no conversation, message or member-search endpoint, so the feeds render
 * their legacy empty answers instead of inventing threads:
 *  - the list always shows the "Nessuna conversazione" state;
 *  - the thread panel renders `ConversationDetail`'s "Seleziona una conversazione"
 *    branch, which is what legacy shows whenever its store holds no conversation;
 *  - the new-conversation form picks members from `organizations.get().members` and
 *    never posts.
 *
 * The three legacy "not found" cards depend on a missing route param, which the router
 * guarantees, so they are kept behind the organization read: a failed read is the only
 * moment they can surface, exactly where legacy showed its own error state.
 */
import { Show, type JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Building, MessageCircle, MessageSquare } from "lucide-solid"
import { PANEL, StageEmpty, TOOLBAR_PRIMARY, WorkspaceDetail } from "../../../shared/components/WorkspacePage.tsx"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { ConversationList } from "../components/conversation-list.tsx"
import { ConversationDetail } from "../components/conversation-detail.tsx"
import { NewConversation } from "../components/new-conversation.tsx"

/** A chat panel: the shared glass card, filling its column. */
const CHAT_PANEL = "ui-card ui-card-default min-w-0 overflow-hidden"

export function LegacyChat(props: { readonly mode?: "conversation" | "new" | "group" }): JSX.Element {
  const params = useParams<{ id: string; conversationId?: string }>()
  const navigate = useNavigate()
  const organization = useRead((c) => c.organizations.get({ params: { id: params.id } }))
  const root = () => `/organizations/${encodeURIComponent(params.id)}`
  const isGroup = () => props.mode === "group"
  const isConversation = () => props.mode === "conversation"
  const isNew = () => props.mode === "new" || isGroup()

  const title = (): string => (isGroup() ? t("chat.newGroup") : isNew() ? t("chat.newDm") : t("chat.title"))
  /** The chat index goes back to the organization; the sub-pages go back to the chat. */
  const backHref = (): string => (isConversation() || isNew() ? `${root()}/chat` : root())
  const backLabel = (): string => (isConversation() || isNew() ? t("chat.backToChat") : t("common.back"))

  const loadingBlock = (): JSX.Element => (
    <WorkspaceDetail title={t("chat.title")} backHref="/organizations" backLabel={t("chat.backToOrgs")}>
      <div class="flex flex-1 items-center justify-center">
        <div class="text-center">
          <span class="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" aria-hidden="true" />
          <Show when={isNew() || isConversation()}>
            <p class="mt-4 font-medium text-gray-600 dark:text-gray-400" role="status">
              {isConversation() ? t("chat.loadingConv") : isGroup() ? t("chat.preparingGroup") : t("chat.preparingDm")}
            </p>
          </Show>
        </div>
      </div>
    </WorkspaceDetail>
  )

  /** The "not found" states of the three legacy pages: the organization or the conversation could not be read. */
  const notFoundBlock = (): JSX.Element => (
    <WorkspaceDetail title={t("chat.title")} backHref="/organizations" backLabel={t("chat.backToOrgs")}>
      <StageEmpty
        icon={isConversation() ? <MessageSquare size={24} aria-hidden="true" /> : <Building size={24} aria-hidden="true" />}
        title={isConversation() ? t("chat.convNotFound") : t("chat.orgNotFound")}
        hint={isConversation() ? t("chat.convNotFoundBody") : t("chat.orgNotFoundBody")}
      >
        <button type="button" class={TOOLBAR_PRIMARY} onClick={() => navigate(isConversation() ? `${root()}/chat` : "/organizations")}>
          {isConversation() ? t("chat.backToChat") : t("chat.backToOrgs")}
        </button>
      </StageEmpty>
    </WorkspaceDetail>
  )

  /** The two-column layout: the conversation list and the main panel, filling the page. */
  const columns = (main: JSX.Element): JSX.Element => (
    <div class="flex min-h-[480px] flex-1 gap-4">
      <div class={`w-1/3 ${CHAT_PANEL}`}><ConversationList organizationId={params.id} /></div>
      <div class={`w-2/3 ${CHAT_PANEL}`}>{main}</div>
    </div>
  )

  const mainPanel = (): JSX.Element => {
    if (isConversation()) {
      return <ConversationDetail conversationId={params.conversationId ?? ""} organizationId={params.id} onBack={() => navigate(`${root()}/chat`)} />
    }
    if (isNew()) {
      return <NewConversation organizationId={params.id} isGroupChat={isGroup()} onBack={() => navigate(`${root()}/chat`)} />
    }
    return (
      <div class="flex h-full items-center justify-center p-8">
        <div class="text-center text-gray-500 dark:text-gray-400">
          <div class={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${PANEL} !p-0 text-[#007ACC] dark:text-blue-300`}>
            <MessageCircle class="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 class="mb-2 text-xl font-medium text-gray-900 dark:text-white">{t("chat.select")}</h2>
          <p class="text-sm">{t("chat.selectHint")}</p>
        </div>
      </div>
    )
  }

  return (
    <Show when={organization.data() !== undefined || !organization.loading()} fallback={loadingBlock()}>
      <Show when={organization.data()} fallback={notFoundBlock()}>
        <WorkspaceDetail title={title()} subtitle={organization.data()?.name} backHref={backHref()} backLabel={backLabel()}>
          {columns(mainPanel())}
        </WorkspaceDetail>
      </Show>
    </Show>
  )
}
