import type { OrganizationDetails, OrganizationRole, OrganizationSummary } from "./client"

/** Pure organization-list logic (same search and role rules as the desktop screens). */

export const filterOrganizations = (rows: readonly OrganizationSummary[], search: string): OrganizationSummary[] => {
  const needle = search.trim().toLowerCase()
  return rows.filter((org) => needle === "" || `${org.name} ${org.description ?? ""}`.toLowerCase().includes(needle))
}

/** Settings (rename/delete) are ADMIN-only; updates need ADMIN or MANAGER, as the sidecar enforces. */
export const canUpdateOrganization = (role: OrganizationRole): boolean => role === "ADMIN" || role === "MANAGER"
export const canDeleteOrganization = (role: OrganizationRole): boolean => role === "ADMIN"

export const organizationRoleOf = (details: OrganizationDetails): OrganizationRole => details.userRole
