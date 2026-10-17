/** Sidebar categories of the API area, in reading order. Every group slug appears exactly once. */
export const apiCategories: ReadonlyArray<{ readonly title: string; readonly slugs: readonly string[] }> = [
  { title: "Core", slugs: ["health", "system", "events", "key-value", "files"] },
  { title: "Design", slugs: ["projects", "workspace", "drawings", "components", "cad-exact", "library"] },
  { title: "Manufacturing", slugs: ["toolpaths", "project-toolpaths", "machining", "toolpath-history", "costs"] },
  { title: "Resources", slugs: ["materials", "material-storage", "tools", "tool-storage", "machines", "machine-storage"] },
  { title: "Extensions", slugs: ["ai", "history", "plugins", "mcp", "companion"] },
  { title: "Accounts", slugs: ["authentication", "users", "organizations", "notifications", "billing", "analytics", "application", "waitlist"] },
]

