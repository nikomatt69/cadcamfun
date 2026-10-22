/**
 * Workspace map for the homepage and the architecture docs.
 *
 * packages/nikcli-plugin publishes as @cadcamfunv2/cadcamfun-nikcli-plugin.
 * It is outside the @cadcamfun scope.
 */

export type StackChoice = {
  readonly concern: string
  readonly choice: string
}

export type WorkspaceUnit = {
  readonly name: string
  readonly path: string
  readonly role: string
  readonly owns: string
}

export const stack: readonly StackChoice[] = [
  {
    concern: "Runtime / package manager / test runner",
    choice: "Bun (bun install, bun test)",
  },
  {
    concern: "Application logic",
    choice: "Effect v4, pinned to 4.0.0-rc.112 workspace-wide",
  },
  {
    concern: "Persistence",
    choice: "Drizzle ORM + SQLite (bun:sqlite)",
  },
  {
    concern: "Desktop shell",
    choice: "Tauri v2 (Rust shell + webview; app logic runs in a Bun sidecar)",
  },
  {
    concern: "UI",
    choice: "SolidJS + Vite + TypeScript, Three.js for the viewport",
  },
  {
    concern: "AI",
    choice: "nikcli embedded host as base/provider; AI SDK v7 for direct calls",
  },
]

export const packages: readonly WorkspaceUnit[] = [
  {
    name: "@cadcamfun/db",
    path: "packages/db",
    role: "Persistence",
    owns: "Drizzle schema, migrations, and the Effect Database service. SQLite via bun:sqlite.",
  },
  {
    name: "@cadcamfun/core",
    path: "packages/core",
    role: "Domain",
    owns: "Pure CAD geometry and CAM / G-code. No database, network, or filesystem.",
  },
  {
    name: "@cadcamfun/api",
    path: "packages/api",
    role: "Contract",
    owns: "Schema-first HttpApi definitions and the domain schemas both sides share.",
  },
  {
    name: "@cadcamfun/ai",
    path: "packages/ai",
    role: "Assistant",
    owns: "nikcli embedded host and AI SDK v7, as Effect services.",
  },
  {
    name: "@cadcamfun/plugin-sdk",
    path: "packages/plugin-sdk",
    role: "Plugins",
    owns: "Public plugin API types and the host contract.",
  },
  {
    name: "@cadcamfun/vcs",
    path: "packages/vcs",
    role: "History",
    owns: "Git-compatible history: objects, branches, merge, diff, and GitHub sync.",
  },
  {
    name: "@cadcamfun/workflow",
    path: "packages/workflow",
    role: "Automation",
    owns: "Actions-style workflow schema, triggers, and runner.",
  },
  {
    name: "@cadcamfun/httpapi-codegen",
    path: "packages/httpapi-codegen",
    role: "Codegen",
    owns: "Generates clients from the HttpApi contract into packages/api/src/sdk and packages/api/src/client.",
  },
  {
    name: "@cadcamfunv2/cadcamfun-nikcli-plugin",
    path: "packages/nikcli-plugin",
    role: "Bridge",
    owns: "Exposes the running app’s CAD/CAM action catalogue to a standalone nikcli. The list is read from the app; the plugin does not keep a second copy.",
  },
]

export const apps: readonly WorkspaceUnit[] = [
  {
    name: "@cadcamfun/sidecar",
    path: "apps/sidecar",
    role: "Server",
    owns: "Bun Effect server: HttpApi handlers, services, repositories, plugin host, and wiring.",
  },
  {
    name: "@cadcamfun/desktop",
    path: "apps/desktop",
    role: "Window",
    owns: "SolidJS + Vite UI and the Tauri v2 Rust shell in src-tauri/.",
  },
  {
    name: "@cadcamfun/mobile",
    path: "apps/mobile",
    role: "Companion",
    owns: "Expo iOS companion. Thin client of a paired desktop. Native pairing socket in modules/companion-net.",
  },
]

export const dependencyNote =
  "Dependency direction has no cycles. core is imported by api, and api by the sidecar. The sidecar also imports db, ai, plugin-sdk, vcs, and workflow. The desktop imports the API client and core geometry at runtime. Mobile uses the API contract through its companion client. core and api do not import db."
