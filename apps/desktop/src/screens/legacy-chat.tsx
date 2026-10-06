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
import { Motion } from "solid-motionone"
import { ArrowLeft, Building, MessageCircle, MessageSquare, Send, Users } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useRead } from "../app/queries.ts"
import { ConversationList } from "../components/chat/conversation-list.tsx"
import { ConversationDetail } from "../components/chat/conversation-detail.tsx"
import { NewConversation } from "../components/chat/new-conversation.tsx"

/** framer's page easing, verbatim from the legacy `pageVariants`. */
const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1]

const LIST_PANEL =
  "min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
/** Underscores stand for the spaces `calc()` needs in an arbitrary value. */
const HEIGHT_INDEX = "h-[calc(100vh_-_200px)]"
const HEIGHT_DETAIL = "h-[calc(100vh_-_84px)]"
const HEIGHT_NEW = "h-[calc(100vh_-_140px)]"
const FROSTED_PANEL =
  "rounded-2xl border border-gray-200/50 bg-white/70 shadow-lg backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-800/70"

export function LegacyChat(props: { readonly mode?: "conversation" | "new" | "group" }): JSX.Element {
  const params = useParams<{ id: string; conversationId?: string }>()
  const navigate = useNavigate()
  const organization = useRead((c) => c.organizations.get({ params: { id: params.id } }))
  const root = () => `/organizations/${encodeURIComponent(params.id)}`
  const isGroup = () => props.mode === "group"
  const isConversation = () => props.mode === "conversation"
  const isNew = () => props.mode === "new" || isGroup()

  const spinner = (): JSX.Element => (
    <span class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" aria-hidden="true" />
  )

  const loadingBlock = (): JSX.Element => (
    <div class="flex min-h-screen items-center justify-center">
      <div class="text-center">
        {spinner()}
        <Show when={isNew() || isConversation()}>
          <p class="mt-4 font-medium text-gray-600 dark:text-gray-400">
            {isConversation()
              ? t("chat.loadingConv")
              : isGroup()
                ? t("chat.preparingGroup")
                : t("chat.preparingDm")}
          </p>
        </Show>
      </div>
    </div>
  )

  const backToOrganizations = (): void => navigate("/organizations")

  /** `.reference/.../chat/index.tsx` — the bare "Organizzazione non trovata" block. */
  const notFoundIndex = (): JSX.Element => (
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div class="text-center">
        <h1 class="mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
          {t("chat.orgNotFound")}
        </h1>
        <p class="mb-6 text-gray-600 dark:text-gray-400">{t("chat.orgNotFoundBody")}</p>
        <button
          type="button"
          onClick={backToOrganizations}
          class="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {t("chat.backToOrgs")}
        </button>
      </div>
    </div>
  )

  /** `.reference/.../chat/[conversationId].tsx` — "Conversazione non trovata" card. */
  const notFoundConversation = (): JSX.Element => (
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-white p-6 dark:from-gray-900 dark:to-gray-800">
      <div class="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-6">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <MessageSquare class="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t("chat.convNotFound")}</h1>
          <p class="text-gray-600 dark:text-gray-400">{t("chat.convNotFoundBody")}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${root()}/chat`)}
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 font-medium text-white transition-all duration-200 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          {t("chat.backToChat")}
        </button>
      </div>
    </div>
  )

  /** `.reference/.../chat/new.tsx` and `new-group.tsx` — "Organizzazione non trovata" card. */
  const notFoundNew = (): JSX.Element => (
    <div
      class={`flex min-h-screen items-center justify-center p-6 ${isGroup()
        ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800"
        : "bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800"}`}
    >
      <div class="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-6">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Building class="h-8 w-8 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          </div>
          <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t("chat.orgNotFound")}</h1>
          <p class="text-gray-600 dark:text-gray-400">{t("chat.orgNotFoundBody")}</p>
        </div>
        <button
          type="button"
          onClick={backToOrganizations}
          class={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${isGroup()
            ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:ring-emerald-500"
            : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:ring-purple-500"}`}
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          {t("chat.backToOrgs")}
        </button>
      </div>
    </div>
  )

  const notFoundBlock = (): JSX.Element => {
    if (isConversation()) return notFoundConversation()
    if (isNew()) return notFoundNew()
    return notFoundIndex()
  }

  /** `/organizations/:id/chat` — header + list + "Seleziona una conversazione" placeholder. */
  const indexView = (): JSX.Element => (
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div class="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        <Motion.div
          class="mb-6 flex items-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, easing: EASE }}
        >
          <div class="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
            <MessageCircle class="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <h1 class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
            {t("chat.title")}
          </h1>
        </Motion.div>

        <Motion.div
          class={`flex ${HEIGHT_INDEX} gap-4`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, easing: EASE }}
        >
          {/* Conversation List */}
          <Motion.div
            class={`w-1/3 p-4 ${FROSTED_PANEL}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3, easing: EASE }}
          >
            <ConversationList organizationId={params.id} />
          </Motion.div>

          {/* Conversation Detail */}
          <Motion.div
            class={`w-2/3 ${FROSTED_PANEL}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4, easing: EASE }}
          >
            <div class="flex h-full items-center justify-center p-8">
              <div class="text-center text-gray-500 dark:text-gray-400">
                <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
                  <MessageCircle class="h-8 w-8 text-white" aria-hidden="true" />
                </div>
                <h2 class="mb-2 text-xl font-medium text-gray-900 dark:text-white">{t("chat.select")}</h2>
                <p class="text-sm">{t("chat.selectHint")}</p>
              </div>
            </div>
          </Motion.div>
        </Motion.div>
      </div>
    </div>
  )

  /** `/organizations/:id/chat/:conversationId` — list + thread panel. */
  const conversationView = (): JSX.Element => (
    <div class="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div class={`${HEIGHT_DETAIL} p-4`}>
        <div class="mx-auto flex h-full max-w-7xl gap-6">
          {/* Conversation List */}
          <div class="w-1/3 min-w-0">
            <div class="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <ConversationList organizationId={params.id} />
            </div>
          </div>

          {/* Conversation Detail */}
          <div class="w-2/3 min-w-0">
            <div class="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <ConversationDetail
                conversationId={params.conversationId ?? ""}
                organizationId={params.id}
                onBack={() => navigate(`${root()}/chat`)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  /** `/organizations/:id/chat/new` and `/new-group` — breadcrumb header + form. */
  const newView = (): JSX.Element => (
    <div class="min-h-screen">
      {/* Header with breadcrumb */}
      <div class="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mx-auto max-w-7xl px-4 py-4">
          <div class="flex items-center gap-3">
            <Motion.button
              type="button"
              onClick={() => navigate(`${root()}/chat`)}
              hover={{ scale: 1.05 }}
              press={{ scale: 0.95 }}
              aria-label={t("common.back")}
              class={`rounded-lg p-2 transition-colors ${isGroup()
                ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                : "bg-purple-100 text-purple-600 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"}`}
            >
              <ArrowLeft class="h-5 w-5" aria-hidden="true" />
            </Motion.button>
            <div class="flex items-center gap-2">
              {isGroup()
                ? <Users class="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                : <Send class="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />}
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
                {isGroup() ? t("chat.newGroup") : t("chat.newDm")}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div
        class={`${HEIGHT_NEW} p-4 ${isGroup()
          ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800"
          : "bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800"}`}
      >
        <div class="mx-auto flex h-full max-w-7xl gap-6">
          {/* Conversation List */}
          <Motion.div
            class="w-1/3 min-w-0"
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, easing: "ease-out" }}
          >
            <div class="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <ConversationList organizationId={params.id} />
            </div>
          </Motion.div>

          {/* New Conversation Form */}
          <Motion.div
            class="w-2/3 min-w-0"
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1, easing: "ease-out" }}
          >
            <div class="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <NewConversation
                organizationId={params.id}
                isGroupChat={isGroup()}
                onBack={() => navigate(`${root()}/chat`)}
              />
            </div>
          </Motion.div>
        </div>
      </div>
    </div>
  )

  const view = (): JSX.Element => {
    if (isConversation()) return conversationView()
    if (isNew()) return newView()
    return indexView()
  }

  return (
    <section class="min-h-screen">
      <Show
        when={organization.data() !== undefined || !organization.loading()}
        fallback={loadingBlock()}
      >
        <Show when={organization.data()} fallback={notFoundBlock()}>
          {view()}
        </Show>
      </Show>
    </section>
  )
}
