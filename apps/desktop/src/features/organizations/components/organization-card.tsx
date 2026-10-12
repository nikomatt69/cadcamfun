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
import { CARD, CardBanner } from "../../../shared/components/WorkspacePage.tsx"

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
      <CardBanner icon={<Building size={28} aria-hidden="true" />} badge={t("org.card.active")} />
      <div class="flex flex-1 flex-col gap-2 p-4">
        <h3 class="text-base font-semibold text-gray-900 group-hover:text-[#007ACC] dark:text-white dark:group-hover:text-blue-300">{props.org.name}</h3>
        <Show when={props.org.description !== null && props.org.description.length > 0}>
          <p class="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{props.org.description}</p>
        </Show>
        <div class="mt-auto space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <div class="flex justify-between"><span>{t("org.card.members")}:</span><span class="rounded-full bg-purple-100/80 px-2 py-0.5 font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{props.memberCount}</span></div>
          <div class="flex justify-between"><span>{t("org.card.projects")}:</span><span class="rounded-full bg-purple-100/80 px-2 py-0.5 font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{props.projectCount}</span></div>
          <div class="flex justify-between"><span>ID:</span><code class="font-mono text-[#007ACC] dark:text-blue-400">{props.org.id.substring(0, 8)}...</code></div>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-gray-200/50 bg-gray-50/50 px-4 py-2.5 dark:border-gray-600/50 dark:bg-gray-700/30">
        <span class="text-xs font-medium text-blue-700 dark:text-blue-300">{t("org.card.member")}</span>
        <span class="flex items-center text-xs text-gray-500 dark:text-gray-400"><Calendar size={12} class="mr-1" aria-hidden="true" />{formatDateYear(props.org.createdAt)}</span>
      </div>
    </A>
  )
}
