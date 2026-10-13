/**
 * CAM kernel (spec 29): one Interface from a revisioned manufacturing job to machine NC plus evidence about that NC.
 *
 *   materials     workpiece grades with their machinability data
 *   cutters       tool assemblies and the default library
 *   cutting-data  speeds, feeds, depths, load and deflection for a cutter in a material
 *   planner       CAD features -> ordered operations with their cutters
 *   execute       prepare / run: strategies, post, independent NC replay, stock lineage, claims and release level
 *   compat        the legacy generator settings in and out of the kernel's cutting data
 */
export * from "./materials.ts"
export * from "./cutters.ts"
export * from "./cutting-data.ts"
export * from "./contracts.ts"
export * from "./identity.ts"
export * from "./machines.ts"
export { planJob, inscribedRadius, type Plan, type PlanInput } from "./planner.ts"
export { prepareJob, executeJob, runJob, planOnly, KERNEL_ALGORITHM, type PreparedJob } from "./execute.ts"
export * from "./compat.ts"
