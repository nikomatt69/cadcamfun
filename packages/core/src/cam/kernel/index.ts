/**
 * CAM kernel (spec 29): one Interface from a revisioned manufacturing job to machine NC plus evidence about that NC.
 *
 *   materials     workpiece grades with their machinability data
 *   cutters       tool assemblies and the default library
 *   cutting-data  speeds, feeds, depths, load and deflection for a cutter in a material
 *   planner       CAD features -> ordered operations with their cutters
 *   execute       prepare / run: strategies, post, independent NC replay, stock lineage, claims and release level
 *   compat        the legacy generator settings in and out of the kernel's cutting data
 *   schema        Effect Schemas of the caller-supplied cutters and operations (HTTP, assistant)
 *   kinematics    the trunnion table (AC / BC): forward, inverse candidates with branch and C unwrapped, and the cheapest path
 *   assembly      the 3D tool assembly (cutting zone, shank, holder) as a profile and its solid of revolution
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
export * from "./assembly.ts"
export { CutterSchema, OperationSpecSchema } from "./schema.ts"
export { jobOfSnapshot, type KernelSnapshot } from "./snapshot.ts"
export { candidatesFor, planTable, forward, toolAxisInMachine, unwrapC, travel, type Candidate, type PlannedPosition, type TableKinematic, type TablePlan } from "./kinematics.ts"
