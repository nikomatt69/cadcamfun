/**
 * The feature-flag catalogue and the admin override store
 * (`.reference/src/types/featureFlags.ts` + `.reference/src/lib/featureFlags/*`).
 *
 * `getAllFeatureFlags()` in the legacy service is just `Object.values(FeatureFlag)`, and the
 * admin overrides live in an in-memory map whose persistence hook was never implemented —
 * both are reproduced here so the admin panel lists exactly the flags the legacy panel did.
 */

/** `.reference/src/types/featureFlags.ts` `FeatureFlag`, in declaration order. */
export const FEATURE_FLAGS = [
  "ai_assistant", "ai_vision", "ai_autonomous", "ai_code_interpreter", "ai_advanced_prompts",
  "cad_basic", "cad_advanced", "cad_3d_modeling", "cad_assemblies", "cad_parametric", "cad_simulation",
  "cam_basic", "cam_advanced", "cam_multiaxis", "cam_toolpath_optimization",
  "export_step", "export_iges", "export_stl", "export_gcode", "export_pdf", "import_advanced",
  "real_time_collaboration", "team_management", "project_sharing", "comments_annotations",
  "cloud_storage", "unlimited_projects", "large_file_support",
  "custom_plugins", "third_party_integrations",
  "advanced_analytics", "usage_reports", "performance_monitoring",
  "priority_support", "dedicated_support", "training_resources",
  "api_access", "webhook_support", "custom_branding"
] as const

export type FeatureFlag = (typeof FEATURE_FLAGS)[number]

/** `.reference/src/lib/featureFlags/adminUtils.ts`. */
export const ADMIN_EMAILS = ["nicom.19@icloud.com", "nicola.mattioli.95@gmail.com"] as const

/** The sidecar's local administrator (see `apps/sidecar/src/http/analytics.ts`). */
export const LOCAL_ADMIN_EMAIL = "local@cadcamfun.local"

export const isAdminUser = (userEmail?: string | null): boolean => {
  if (!userEmail) return false
  const email = userEmail.toLowerCase()
  return (ADMIN_EMAILS as readonly string[]).includes(email) || email === LOCAL_ADMIN_EMAIL
}

export interface AdminFeatureOverride {
  readonly userId: string
  readonly featureFlag: FeatureFlag
  readonly enabled: boolean
  readonly reason?: string
}

const adminOverrides = new Map<string, AdminFeatureOverride[]>()

export const featureFlagService = {
  getAllFeatureFlags: (): readonly FeatureFlag[] => FEATURE_FLAGS,

  addAdminOverride(override: AdminFeatureOverride): void {
    const forUser = adminOverrides.get(override.userId) ?? []
    const existing = forUser.findIndex((entry) => entry.featureFlag === override.featureFlag)
    if (existing >= 0) forUser[existing] = override
    else forUser.push(override)
    adminOverrides.set(override.userId, forUser)
  },

  removeAdminOverride(userId: string, featureFlag: FeatureFlag): void {
    const forUser = adminOverrides.get(userId) ?? []
    const filtered = forUser.filter((entry) => entry.featureFlag !== featureFlag)
    if (filtered.length === 0) adminOverrides.delete(userId)
    else adminOverrides.set(userId, filtered)
  },

  listOverrides: (userId: string): readonly AdminFeatureOverride[] => adminOverrides.get(userId) ?? []
}
