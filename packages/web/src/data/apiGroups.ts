/** Reader-facing resource groups. The contract snapshot stays in api-reference.json. */
export type ApiGroupCopy = {
  readonly tag: string
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly guide: string
}

export const apiGroups: readonly ApiGroupCopy[] = [
  {
    "tag": "health",
    "slug": "health",
    "title": "Health",
    "summary": "Public process health probe with status and timestamp.",
    "guide": "/docs/sidecar"
  },
  {
    "tag": "system",
    "slug": "system",
    "title": "System",
    "summary": "Authenticated readiness and application version used by native clients.",
    "guide": "/docs/sidecar"
  },
  {
    "tag": "projects",
    "slug": "projects",
    "title": "Projects",
    "summary": "Create, list, read, update, and remove projects with owner and organization access checks.",
    "guide": "/docs/history"
  },
  {
    "tag": "workspace",
    "slug": "workspace",
    "title": "Workspace",
    "summary": "Read-only project drawings, components, toolpaths, library resources, and bounded previews for companion clients.",
    "guide": "/docs/mobile"
  },
  {
    "tag": "drawings",
    "slug": "drawings",
    "title": "Drawings",
    "summary": "Project drawings and their saved geometry, metadata, and update operations.",
    "guide": "/docs/cad"
  },
  {
    "tag": "components",
    "slug": "components",
    "title": "Components",
    "summary": "Reusable project components and their persisted design data.",
    "guide": "/docs/cad"
  },
  {
    "tag": "cadExact",
    "slug": "cad-exact",
    "title": "Exact CAD",
    "summary": "Analyze exact geometry, export STEP, and inspect assembly relationships from scene snapshots or saved drawings.",
    "guide": "/docs/cad"
  },
  {
    "tag": "toolpaths",
    "slug": "toolpaths",
    "title": "Toolpaths",
    "summary": "Saved machining programs, drawing associations, and validated portable manufacturing documents.",
    "guide": "/docs/setups"
  },
  {
    "tag": "projectToolpaths",
    "slug": "project-toolpaths",
    "title": "Project toolpaths",
    "summary": "Project-scoped toolpath listing and creation with endpoint-specific response envelopes.",
    "guide": "/docs/setups"
  },
  {
    "tag": "toolpathGenerator",
    "slug": "machining",
    "title": "Machining",
    "summary": "Native manufacture, settings-driven G-code generation, suggestions, parsing, and replay verification.",
    "guide": "/docs/cam"
  },
  {
    "tag": "toolpathExtras",
    "slug": "toolpath-history",
    "title": "Toolpath history",
    "summary": "Toolpath versions, restoration, library discovery, and threaded program comments.",
    "guide": "/docs/setups"
  },
  {
    "tag": "materials",
    "slug": "materials",
    "title": "Materials",
    "summary": "Material records, application machining properties, and resource access.",
    "guide": "/docs/cam"
  },
  {
    "tag": "materialsStorage",
    "slug": "material-storage",
    "title": "Material storage",
    "summary": "Material storage attachments and JSON import/export for library interchange.",
    "guide": "/docs/database"
  },
  {
    "tag": "tools",
    "slug": "tools",
    "title": "Tools",
    "summary": "Cutter records and dimensions used by application machining workflows.",
    "guide": "/docs/cam"
  },
  {
    "tag": "toolsStorage",
    "slug": "tool-storage",
    "title": "Tool storage",
    "summary": "Tool storage data and collection or per-tool import/export.",
    "guide": "/docs/database"
  },
  {
    "tag": "machineConfigs",
    "slug": "machines",
    "title": "Machines",
    "summary": "Machine configuration records, updates, removal, and cloning.",
    "guide": "/docs/cam"
  },
  {
    "tag": "machineConfigsStorage",
    "slug": "machine-storage",
    "title": "Machine storage",
    "summary": "Machine storage attachments and configuration import/export.",
    "guide": "/docs/database"
  },
  {
    "tag": "library",
    "slug": "library",
    "title": "Library",
    "summary": "Shared library records and component, material, and tool lookup collections.",
    "guide": "/docs/plugins"
  },
  {
    "tag": "production-costs",
    "slug": "costs",
    "title": "Production costs",
    "summary": "Estimates, calculation requests, material costs, operation costs, and tool-wear records.",
    "guide": "/docs/cam"
  },
  {
    "tag": "ai",
    "slug": "ai",
    "title": "AI sessions and actions",
    "summary": "Providers, credentials, conversations, streaming turns, action invocation, bridge tokens, skills, and session recovery.",
    "guide": "/docs/ai"
  },
  {
    "tag": "vcs",
    "slug": "history",
    "title": "History and workflows",
    "summary": "Project Git-compatible commits, branches, restores, reviews, GitHub mirroring, and workflow dispatch.",
    "guide": "/docs/history"
  },
  {
    "tag": "events",
    "slug": "events",
    "title": "Project events",
    "summary": "Project-scoped server-sent events for live clients.",
    "guide": "/docs/sidecar"
  },
  {
    "tag": "companion",
    "slug": "companion",
    "title": "Companion pairing",
    "summary": "Desktop gateway state, enable/disable, device pairing, and device revocation.",
    "guide": "/docs/mobile"
  },
  {
    "tag": "plugins",
    "slug": "plugins",
    "title": "Plugins",
    "summary": "Plugin registry, package installation, configuration, enable/disable, and served plugin assets.",
    "guide": "/docs/plugins"
  },
  {
    "tag": "mcp",
    "slug": "mcp",
    "title": "MCP configuration",
    "summary": "MCP connection configuration CRUD and server-info requests.",
    "guide": "/docs/ai"
  },
  {
    "tag": "files",
    "slug": "files",
    "title": "Files",
    "summary": "Upload and download operations with endpoint-specific payload and response encoding.",
    "guide": "/docs/sidecar"
  },
  {
    "tag": "kv",
    "slug": "key-value",
    "title": "Key-value storage",
    "summary": "JSON-compatible preference and context entries with prefix listing and per-key operations.",
    "guide": "/docs/database"
  },
  {
    "tag": "organizations",
    "slug": "organizations",
    "title": "Organizations",
    "summary": "Organization lists and managed organization records.",
    "guide": "/docs/api"
  },
  {
    "tag": "notifications",
    "slug": "notifications",
    "title": "Notifications",
    "summary": "Notification listing, read-state updates, deletion, and mark-all-read.",
    "guide": "/docs/api"
  },
  {
    "tag": "auth",
    "slug": "authentication",
    "title": "Authentication",
    "summary": "Account sign-in, sign-up, recovery, verification, magic links, session lookup, and passkey registration.",
    "guide": "/docs/api"
  },
  {
    "tag": "user",
    "slug": "users",
    "title": "Users",
    "summary": "Profiles, account resources, API keys, token records, passwords, and account removal.",
    "guide": "/docs/api"
  },
  {
    "tag": "billing",
    "slug": "billing",
    "title": "Billing",
    "summary": "Subscription information, Stripe checkout/portal integration, trial maintenance, and signed webhook ingestion.",
    "guide": "/docs/sidecar"
  },
  {
    "tag": "analytics",
    "slug": "analytics",
    "title": "Analytics",
    "summary": "Application metrics, recent activity, usage queries, and tracking requests.",
    "guide": "/docs/api"
  },
  {
    "tag": "misc",
    "slug": "application",
    "title": "Application services",
    "summary": "Desktop integration routes, tracked project operations, notifications, and push-subscription records.",
    "guide": "/docs/api"
  },
  {
    "tag": "waitlist",
    "slug": "waitlist",
    "title": "Waitlist",
    "summary": "Submit waitlist registration through the local application API.",
    "guide": "/docs/api"
  }
]
