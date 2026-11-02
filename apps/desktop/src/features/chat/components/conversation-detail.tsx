/**
 * `ConversationDetail` — port of `.reference/src/components/chat/ConversationDetail.tsx`.
 *
 * The desktop API does not expose a conversation feed. A direct conversation URL
 * therefore explains the unavailable feature instead of appearing to load a thread,
 * while keeping a route back to the list.
 */
import { Show, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { TOOLBAR_BUTTON } from "../../../shared/components/WorkspacePage.tsx"
import { ChatEmpty } from "./chat-empty.tsx"

export interface ConversationDetailProps {
  readonly conversationId: string
  readonly organizationId: string
  readonly onBack?: () => void
}

export function ConversationDetail(props: ConversationDetailProps): JSX.Element {
  return <div class="flex h-full min-h-64 flex-col">
    <Show when={props.onBack}>
      <div class="border-b border-slate-200 p-3 dark:border-slate-700/70">
        <button type="button" class={TOOLBAR_BUTTON} onClick={() => props.onBack?.()}>{t("chat.backToChat")}</button>
      </div>
    </Show>
    <div class="flex flex-1 items-center justify-center"><ChatEmpty title={t("chat.title")} hint={t("legacy.chatGap")} /></div>
  </div>
}
