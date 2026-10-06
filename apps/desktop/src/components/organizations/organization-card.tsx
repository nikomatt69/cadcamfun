/**
 * `OrganizationCard` — port of `.reference/src/components/organizations/OrganizationCard.tsx`.
 *
 * The legacy card asks `useOrganizationStats` for the member / project counters with a
 * second request; the v6 list endpoint already answers `userCount` and `projectCount`, so
 * the counters arrive with the card and the pulse skeleton is gone with them.
 *
 * The footer badge keeps the legacy `org.id === "ADMIN" ? "Admin" : "Member"` outcome:
 * it compares the organization id with a role name, so it always renders the blue
 * "Member" pill. Rewriting it to `org.role` would show something the legacy page never
 * showed, so the constant result is kept and commented instead.
 */
import type { JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Building, Calendar, Folder, Star, Users } from "lucide-solid"
import { t } from "../../i18n/index.ts"

/** framer's page/card easing, carried over from the legacy `Variants`. */
const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1]
/** The card spring (stiffness 300, damping 25) approximated with Motion One's tween. */
const CARD_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const HOVER_SHADOW = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"

export interface OrganizationCardOrg {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly createdAt: string
}

export interface OrganizationCardProps {
  readonly org: OrganizationCardOrg
  readonly index: number
  readonly memberCount: number
  readonly projectCount: number
}

const formatDateYear = (dateString: string): string => {
  const parsed = Date.parse(dateString)
  return Number.isNaN(parsed) ? "" : String(new Date(parsed).getFullYear())
}

export function OrganizationCard(props: OrganizationCardProps): JSX.Element {
  return (
    <Motion.div
      class="group"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2 + props.index * 0.1, easing: CARD_EASE }}
      hover={{ y: -8, scale: 1.02, boxShadow: HOVER_SHADOW, transition: { duration: 0.3, easing: CARD_EASE } }}
      press={{ scale: 0.98, transition: { duration: 0.15 } }}
    >
      <A href={`/organizations/${encodeURIComponent(props.org.id)}`} class="block">
        <div class="overflow-hidden cursor-pointer bg-white/70 shadow-lg backdrop-blur-xl rounded-2xl border border-gray-200/50 transition-all duration-300 hover:border-blue-300 dark:bg-gray-800/70 dark:border-gray-700/50 dark:hover:border-blue-600">
          {/* Organization Header */}
          <div class="relative flex h-20 items-center justify-center bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30">
            <Motion.div
              class="rounded-xl bg-white/20 p-3 backdrop-blur-sm dark:bg-white/10"
              hover={{ scale: 1.1, rotate: 5, transition: { duration: 0.3, easing: CARD_EASE } }}
            >
              <Building size={28} class="text-blue-600 dark:text-blue-400" />
            </Motion.div>

            {/* Status Badge */}
            <div class="absolute right-3 top-3">
              <div class="flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <div class="mr-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                {t("org.card.active")}
              </div>
            </div>
          </div>

          {/* Organization Content */}
          <div class="p-6">
            <h3 class="mb-2 text-lg font-semibold text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
              {props.org.name}
            </h3>

            {props.org.description !== null && props.org.description.length > 0 && (
              <p class="mb-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                {props.org.description}
              </p>
            )}

            {/* Organization Statistics */}
            <div class="mb-4 space-y-2">
              <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center">
                  <Users size={14} class="mr-1" />
                  <span>{t("org.card.members")}</span>
                </div>
                <span class="font-medium text-gray-900 dark:text-white">{props.memberCount}</span>
              </div>
              <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center">
                  <Folder size={14} class="mr-1" />
                  <span>{t("org.card.projects")}</span>
                </div>
                <span class="font-medium text-gray-900 dark:text-white">{props.projectCount}</span>
              </div>
            </div>
          </div>

          {/* Organization Footer */}
          <div class="flex items-center justify-between border-t border-gray-200/50 bg-gray-50/50 px-6 py-4 dark:border-gray-600/50 dark:bg-gray-700/30">
            <Motion.span
              class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              hover={{ scale: 1.05, transition: { duration: 0.2 } }}
            >
              <Star size={12} class="mr-1" />
              {/* Legacy renders `org.id === "ADMIN" ? "Admin" : "Member"` — the id never
                  equals a role name, so the pill is always the blue "Member" one. */}
              {t("org.card.member")}
            </Motion.span>

            <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Calendar size={12} class="mr-1" />
              <span>{formatDateYear(props.org.createdAt)}</span>
            </div>
          </div>
        </div>
      </A>
    </Motion.div>
  )
}
