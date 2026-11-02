/**
 * `ConversationDetail` — port of `.reference/src/components/chat/ConversationDetail.tsx`.
 *
 * The legacy component renders three shapes: a spinner while `fetchConversation` runs,
 * the "Seleziona una conversazione" empty state when the store has no active
 * conversation, and the thread itself. v6 exposes no conversation endpoint, so the store
 * can never hold one and the empty state is the honest, permanent answer — the thread,
 * the composer, the typing indicator and the uploaders all sit behind that branch.
 *
 * The props mirror the legacy call site (`conversationId`, `organizationId`, `onBack`)
 * so the page keeps reading like the original; nothing else is reachable.
 */
import type { JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { ChatEmpty } from "./chat-empty.tsx"

export interface ConversationDetailProps {
  readonly conversationId: string
  readonly organizationId: string
  readonly onBack?: () => void
}

export function ConversationDetail(_props: ConversationDetailProps): JSX.Element {
  return <ChatEmpty title={t("chat.select")} hint={t("chat.selectHintDetail")} />
}
