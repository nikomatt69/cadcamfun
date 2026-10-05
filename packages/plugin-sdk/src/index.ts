/**
 * `@cadcamfun/plugin-sdk` — the public, versioned surface plugin authors import.
 *
 * Dependency-light on purpose: it pulls in `@cadcamfun/core` for the geometry and
 * toolpath types a plugin reasons about, and nothing else. There is no host code
 * here; the sidecar owns the sandbox, the RPC and the capability checks.
 */
export * from "./capability.ts"
export * from "./manifest.ts"
export * from "./context.ts"
export * from "./plugin.ts"
export * from "./test-host.ts"
