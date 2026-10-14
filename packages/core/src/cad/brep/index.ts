/**
 * Exact B-rep kernel (CADCAMFUN native, modelled on SMLib from NVIDIA usd-brep, Apache-2.0): NURBS and analytic
 * geometry, face/loop/edge-use/edge/vertex topology, primitives and sweeps, watertight tessellation, mass properties,
 * validation and STEP exchange. Everything is plain data and pure functions.
 */
export * from "./math.ts"
export * from "./nurbs.ts"
export * from "./geom.ts"
export * from "./topology.ts"
export * from "./primitives.ts"
export * from "./sweep.ts"
export * from "./cdt.ts"
export * from "./tessellate.ts"
export * from "./mass.ts"
export * from "./validate.ts"
export * from "./step.ts"
export * from "./classify.ts"
export * from "./intersect.ts"
export * from "./boolean.ts"
export * from "./drawing-edges.ts"
