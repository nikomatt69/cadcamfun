/** UI names mapped to native Nikcli agent modes and permission rules. */
export type PermissionMode = "auto" | "ask" | "approve"
export const hostAgentWithPermissions = (agent: string, mode: PermissionMode = "approve"): string => mode === "approve" ? agent : `${agent}-${mode}`
export const inheritedPermissionMode = (agent?: string): PermissionMode => agent?.endsWith("-auto") ? "auto" : agent?.endsWith("-ask") ? "ask" : "approve"
export const permissionAgents = (agents: Record<string, Record<string, unknown>>, registered: ReadonlyArray<string>): Record<string, Record<string, unknown>> => {
  const result = { ...agents }
  for (const [name, spec] of Object.entries(agents)) for (const mode of ["auto", "ask"] as const) {
    const permissions = { ...(spec["permission"] as Record<string, string>) }
    for (const id of registered) if (permissions[id] === "allow") permissions[id] = "ask"
    result[hostAgentWithPermissions(name, mode)] = { ...spec, permission_mode: mode === "auto" ? "auto" : "default", permission: permissions }
  }
  return result
}
