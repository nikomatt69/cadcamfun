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
import { MessageCircle } from "lucide-solid"
import { t } from "../../../i18n/index.ts"

export interface ConversationDetailProps {
  readonly conversationId: string
  readonly organizationId: string
  readonly onBack?: () => void
}

export function ConversationDetail(_props: ConversationDetailProps): JSX.Element {
  return (
    <div class="flex h-full flex-col items-center justify-center text-gray-500 dark:text-gray-400">
      <MessageCircle class="mb-4 h-16 w-16" aria-hidden="true" />
      <h2 class="mb-2 text-xl font-semibold">{t("chat.select")}</h2>
      <p class="text-sm">{t("chat.selectHintDetail")}</p>
    </div>
  )
}
