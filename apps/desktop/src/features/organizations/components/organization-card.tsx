/**
 * `OrganizationCard` — an organization in the workspace card style shared with the toolpaths and resources lists.
 *
 * The list endpoint answers `userCount` and `projectCount`, so the counters arrive with the card. The footer
 * badge keeps the legacy outcome (`org.id === "ADMIN"` never matches, so it always reads "Member").
 */
import type { JSX } from "solid-js"
import { Show } from "solid-js"
import { A } from "@solidjs/router"
import { Building, Calendar } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { BADGE, CARD, CardBanner } from "../../../shared/components/WorkspacePage.tsx"

export interface OrganizationCardOrg {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly createdAt: string
}

export interface OrganizationCardProps {
  readonly org: OrganizationCardOrg
  readonly memberCount: number
  readonly projectCount: number
}

const formatDateYear = (dateString: string): string => {
  const parsed = Date.parse(dateString)
  return Number.isNaN(parsed) ? "" : String(new Date(parsed).getFullYear())
}

export function OrganizationCard(props: OrganizationCardProps): JSX.Element {
  return (
    <A href={`/organizations/${encodeURIComponent(props.org.id)}`} class={`${CARD} cursor-pointer`}>
      <CardBanner icon={<Building size={24} aria-hidden="true" />} badge={t("org.card.active")} />
      <div class="flex flex-1 flex-col gap-2 p-3">
        <h3 class="truncate text-xs font-semibold text-slate-900 dark:text-white">{props.org.name}</h3>
        <Show when={props.org.description !== null && props.org.description.length > 0}>
          <p class="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{props.org.description}</p>
        </Show>
        <div class="mt-auto space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div class="flex items-center justify-between gap-2"><span>{t("org.card.members")}</span><span class={BADGE}>{props.memberCount}</span></div>
          <div class="flex items-center justify-between gap-2"><span>{t("org.card.projects")}</span><span class={BADGE}>{props.projectCount}</span></div>
          <div class="flex items-center justify-between gap-2"><span>ID</span><code class="truncate font-mono text-[10.5px] text-blue-700 dark:text-blue-300">{props.org.id.substring(0, 8)}…</code></div>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-800/30">
        <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300">{t("org.card.member")}</span>
        <span class="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Calendar size={12} aria-hidden="true" />{formatDateYear(props.org.createdAt)}</span>
      </div>
    </A>
  )
}
