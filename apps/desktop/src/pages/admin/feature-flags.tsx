/**
 * `/admin/feature-flags` — `.reference/src/pages/admin/feature-flags.tsx`.
 *
 * The legacy page gates on a hosted NextAuth session; the desktop build has no session, so
 * it goes straight to the heading plus the panel (which applies its own admin gate).
 */
import type { JSX } from "solid-js"
import { AdminFeatureFlagsPanel } from "../../components/admin/feature-flags-panel.tsx"
import { t } from "../../i18n/index.ts"

export default function Page(): JSX.Element {
  return (
    <section class="container mx-auto px-4 py-8">
      <h1 class="mb-8 text-3xl font-bold text-gray-900 dark:text-white">{t("admin.ff.heading")}</h1>
      <AdminFeatureFlagsPanel />
    </section>
  )
}
