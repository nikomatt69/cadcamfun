import { Api } from "@cadcamfun/api"
import { Database } from "@cadcamfun/db"
import { Layer } from "effect"
import { HttpMiddleware, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { AppConfigService } from "./config.ts"
import { AuthorizationLive } from "./http/authorization.ts"
import { HealthHandlers, SystemHandlers } from "./http/health.ts"
import { MaterialsHandlers } from "./http/materials.ts"
import { MaterialsStorageHandlers } from "./http/materials-storage.ts"
import { StorageService } from "./services/storage.ts"
import { MachineConfigsStorageHandlers } from "./http/machine-configs-storage.ts"
import { MachineConfigsHandlers } from "./http/machine-configs.ts"
import { MachineConfigRepo } from "./repos/machine-config-repo.ts"
import { DrawingsHandlers } from "./http/drawings.ts"
import { DrawingRepo } from "./repos/drawing-repo.ts"
import { ComponentsHandlers } from "./http/components.ts"
import { ComponentRepo } from "./repos/component-repo.ts"
import { NotificationService } from "./services/notifications.ts"
import { ProjectToolpathsHandlers, ToolpathsHandlers } from "./http/toolpaths.ts"
import { ToolpathGeneratorHandlers } from "./http/toolpath-generator.ts"
import { ToolpathRepo } from "./repos/toolpath-repo.ts"
import { LibraryHandlers } from "./http/library.ts"
import { LibraryRepo } from "./repos/library-repo.ts"
import { ToolsHandlers } from "./http/tools.ts"
import { ToolsStorageHandlers } from "./http/tools-storage.ts"
import { ToolRepo } from "./repos/tool-repo.ts"
import { ProjectsHandlers } from "./http/projects.ts"
import { MaterialRepo } from "./repos/material-repo.ts"
import { ProjectRepo } from "./repos/project-repo.ts"
import { LocalProfile } from "./services/local-profile.ts"
import { OrganizationsHandlers } from "./http/organizations.ts"
import { NotificationsHandlers } from "./http/notifications.ts"
import { ProductionCostsHandlers } from "./http/production-costs.ts"
import { ProductionCostRepo } from "./repos/production-cost-repo.ts"
import { OrganizationRepo } from "./repos/organization-repo.ts"
import { NotificationRepo } from "./repos/notification-repo.ts"
import { CostService } from "./services/costs.ts"
import { AnalyticsHandlers } from "./http/analytics.ts"
import { WaitlistHandlers } from "./http/waitlist.ts"
import { AuthHandlers } from "./http/auth.ts"
import { AuthRepo } from "./repos/auth-repo.ts"
import { AuthTokens } from "./services/auth-tokens.ts"
import { FilesHandlers } from "./http/files.ts"
import { FileRepo } from "./repos/file-repo.ts"
import { PluginsHandlers } from "./http/plugins.ts"
import { PluginRegistryRepo } from "./repos/plugin-registry-repo.ts"
import { McpHandlers } from "./http/mcp.ts"
import { McpRepo } from "./repos/mcp-repo.ts"
import { UserHandlers } from "./http/user.ts"
import { UserRepo } from "./repos/user-repo.ts"
import { AiHandlers } from "./http/ai.ts"
import { AiLive } from "./services/ai.ts"
import { BillingHandlers } from "./http/billing.ts"
import { BillingRepo } from "./repos/billing-repo.ts"
import { MiscHandlers } from "./http/misc.ts"
import { MiscRepo } from "./repos/misc-repo.ts"
import { KvHandlers } from "./http/kv.ts"
import { KvStore } from "./services/kv.ts"
import { VcsHandlers } from "./http/vcs.ts"
import { CompanionHandlers } from "./http/companion.ts"
import { Companion } from "./services/companion.ts"
import { ProjectVcsRepo } from "./repos/project-vcs-repo.ts"
import { ProjectVcs } from "./services/project-vcs.ts"
import { WorkflowRunner } from "./services/workflow-runner.ts"
import { AnalyticsRepo } from "./repos/analytics-repo.ts"

/** Every group handler; add new route families here as they are implemented. */
export const Handlers = Layer.mergeAll(HealthHandlers, SystemHandlers, ProjectsHandlers, MaterialsHandlers, MaterialsStorageHandlers, ToolsHandlers, ToolsStorageHandlers, MachineConfigsHandlers, MachineConfigsStorageHandlers, DrawingsHandlers, ComponentsHandlers, ToolpathsHandlers, ToolpathGeneratorHandlers, ProjectToolpathsHandlers, LibraryHandlers, OrganizationsHandlers, NotificationsHandlers, ProductionCostsHandlers, AnalyticsHandlers, WaitlistHandlers, AuthHandlers, FilesHandlers, PluginsHandlers, UserHandlers, AiHandlers, BillingHandlers, MiscHandlers, KvHandlers, McpHandlers, VcsHandlers, CompanionHandlers)

/** Git-style history, pull requests and workflow runs (spec 13). */
const VcsServices = Layer.mergeAll(ProjectVcs.layer, WorkflowRunner.layer()).pipe(Layer.provideMerge(ProjectVcsRepo.layer))

/** Repositories + services the handlers depend on (needs `Database`). */
const RepoServices = Layer.mergeAll(ProjectRepo.layer, MaterialRepo.layer, ToolRepo.layer, DrawingRepo.layer, ComponentRepo.layer, ToolpathRepo.layer, LibraryRepo.layer, NotificationService.layer, MachineConfigRepo.layer, StorageService.layer, LocalProfile.layer, ProductionCostRepo.layer, CostService.layer, OrganizationRepo.layer, NotificationRepo.layer, AnalyticsRepo.layer, AuthRepo.layer, AuthTokens.layer, FileRepo.layer, PluginRegistryRepo.layer, UserRepo.layer, BillingRepo.layer, MiscRepo.layer, KvStore.layer, McpRepo.layer, VcsServices, Companion.layer.pipe(Layer.provide(KvStore.layer)))

/** Repositories plus the AI layer (credentials, direct model, optional nikcli host, tool handlers). */
export const Services = AiLive.pipe(Layer.provideMerge(RepoServices))

/** HTTP routes for the whole API, with auth + services wired; still needs `Database` and `AppConfigService`. */
// Contract-only groups must not make the implemented server require absent handlers.
export class ServedApi extends HttpApi.make(Api.identifier).add(
  Api.groups.health, Api.groups.system, Api.groups.projects, Api.groups.materials, Api.groups.materialsStorage,
  Api.groups.tools, Api.groups.toolsStorage, Api.groups.machineConfigs, Api.groups.machineConfigsStorage,
  Api.groups.drawings, Api.groups.components, Api.groups.toolpaths, Api.groups.toolpathGenerator, Api.groups.projectToolpaths, Api.groups.library,
  Api.groups.organizations, Api.groups.notifications, Api.groups['production-costs'], Api.groups.analytics, Api.groups.waitlist, Api.groups.auth, Api.groups.files, Api.groups.plugins, Api.groups.user, Api.groups.ai, Api.groups.billing, Api.groups.misc, Api.groups.kv, Api.groups.mcp, Api.groups.vcs, Api.groups.companion
) {}

/**
 * Origins allowed to call the sidecar from a webview: the Tauri production origins per
 * platform plus any loopback origin (the Vite dev server picks its own port). A page on
 * another origin gets no CORS headers, and every route still needs the bearer token.
 */
export const isAllowedOrigin = (origin: string): boolean =>
  ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"].includes(origin) ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

export const ApiRoutes = HttpApiBuilder.layer(ServedApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide(HttpRouter.middleware(
    // No fixed header list: the preflight echoes what the client asks for. The Effect client adds
    // `traceparent`, and an allowlist would silently break every call from a webview.
    HttpMiddleware.cors({ allowedOrigins: isAllowedOrigin, maxAge: 600 }),
    { global: true }
  )),
  Layer.provide(Handlers),
  Layer.provide(AuthorizationLive),
  Layer.provide(Services)
)

export const DatabaseLive = Layer.unwrap(
  AppConfigService.useSync((c) =>
    Database.layer({
      path: `${c.dataDir}/cadcamfun.db`,
      ...(c.migrationsDir ? { migrationsFolder: c.migrationsDir } : {})
    })
  )
)
