/**
 * Touch probing, work offsets and in-process inspection (spec 73).
 *
 *   work-offset  offset references, the table, where each control keeps an offset, the update policy
 *   device       the spindle probe, the tool setter, what the control offers (`KernelProbing`), planning settings
 *   types        cycles, actions, characteristics, verdicts, the simulated outcome
 *   schema       the Effect Schemas (degrees on the wire, radians in the core)
 *   transform    a cycle moved with its operation
 */
export * from "../work-offset.ts"
export * from "./device.ts"
export * from "./types.ts"
export * from "./schema.ts"
export * from "./transform.ts"
export { settingsFromMachine, kernelProbingOfProfile, probeDeviceOfProfile, workOffsetTableOf, withWorkOffsetTable, stylusDiameterOf } from "../kernel/machine-probing.ts"
export * from "./fit.ts"
