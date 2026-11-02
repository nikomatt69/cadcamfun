/**
 * The empty thread panel: the chat scene (a message arrives, a reply is typed) over the
 * same title and hint the legacy page showed. Shared by the chat index and the detail.
 */
import type { JSX } from "solid-js"
import { ChatPreview } from "../../../shared/ui/stageshow/scenes-account.tsx"

export function ChatEmpty(props: { readonly title: string; readonly hint: string }): JSX.Element {
  return (
    <div class="workspace-empty !max-w-none !rounded-none !border-0 !bg-transparent">
      <div class="workspace-empty__preview" aria-hidden="true"><ChatPreview /></div>
      <h3>{props.title}</h3>
      <p>{props.hint}</p>
    </div>
  )
}
