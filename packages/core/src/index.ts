/**
 * Public surface of `@cadcamfun/core`.
 *
 * `cad` is exported flat (historic) and as a namespace; `cam` only as a namespace,
 * because both layers define generic names (`Move`, `Path`, ...) that must not collide.
 */
export * from "./cad/index.ts"
export * as cad from "./cad/index.ts"
export * as cam from "./cam/index.ts"
export * as drawing from "./drawing/index.ts"
