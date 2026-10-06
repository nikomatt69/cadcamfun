import { For, Show, type JSX } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { useRead } from "../app/queries.ts"
import { EmptyState, ScreenHeader } from "./screen-parts.tsx"
import { LegacyNotice, LegacyReadState, lt } from "./legacy-parts.tsx"

export function LegacyChat(props: { readonly mode?: "conversation" | "new" | "group" }): JSX.Element {
  const params = useParams<{ id: string; conversationId?: string }>()
  const organization = useRead((c) => c.organizations.get({ params: { id: params.id } }))
  const root = () => `/organizations/${encodeURIComponent(params.id)}`
  const title = () => lt(props.mode === "new" ? "legacy.newConversation" : props.mode === "group" ? "legacy.newGroup" : "legacy.chat")
  return <section>
    <ScreenHeader title={title()} subtitle={organization.data()?.name} actions={<A class="btn btn-outline" href={root()}>{lt("legacy.backOrganization")}</A>} />
    <div class="space-y-4 p-4 sm:p-6">
      <LegacyNotice message={lt("legacy.chatGap")} />
      <LegacyReadState loading={organization.loading()} error={organization.error()} retry={organization.refetch} />
      <Show when={organization.data()}>{(org) => <div class="grid gap-4 md:grid-cols-[18rem_1fr]">
        <aside class="card space-y-4 rounded-2xl p-4">
          <h2 class="font-semibold">{lt("legacy.conversations")}</h2>
          <nav class="grid gap-2" aria-label={lt("legacy.chat")}>
            <A class="btn btn-outline" href={`${root()}/chat`}>{lt("legacy.chat")}</A>
            <A class="btn btn-outline" href={`${root()}/chat/new`}>{lt("legacy.newConversation")}</A>
            <A class="btn btn-outline" href={`${root()}/chat/new-group`}>{lt("legacy.newGroup")}</A>
          </nav>
          <h2 class="border-t border-gray-200 pt-4 font-semibold dark:border-gray-700">{lt("legacy.members")}</h2>
          <Show when={org().members.length === 0}><EmptyState label={lt("legacy.noMembers")} /></Show>
          <ul class="space-y-3"><For each={org().members}>{(member) => <li class="flex items-start justify-between gap-2 text-sm"><span class="break-all">{member.name ?? member.email ?? member.id}</span><span class="text-xs text-gray-500">{member.role}</span></li>}</For></ul>
        </aside>
        <div class="card flex min-h-[24rem] flex-col gap-4 rounded-2xl p-5">
          <h2 class="font-semibold">{title()}</h2>
          <Show when={props.mode === "group"}><label class="form-label">{lt("legacy.groupName")}<input class="form-input" disabled /></label></Show>
          <p class="flex-1 text-sm text-gray-500 dark:text-gray-400">{lt("legacy.chatGap")}</p>
          <label class="form-label">{lt("legacy.message")}<textarea class="form-textarea" disabled /></label>
          <button class="btn btn-primary self-end" disabled>{lt("legacy.send")}</button>
        </div>
      </div>}</Show>
    </div>
  </section>
}
