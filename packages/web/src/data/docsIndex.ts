import { guidePages } from "./guidePages"
import { apiGroups } from "./apiGroups"

/**
 * Retrieval text for every sidebar page. Titles come from the sidebar so the
 * index cannot rename a page the nav still shows.
 */
import { sidebarHrefs, sidebarTitle } from "./docsSidebar"

export type DocsIndexEntry = {
  readonly href: string
  readonly title: string
  readonly summary: string
  readonly keywords: readonly string[]
}

type DocsIndexCopy = {
  readonly summary: string
  readonly keywords: readonly string[]
}

const pageCopy: Record<string, DocsIndexCopy> = {
  ...Object.fromEntries(guidePages.map((guide) => [`/docs/guides/${guide.slug}`, { summary: guide.summary, keywords: guide.keywords }])),
  "/docs/configuration": {
    summary: "Runtime configuration owners, exact sidecar environment variables and defaults, AI offline/host behavior, credentials, billing, telemetry, browser connection, database path precedence, and diagnosis.",
    keywords: ["configuration", "environment", "CADCAMFUN_TOKEN", "CADCAMFUN_DATA_DIR", "CADCAMFUN_AI_OFFLINE", "STRIPE", "telemetry", "defaults"],
  },
  "/docs/documentation": {
    summary: "Operate the Astro documentation site, API contract snapshots, navigation/retrieval, Markdown export, Workers AI or nikcli assistant, rate limits, capability-protected guide artifacts, local Studio, and deployment checks.",
    keywords: ["documentation", "Astro", "Cloudflare", "Worker", "Studio", "R2", "KV", "docs assistant", "Markdown", "llm", "deploy"],
  },
  "/docs/guides/api-tour": {
    summary: "API requests with real captured handler responses from a disposable migrated database: public health, bearer rejection, project validation and creation, relation reads, JSON preference storage, and retry handling.",
    keywords: ["api walkthrough", "curl", "real responses", "projects", "key-value", "authorization", "400", "401", "404", "201", "integration", "example"],
  },
  ...Object.fromEntries(apiGroups.map((group) => [`/docs/api/${group.slug}`, {
    summary: `${group.summary} HTTP reference with methods, paths, authentication, request fields, response statuses, media types, and full schemas.`,
    keywords: ["http", "api reference", group.tag, group.slug, group.title.toLowerCase(), "parameters", "request", "response", "schema"],
  }])),
  "/docs": {
    summary: "Local desktop CAD/CAM: drawing, solid modelling, toolpaths, G-code, local persistence, history, AI, and companion access. Start development and understand application boundaries.",
    keywords: ["overview", "local-first", "monorepo", "g-code", "toolpaths", "offline", "cadcamfun"],
  },
  "/docs/architecture": {
    summary: "Tauri shell and SolidJS webview, loopback Bun sidecar, Effect service layers, SQLite lifecycle, HTTP authorization, companion gateway, and separate documentation deployment.",
    keywords: ["architecture", "dependency", "sidecar", "tauri", "core", "api", "boundaries", "layers"],
  },
  "/docs/stack": {
    summary: "Manifest versions and responsibilities for Bun, Effect 4.0.0-rc.112, Drizzle SQLite, Tauri, SolidJS, Three.js, nikcli, AI SDK, Expo, and Astro.",
    keywords: ["bun", "effect", "drizzle", "sqlite", "tauri", "solidjs", "three.js", "nikcli", "ai sdk", "rc.112", "expo", "astro"],
  },
  "/docs/conventions": {
    summary: "Strict TypeScript, millimetres and radians, post formatting, Effect services and lifetimes, schema errors, database queries, configuration, generated clients, and focused verification.",
    keywords: ["conventions", "effect", "typescript", "millimetres", "radians", "bun:test", "schema", "errors"],
  },
  "/docs/cad": {
    summary: "Core sketches, parametric feature history, B-rep topology, solid modelling, tessellation, drawing exchange, exact geometry evidence, and supported import/export boundaries.",
    keywords: ["cad", "geometry", "b-rep", "sketch", "step", "dxf", "svg", "entity tags", "history feature", "packages/core/src/cad", "drawing"],
  },
  "/docs/cam": {
    summary: "Operation generation, motion representation, verification, machine settings, registered generic Fanuc GRBL and Haas posts, and separate advanced G-code transformations.",
    keywords: ["cam", "g-code", "toolpath", "post", "generic", "fanuc", "grbl", "haas", "operations", "kernel", "namespaces", "packages/core/src/cam"],
  },
  "/docs/setups": {
    summary: "Machining work frames, indexing, portable CamProgramDocument settings, saved toolpaths, operation ordering, manufacture endpoint, and program integration limits.",
    keywords: ["setup", "indexing", "WorkFrame", "cam-program", "saved-program", "G54", "multiToolpathStore", "CamProgramDocument", "manufacture"],
  },
  "/docs/viewport": {
    summary: "Desktop 2D and 3D viewport engines, drawing tools, selection and snapping, geometry rendering, worker meshing, four-view layout, and display unit conversion.",
    keywords: ["viewport", "editor2d", "view3d", "ToolId", "TOOL_FACTORIES", "solidsFromProfiles", "apps/desktop/src/viewport", "worker"],
  },
  "/docs/database": {
    summary: "Database service, Drizzle tables, SQLite WAL and foreign keys, migration CLI path selection, upgrade planning, backups, and persistence access patterns.",
    keywords: ["database", "drizzle", "sqlite", "packages/db", "Database.layer", "userTable", "localKeyValueTable", "planUpgrade", "migrate"],
  },
  "/docs/api": {
    summary: "Complete HTTP reference: every declared endpoint grouped by resource, request fields, response and error schemas, authentication, OpenAPI download, generated clients, and verified request examples.",
    keywords: ["httpapi", "api", "endpoint ids", "Authorization", "HealthGroup", "codegen", "emitPromise", "generate:check", "packages/api"],
  },
  "/docs/sidecar": {
    summary: "Bun loopback server startup, readiness protocol, configuration, authorization, CORS, repositories and services, companion gateway, observability, and shutdown.",
    keywords: ["sidecar", "apps/sidecar", "ready", "CADCAMFUN_AI_HOST", "COMPANION_ROUTES", "repositories", "http", "AiLive"],
  },
  "/docs/desktop": {
    summary: "SolidJS workbench, feature and route structure, authenticated sidecar client, native Tauri commands, credential storage, menus, connection state, and desktop development.",
    keywords: ["desktop", "routes.tsx", "ActivityId", "get_sidecar_endpoint", "secret_get", "menu", "sidecar-status", "features"],
  },
  "/docs/mobile": {
    summary: "Expo companion setup, QR pairing, native pinned transport, secure credentials, project and history operations, assistant access, and desktop gateway limits.",
    keywords: ["mobile", "expo", "CompanionClient", "pairing", "CompanionNet", "fingerprint", "apps/mobile", "companion-net"],
  },
  "/docs/release": {
    summary: "Build phases, sidecar binaries, migration resources, native platform bundles, CI verification, release workflow, signing configuration, and updater behavior.",
    keywords: ["release", "ci", "updater", "scripts/build.ts", "ci.yml", "build-platforms.yml", "release.yml", "tauri", "signing"],
  },
  "/docs/ai": {
    summary: "Embedded nikcli and direct AI hosts, provider credentials, session and tool execution, application action catalogue, specialist integration, and standalone nikcli HTTP bridge.",
    keywords: ["ai", "nikcli", "action ids", "cad.describe", "CADCAMFUN_AI_HOST", "CadcamPlugin", "packages/ai", "nikcli-plugin"],
  },
  "/docs/plugins": {
    summary: "Plugin SDK manifests and capabilities, definePlugin, runtime host activation and limits, plugin context, registry HTTP routes, and external nikcli action integration.",
    keywords: ["plugins", "plugin-sdk", "definePlugin", "drawing:write", "PluginHost", "CALL_TIMEOUT_MS", "manifest", "ai:tool"],
  },
  "/docs/history": {
    summary: "Project snapshots, content-addressed objects, branches, diffs, merge, pull requests, GitHub transport, and sidecar persistence responsibilities.",
    keywords: ["vcs", "git", "history", "github", "ENTITY_DIRECTORIES", "hashObject", "restTransport", "packages/vcs", "snapshot"],
  },
  "/docs/workflows": {
    summary: "Workflow JSON schemas, triggers, dependency execution, project and CAM builtins, service-backed history notification and AI steps, run persistence, and execution limits.",
    keywords: ["workflow", "actions", "WorkflowSchema", "parseWorkflow", "project/validate", "vcs/commit", "ai/prompt", "packages/workflow", "cam/verify"],
  },
  "/docs/guides": {
    summary: "Practical development guides: first launch, local sidecar and frontend loops, companion setup, documentation checks, and contribution verification.",
    keywords: ["guides", "quickstart", "local development", "contributing", "install"],
  },
  "/docs/guides/quickstart": {
    summary: "Install workspace dependencies, start the real desktop and sidecar, run targeted checks, understand migration paths, and start the documentation or mobile development loops.",
    keywords: ["quickstart", "bun install", "bun test", "desktop:dev", "db:migrate", "generate:check", "expo run:ios", "bun src/main.ts"],
  },
  "/docs/guides/local-dev": {
    summary: "Run sidecar, Vite, Tauri and Expo independently, supply runtime configuration, select the correct database file, regenerate clients, and diagnose connection problems.",
    keywords: ["local development", "sidecar", "tauri", "webview", "sqlite", "db:migrate", "desktop dev", "expo start", "expo run:ios"],
  },
  "/docs/guides/contributing": {
    summary: "Contribution workflow organized around implementation boundaries: locate behavior, update contracts and clients, manage migrations, and choose relevant package and release checks.",
    keywords: ["contributing", "development workflow", "boundaries", "validation", "bun test packages apps", "build:sidecar", "tauri:dev", "expo"],
  },
  "/docs/packages": {
    summary: "All workspace libraries and apps, public exports, dependency roles, HTTP client generation, documentation assistant and Markdown routes, and local Studio operation.",
    keywords: ["packages", "workspace", "@cadcamfun/db", "@cadcamfun/core", "@cadcamfun/api", "@cadcamfun/httpapi-codegen", "packages/nikcli-plugin", "@nikoemme_/cadcamfun-nikcli-plugin", "web", "studio", "llm", "docs assistant"],
  },
  "/docs/source-map": {
    summary: "Implementation entry points for geometry, CAM posts, API groups, SQLite, sidecar layers, desktop viewport, native shell, mobile transport, AI, plugins, history, workflows, and documentation delivery.",
    keywords: ["source map", "folders", "packages/core", "apps/desktop", "apps/sidecar", "apps/mobile", "viewport", "packages/db", "packages/web"],
  },
}

export const docsIndex: readonly DocsIndexEntry[] = sidebarHrefs().flatMap((href) => {
  const page = pageCopy[href]
  const title = sidebarTitle(href)
  if (!page || !title) return []
  return [{ href, title, summary: page.summary, keywords: page.keywords }]
})

export function docsIndexGaps(): { missing: string[]; orphaned: string[] } {
  const live = sidebarHrefs()
  const liveSet = new Set(live)
  const indexed = new Set(docsIndex.map((entry) => entry.href))
  const missing = live.filter((href) => !indexed.has(href))
  const orphaned: string[] = []
  const seen = new Set<string>()
  const candidates = [
    ...docsIndex.map((entry) => entry.href).filter((href) => !liveSet.has(href)),
    ...Object.keys(pageCopy).filter((href) => !liveSet.has(href)),
  ]
  for (const href of candidates) {
    if (seen.has(href)) continue
    seen.add(href)
    orphaned.push(href)
  }
  return { missing, orphaned }
}
