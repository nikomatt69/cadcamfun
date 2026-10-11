export * from "./ai-config.ts"
export * from "./analytics.ts"
export * from "./cache.ts"
export * from "./credentials.ts"
export * from "./direct-model.ts"
export * as ProviderTransform from "./transform.ts"
export * from "./element-catalog.ts"
export * from "./errors.ts"
export * from "./events.ts"
export * from "./gcode-analysis.ts"
export * from "./models.ts"
export * from "./prompts/modes.ts"
export * from "./prompts/system.ts"
export * from "./prompts/workflows.ts"
export * from "./service.ts"
export * from "./tools/catalogue.ts"
export { makeNikCliRuntime, type HostToolSpec, type NikCliRuntime, type NikCliRuntimeOptions } from "./nikcli/runtime.ts"
export { readProjectMemoryFiles, invalidateProjectMemoryFiles, projectMemoryFile, projectHabitsFile, type ProjectMemoryFiles } from "./nikcli/project-files.ts"
export {
  abortHostSession,
  createHostSession,
  describeHostFailure,
  hostChatStream,
  replyHostPermission,
  sessionExists
} from "./nikcli/chat.ts"
export { flattenCatalog, hostCatalog, type HostModelInfo, type HostProviderInfo } from "./nikcli/catalog.ts"
export { defaultProviderSpecs } from "./nikcli/config.ts"
export * from "./attachments.ts"
export * from "./skills/user.ts"
export { CADCAM_SKILLS } from "./skills/index.ts"
export * from "./workspace-context.ts"
export * from "./heartbeat.ts"
export { readHostSessionState, type HostSessionState } from "./nikcli/chat.ts"
export {
  BACKGROUND_TOOL_IDS,
  backgroundToolIds,
  backgroundTools
} from "./nikcli/background-tools.ts"
export { BackgroundToolsRunner } from "./nikcli/background-tools-runner.ts"
export {
  BackgroundTaskManager,
  BackgroundTaskManagerError,
  MAX_BACKGROUND_TASKS,
  MAX_QUEUED_BACKGROUND_TASKS,
  type BackgroundTask,
  type BackgroundTaskInput,
  type BackgroundTaskManagerOptions,
  type BackgroundTaskOwner,
  type BackgroundTaskRunnerInput,
  type BackgroundTaskStatus
} from "./nikcli/background-tasks.ts"
export { backgroundToolSpecs, makeAiBackgroundLayer } from "./nikcli/background-layer.ts"

export * from "./parametric.ts"
export type { ParametricInput } from "./tools/cad_parametric.ts"
export * from "./vision.ts"
export * from "./web-search.ts"
export type { cadInspectInput } from "./tools/cad_inspect.ts"
export type { cadComponentRelationsInput } from "./tools/cad_component_relations.ts"

export * from "./project-memory.ts"
export * from "./project-context.ts"
