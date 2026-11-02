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
import { Building, MessageSquare } from "lucide-solid"
import { StageEmpty, StageError, StageLoading, TOOLBAR_PRIMARY, WorkspaceDetail } from "../../../shared/components/WorkspacePage.tsx"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { ConversationList } from "../components/conversation-list.tsx"
import { ConversationDetail } from "../components/conversation-detail.tsx"
import { NewConversation } from "../components/new-conversation.tsx"
import { ChatEmpty } from "../components/chat-empty.tsx"

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
      <StageLoading label={isConversation() ? t("chat.loadingConv") : isGroup() ? t("chat.preparingGroup") : isNew() ? t("chat.preparingDm") : t("common.loading")} />
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

  /** The thread stacks below navigation when the page column is narrow. */
  const columns = (main: JSX.Element): JSX.Element => (
    <div class="grid min-h-[480px] flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
      <div class={CHAT_PANEL}><ConversationList organizationId={params.id} /></div>
      <div class={CHAT_PANEL}>{main}</div>
    </div>
  )

  const mainPanel = (): JSX.Element => {
    if (isConversation()) {
      return <ConversationDetail conversationId={params.conversationId ?? ""} organizationId={params.id} onBack={() => navigate(`${root()}/chat`)} />
    }
    if (isNew()) {
      return <NewConversation organizationId={params.id} isGroupChat={isGroup()} onBack={() => navigate(`${root()}/chat`)} />
    }
    return <ChatEmpty title={t("chat.select")} hint={t("chat.selectHint")} />
  }

  return (
    <Show when={organization.data() !== undefined || !organization.loading()} fallback={loadingBlock()}>
      <Show when={!organization.error()} fallback={
        <WorkspaceDetail title={t("chat.title")} backHref="/organizations" backLabel={t("chat.backToOrgs")}>
          <StageError message={`${t("common.error")}: ${organization.error()}`} />
        </WorkspaceDetail>
      }>
      <Show when={organization.data()} fallback={notFoundBlock()}>
        <WorkspaceDetail title={title()} subtitle={organization.data()?.name} backHref={backHref()} backLabel={backLabel()}>
          {columns(mainPanel())}
        </WorkspaceDetail>
      </Show>
      </Show>
    </Show>
  )
}
