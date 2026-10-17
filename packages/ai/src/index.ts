export * from "./ai-config.ts"
export * from "./analytics.ts"
export * from "./cache.ts"
export * from "./credentials.ts"
export { openCodeProviderSpecs } from "./nikcli/opencode.ts"
export * from "./direct-model.ts"
export * as ProviderTransform from "./transform.ts"
export * from "./element-catalog.ts"
export * from "./errors.ts"
export * from "./events.ts"
export * from "./gcode-analysis.ts"
export * from "./models.ts"
export * from "./prompts/modes.ts"
export * from "./prompts/contributed-modes.ts"
export * from "./prompts/system.ts"
export * from "./prompts/workflows.ts"
export * from "./service.ts"
export * from "./tools/catalogue.ts"
export { makeNikCliRuntime, type HostToolSpec, type NikCliRuntime, type NikCliRuntimeOptions } from "./nikcli/runtime.ts"
export { ToolRegistry, ToolRegistryError, makeToolRegistry, compareToolIds, lastWins, RESERVED_TOOL_IDS, type ToolRegistryShape, type ToolRegistrySources, type ToolHandle, type ToolCatalogueEntry } from "./tools/tool-registry.ts"
export { assembleContext, notesByRecency, CONTEXT_BUDGET, CONTEXT_KINDS, type ContextAssembly, type ContextKind, type ContextManifest, type ContextManifestEntry, type ContextRequest, type ContextSource, type OmissionReason } from "./context-assembly.ts"
export { readProjectMemoryFiles, invalidateProjectMemoryFiles, projectMemoryFile, projectHabitsFile, type ProjectMemoryFiles } from "./nikcli/project-files.ts"
export {
  abortHostSession,
  createHostSession,
  describeHostFailure,
  hostChatStream,
  replyHostPermission,
  sessionExists
} from "./nikcli/chat.ts"
export { automaticModel, flattenCatalog, hostCatalog, type HostModelInfo, type HostProviderInfo } from "./nikcli/catalog.ts"
export { defaultProviderSpecs } from "./nikcli/config.ts"
export { childAgent, adoptChildSession } from "./nikcli/agents.ts"
export { SUBAGENTS, SUBAGENT_IDS, type SubagentId, type SubagentSpec } from "./nikcli/agents.ts"
export { policyAllows, providerAllowed, toolAllowed, filterProviders, permittedTools, readPolicyFile, type PolicyStatement, type PolicyInput } from "./nikcli/policy.ts"
export { resolveLocale, type LocaleConfig, type ResolvedLocale } from "./nikcli/locale.ts"
export * from "./attachments.ts"
export * from "./skills/user.ts"
export { CADCAM_SKILLS, FUSION_EXAMPLE_HISTORY } from "./skills/index.ts"
export * from "./workspace-context.ts"
export * from "./heartbeat.ts"
export { readHostSessionState, type HostSessionState } from "./nikcli/chat.ts"
export {
  BACKGROUND_TOOL_IDS,
  backgroundToolContributions,
  backgroundToolIds
} from "./nikcli/background-tools.ts"
export { BackgroundToolsRunner } from "./nikcli/background-tools-runner.ts"
export {
  BackgroundTaskManager,
  BackgroundTaskManagerError,
  MAX_BACKGROUND_TASKS,
  MAX_QUEUED_BACKGROUND_TASKS,
  MAX_TASK_ATTEMPTS,
  TASK_RETENTION_MS,
  type BackgroundTask,
  type BackgroundTaskJournal,
  type BackgroundTaskRecovery,
  type BackgroundTaskInput,
  type BackgroundTaskManagerOptions,
  type BackgroundTaskOwner,
  type BackgroundTaskRunnerInput,
  type BackgroundTaskStatus
} from "./nikcli/background-tasks.ts"
export { backgroundToolContributionsFor, makeAiBackgroundLayer } from "./nikcli/background-layer.ts"

export * from "./parametric.ts"
// The handler contract is the one callers narrow on (`Extract<..., { action: "test" }>`). The action-parameter
// union carries no `action` discriminant — `defineActionTool` adds it as the tool discriminator — so exporting it
// here would only invite callers to narrow a union on a key it does not have.
export type { ParametricHandlerInput } from "./actions/parametric.ts"
export * from "./vision.ts"
export * from "./web-search.ts"
export type { CadInspectionInput, CadComponentRelationsInput } from "./actions/cad.ts"
export type { SetupCandidate, MachiningPlanInput } from "./actions/cam.ts"

export * from "./project-memory.ts"
export * from "./project-context.ts"
export { describeBridge, bridgeAdmission, bridgeAllowed, scopeBridge, BRIDGE_EXCLUDED_TOOLS, type BridgeTool, type BridgeAction, type BridgeMode, type BridgeAdmission } from "./actions/bridge.ts"
export { definePluginTool, pluginToolId, pluginParameters, MAX_PLUGIN_SCHEMA_CHARS, type PluginToolListing } from "./tools/plugin-tool.ts"
export { hostPatchesPlugin, patchHostSource, applyHostPatches, HostPatchError, HOST_PATCHES, MEDIA_RULE_MARKER, STEP_INSTRUCTIONS_MARKER, hostPatchesApplied, hostPatchReport } from "./nikcli/host-patches.ts"
export { acceptPart, type AcceptanceCheck, type AcceptanceReport, type CheckResult } from "./acceptance.ts"
export { KERNEL_JOB_DEADLINE_MS, KernelJobError, kernelWorkerUrl, runKernelJob, runKernelJobInline } from "./kernel-job.ts"
export type { KernelJobName, KernelJobs } from "./kernel-jobs.ts"

export { MOD_TOOL_IDS, modToolContributions, modToolIds } from "./nikcli/mod-tools.ts"
export { modSpecs, readModIndex, saveMod, setModEnabled, removeMod, type ModRecord } from "./nikcli/mods.ts"
export { isolatedPaths } from "./nikcli/isolation.ts"
