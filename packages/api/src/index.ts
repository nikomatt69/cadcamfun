import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { MaterialsGroup, MaterialsStorageGroup } from "./groups/materials.ts"
import { ToolsGroup, ToolsStorageGroup } from "./groups/tools.ts"
import { MachineConfigsGroup, MachineConfigsStorageGroup } from "./groups/machine-configs.ts"
import { DrawingsGroup } from "./groups/drawings.ts"
import { ComponentsGroup } from "./groups/components.ts"
import { ProjectToolpathsGroup, ToolpathExtrasGroup, ToolpathsGroup } from "./groups/toolpaths.ts"
import { ToolpathGeneratorGroup } from "./groups/toolpath-generator.ts"
import { CadExactGroup } from "./groups/cad-exact.ts"
import { LibraryGroup } from "./groups/library.ts"
import { ProjectsGroup } from "./projects.ts"
import { HealthGroup, SystemGroup } from "./system.ts"
import { ProductionCostsGroup } from "./groups/production-costs.ts"
import { PluginsGroup } from "./groups/plugins.ts"
import { FilesGroup } from "./groups/files.ts"
import { OrganizationsGroup } from "./groups/organizations.ts"
import { NotificationsGroup } from "./groups/notifications.ts"
import { AuthGroup } from "./groups/auth.ts"
import { WaitlistGroup } from "./groups/waitlist.ts"
import { AnalyticsGroup } from "./groups/analytics.ts"
import { UserGroup } from "./groups/user.ts"
import { AiGroup } from "./groups/ai.ts"
import { McpGroup } from "./groups/mcp.ts"
import { BillingGroup } from "./groups/billing.ts"
import { MiscGroup } from "./groups/misc.ts"
import { KvGroup } from "./groups/kv.ts"
import { VcsGroup } from "./groups/vcs.ts"
import { CompanionGroup } from "./groups/companion.ts"
import { EventsGroup } from "./groups/events.ts"

export * from "./errors.ts"
export * from "./ai-actions.ts"
export * from "./ai-action-results.ts"
export * from "./ai-action-inputs.ts"
export * from "./ai-inspection.ts"
export * from "./ai-cam.ts"
export * from "./ai-results.ts"
export * from "./cam-kernel.ts"
export * from "./cad-exact.ts"
export * from "./auth.ts"
export * from "./client.ts"
export * from "./projects.ts"
export * from "./groups/production-costs.ts"
export * from "./groups/plugins.ts"
export * from "./groups/files.ts"
export * from "./groups/organizations.ts"
export * from "./groups/notifications.ts"
export * from "./groups/auth.ts"
export * from "./groups/waitlist.ts"
export * from "./groups/analytics.ts"
export * from "./groups/user.ts"
export * from "./groups/ai.ts"
export * from "./groups/mcp.ts"
export * from "./groups/billing.ts"
export * from "./groups/misc.ts"
export * from "./groups/kv.ts"
export * from "./groups/vcs.ts"
export * from "./groups/companion.ts"
export * from "./groups/events.ts"
export * from "./groups/materials.ts"
export * from "./groups/tools.ts"
export * from "./groups/drawings.ts"
export * from "./groups/components.ts"
export * from "./groups/toolpaths.ts"
export * from "./groups/toolpath-generator.ts"
export * from "./groups/cad-exact.ts"
export * from "./groups/library.ts"
export * from "./component-data.ts"
export * from "./groups/machine-configs.ts"
export { HealthGroup, SystemGroup } from "./system.ts"

/** Root API contract shared by the sidecar (server) and the UI (typed client). Grows one group per legacy route family. */
export class Api extends HttpApi.make("cadcamfun")
  .add(HealthGroup)
  .add(SystemGroup.middleware(Authorization))
  .add(AuthGroup.middleware(Authorization))
  .add(WaitlistGroup.middleware(Authorization))
  .add(AnalyticsGroup.middleware(Authorization))
  .add(UserGroup.middleware(Authorization))
  .add(AiGroup.middleware(Authorization))
  .add(McpGroup.middleware(Authorization))
  .add(BillingGroup.middleware(Authorization))
  .add(MiscGroup.middleware(Authorization))
  .add(KvGroup.middleware(Authorization))
  .add(ProductionCostsGroup.middleware(Authorization))
  .add(PluginsGroup.middleware(Authorization))
  .add(FilesGroup.middleware(Authorization))
  .add(OrganizationsGroup.middleware(Authorization))
  .add(NotificationsGroup.middleware(Authorization))
  .add(ProjectsGroup.middleware(Authorization))
  .add(MaterialsGroup.middleware(Authorization))
  .add(MaterialsStorageGroup.middleware(Authorization))
  .add(ToolsGroup.middleware(Authorization))
  .add(ToolsStorageGroup.middleware(Authorization))
  .add(MachineConfigsGroup.middleware(Authorization))
  .add(MachineConfigsStorageGroup.middleware(Authorization))
  .add(DrawingsGroup.middleware(Authorization))
  .add(ComponentsGroup.middleware(Authorization))
  .add(ToolpathsGroup.middleware(Authorization))
  .add(ToolpathExtrasGroup.middleware(Authorization))
  .add(ToolpathGeneratorGroup.middleware(Authorization))
  .add(CadExactGroup.middleware(Authorization))
  .add(LibraryGroup.middleware(Authorization))
  .add(ProjectToolpathsGroup.middleware(Authorization))
  .add(VcsGroup.middleware(Authorization))
  .add(EventsGroup.middleware(Authorization))
  .add(CompanionGroup.middleware(Authorization))
  .annotateMerge(OpenApi.annotations({ title: "CADCAMFUN sidecar API" }))
{}

export * from "./ai-events.ts"
export * from "./cam-program.ts"
