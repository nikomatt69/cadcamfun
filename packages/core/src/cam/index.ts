/**
 * CAM core (WP2): the machine-neutral toolpath layer.
 *
 * Entities -> operations -> toolpath IR -> post-processor -> G-code text. An
 * operation turns drawing geometry into IR moves; a post turns a program into
 * dialect-specific text; nothing in between knows about G-code words.
 */
export * from "./ir.ts"
export * from "./program-evidence.ts"
export * from "./tool.ts"
export * from "./setup.ts"
export * from "./setup-plan.ts"
export * from "./indexing.ts"
export * from "./machine.ts"
export * from "./params.ts"
export * from "./path.ts"
export * from "./arc-fit.ts"
export * from "./geometry.ts"
export * from "./operations/index.ts"
export * from "./post/index.ts"
export * as testing from "./testing/index.ts"
export * as generator from "./generator/index.ts"
export * as cycles from "./cycles/index.ts"
export * as viewer from "./viewer/index.ts"
export * as verify from "./verify/index.ts"
export * as sim from "./sim/index.ts"
export * as model from "./model/index.ts"
export * as kernel from "./kernel/index.ts"
export * as program from "./program/index.ts"
export * as print from "./print/index.ts"
export * from "./tool-model.ts"
export * from "./operation-tools.ts"
export * from "./program-tools.ts"
