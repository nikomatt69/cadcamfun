/**
 * Notifications — the phone's view of the user's activity feed.
 *
 * The feed is the desktop's: every row is a `Notification` row written by the sidecar, so reviewing
 * a PR on the desktop marks it read here too. That is the whole point of the screen — it is not a
 * second inbox, it is the same one, on the phone.
 *
 * Interaction (Apple §13, §16):
 *  - Tapping a row marks it read (optimistic, so the badge clears on the same frame) and reports
 *    the failure by rolling the row back rather than by showing a toast over the list.
 *  - "Mark all read" sits in the nav as a text button and is disabled when there is nothing unread.
 *  - Unread rows carry a filled dot, the same affordance Mail uses; read rows do not.
 */
import { For, Match, Show, Switch, createResource, createSignal, type Accessor, type Component } from "solid-js"
import type { NotificationRow } from "@cadcamfun/api"
import type { CompanionClient } from "../companion/client.ts"
import { Bell, Check, ChevronRight, Pulls, Bolt, Sparkle, Branch, Person, Refresh } from "../components/Icon.tsx"
import { Pill, type PillTone } from "../components/Pill.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { ago } from "../lib/format.ts"
import { haptic } from "../lib/haptic.ts"
import { errorMessage } from "../lib/error.ts"

export interface NotificationsScreenProps {
  readonly client: CompanionClient
  /** Bumped by the shell when a live event arrives, so the list refreshes without polling. */
  readonly refreshKey: Accessor<number>
}

/** iOS puts the unread count in the nav; there is no separate screen for "unread only". */
const typeMeta = (type: NotificationRow["type"]): { readonly label: string; readonly tone: PillTone; readonly Icon: typeof Bell } => {
  switch (type) {
    case "PR_OPENED": return { label: "Pull request", tone: "accent", Icon: Pulls }
    case "PR_MERGED": return { label: "Merged", tone: "success", Icon: Check }
    case "PR_REVIEWED": return { label: "Review", tone: "neutral", Icon: Person }
    case "AI_COMMITTED": return { label: "Assistant", tone: "ai", Icon: Sparkle }
    case "WORKFLOW_FAILED": return { label: "Workflow failed", tone: "danger", Icon: Bolt }
    case "MEMBER_JOINED": return { label: "Member", tone: "neutral", Icon: Person }
    case "ORGANIZATION_INVITATION": return { label: "Invitation", tone: "warning", Icon: Person }
    case "PROJECT_CREATED": return { label: "Project", tone: "accent", Icon: Branch }
    case "COMPONENT_CREATED": return { label: "Component", tone: "neutral", Icon: Branch }
    default: return { label: "Message", tone: "neutral", Icon: Bell }
  }
}

export const NotificationsScreen: Component<NotificationsScreenProps> = (props) => {
  const [feed, { refetch, mutate }] = createResource(() => props.refreshKey(), () => props.client.notifications({ limit: 50 }))
  const [marking, setMarking] = createSignal(false)

  const markRead = async (row: NotificationRow) => {
    if (row.isRead) return
    haptic("selection")
    // Optimistic: the dot disappears immediately; a failure restores the previous list.
    const previous = feed()
    mutate((current) => ({
      notifications: (current?.notifications ?? []).map((n) => (n.id === row.id ? { ...n, isRead: true } : n)),
      unreadCount: Math.max(0, (current?.unreadCount ?? 1) - 1),
    }))
    try {
      await props.client.markNotificationRead(row.id, true)
    } catch (err) {
      haptic("error")
      if (previous) mutate(previous)
      else void refetch()
      console.warn(errorMessage(err))
    }
  }

  const markAll = async () => {
    if (marking()) return
    setMarking(true)
    haptic("light")
    try {
      await props.client.markAllNotificationsRead()
      haptic("success")
      await refetch()
    } catch (err) {
      haptic("error")
      console.warn(errorMessage(err))
    } finally {
      setMarking(false)
    }
  }

  return (
    <div class="screen-pad">
      <Switch>
        <Match when={feed.loading}>
          <div class="empty"><Spinner size="lg" /><p class="t-subhead text-secondary">Loading notifications…</p></div>
        </Match>
        <Match when={feed.error}>
          <div class="card card-elevated">
            <p class="t-headline">Couldn't load notifications</p>
            <p class="t-footnote text-secondary mt-2">{errorMessage(feed.error)}</p>
            <div class="actions-row">
              <button class="btn btn-secondary" onClick={() => { haptic("selection"); void refetch() }}>
                <Refresh size={18} /> Try again
              </button>
            </div>
          </div>
        </Match>
        <Match when={feed()}>
          {(data) => (
            <Show when={data().notifications.length > 0} fallback={
              <div class="empty">
                <div class="empty-mark"><Bell size={26} /></div>
                <h3>Nothing new</h3>
                <p>Pull requests, reviews and workflow failures from your desktop show up here.</p>
              </div>
            }>
              <Show when={(data().unreadCount ?? 0) > 0}>
                <div class="actions-row" style={{ "justify-content": "flex-end", "margin-bottom": "var(--s-3)" }}>
                  <button class="btn-ghost" onClick={markAll} disabled={marking()}>
                    <Show when={marking()} fallback={<><Check size={18} /> Mark all read</>}>
                      <Spinner size="sm" />
                    </Show>
                  </button>
                </div>
              </Show>
              <ul class="list list-grouped" role="list">
                <For each={data().notifications}>{(n, i) => {
                  const meta = typeMeta(n.type)
                  return (
                    <li
                      class="row"
                      role="button"
                      tabIndex={0}
                      classList={{ unread: !n.isRead }}
                      style={{ "animation-delay": `${Math.min(i(), 6) * 35}ms` }}
                      onClick={() => { void markRead(n) }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void markRead(n) } }}
                    >
                      <div class="row-icon" aria-hidden="true"><meta.Icon size={20} /></div>
                      <div class="row-body">
                        <span class="row-title bold">{n.title}</span>
                        <span class="row-sub t-wrap">{n.content}</span>
                        <span class="row-sub t-tertiary">{ago(n.createdAt)}</span>
                      </div>
                      <span class="row-trailing">
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        <ChevronRight class="chev" size={18} />
                      </span>
                    </li>
                  )
                }}</For>
              </ul>
            </Show>
          )}
        </Match>
      </Switch>
    </div>
  )
}
