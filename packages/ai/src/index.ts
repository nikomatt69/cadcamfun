export * from "./ai-config.ts"
export * from "./credentials.ts"
export * from "./direct-model.ts"
export * from "./errors.ts"
export * from "./events.ts"
export * from "./gcode-analysis.ts"
export * from "./models.ts"
export * from "./prompts/system.ts"
export * from "./service.ts"
export * from "./tools/catalogue.ts"
export { makeNikCliRuntime, type HostToolSpec, type NikCliRuntime, type NikCliRuntimeOptions } from "./nikcli/runtime.ts"
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
