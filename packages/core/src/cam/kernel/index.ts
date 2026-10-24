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
 *   head          the tilting head (B about Y): the tool axis and tip for a tilt, and the tilt that reaches a direction
 *   assembly      the 3D tool assembly (cutting zone, shank, holder) as a profile and its solid of revolution
 *   collision     the continuous check of a joint move: tool probes against the table and the part, certified clear / collision
 *   motion        simultaneous five-axis: locations -> table poses, each move split into blocks and checked for collision
 *   stock         volumetric stock as voxels: sure / possible removal by the cutter's sampled sweep, remaining-volume bracket
 *   machine-clearance  holder and shank against the table over every NC move (certified; rotary moves reported, not passed)
 *   convex        exact distance between convex hulls (GJK), and the prism that bounds a cylinder with flat ends
 */
export * from "./materials.ts"
export * from "./cutters.ts"
export * from "./cutting-data.ts"
export * from "./contracts.ts"
export * from "./identity.ts"
export * from "./machines.ts"
export * from "./machine-config.ts"
export * from "./machine-profile.ts"
export { planJob, inscribedRadius, type Plan, type PlanInput } from "./planner.ts"
export { prepareJob, executeJob, runJob, planOnly, KERNEL_ALGORITHM, type PreparedJob, type PrepareOptions, type RunOptions, type KernelProgress } from "./execute.ts"
export * from "./compat.ts"
export * from "./assembly.ts"
export { SETUP_ORIENTATIONS, setupTransform, type SetupOrientation } from "../setup.ts"
export { CutterSchema, OperationSpecSchema, PrintRequirementSchema, SetupOrientationSchema } from "./schema.ts"
export { runPrintJob, planPrintJob, printSettingsOf, PRINT_ALGORITHM } from "./print.ts"
export { jobOfSnapshot, type KernelSnapshot } from "./snapshot.ts"
export { headAxis, headFor, headTip, type HeadKinematic, type HeadSolution } from "./head.ts"
export { candidatesFor, planTable, forward, toolAxisInMachine, unwrapC, travel, type Candidate, type PlannedPosition, type TableKinematic, type TablePlan } from "./kinematics.ts"
export { checkMotion, cylinderSolid, boxSolid, headScene, trunnionScene, tableBox, linearScene, type Capsule, type Clearance, type MotionCheck, type Pose, type Scene, type Solid, type TableEnvelope } from "./collision.ts"
export { planSimultaneous, type CutterLocation, type MotionSegment, type PartEnvelope, type SimultaneousInput, type SimultaneousPlan } from "./motion.ts"
export { voxelStock, removeTipPath, remainingVolume, carryHeightField, type VoxelStock } from "./stock.ts"
export { planTurning, type TurnPoint, type TurnStock, type TurningJob, type TurnPass, type TurningPlan } from "./turning.ts"
export { planBoring, type BoringJob, type BorePass, type BoringPlan } from "./turning.ts"
export { checkNcClearance, ARC_SAGITTA, type ClearanceFinding, type ClearanceResult, type TableGeometry } from "./machine-clearance.ts"
export { hullDistance, cylinderPrism, boxVertices, type HullDistance } from "./convex.ts"
