/** The stock simulation: the material as the program removes it (spec 32 §4.5). */
export * from "./stock-sim.ts"
export * from "./simulation.ts"
export * from "./cutters.ts"
export * from "./voxel-sim.ts"
export * from "./deviation-colors.ts"
/** The comparison of the simulated stock with the part: the simulation's `deviation` returns it and `deviationColors` takes it. */
export type { DeviationResult } from "../verify/deviation.ts"
