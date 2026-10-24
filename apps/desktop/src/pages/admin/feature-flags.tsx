/**
 * `/admin/feature-flags` — `.reference/src/pages/admin/feature-flags.tsx`.
 *
 * The legacy page gates on a hosted NextAuth session; the desktop build has no session, so
 * it goes straight to the heading plus the panel (which applies its own admin gate).
 */
import type { JSX } from "solid-js"
import { AdminFeatureFlagsPanel } from "../../features/admin/components/feature-flags-panel.tsx"
import { WorkspacePage } from "../../shared/components/WorkspacePage.tsx"
import { t } from "../../i18n/index.ts"

export default function Page(): JSX.Element {
  return (
    <WorkspacePage
      title={t("admin.ff.heading")}
      description={t("admin.ff.headingBody")}
    >
      <AdminFeatureFlagsPanel />
    </WorkspacePage>
  )
}
