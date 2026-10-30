/**
 * Multi-operation setups (spec 14): operations with their tools, grouped into programs with tool changes and emitted once by the post.
 *
 *   op        an operation: elements, settings, one tool
 *   setup     the setup (stock, post, grouping, operations in machining order) and its validation
 *   tooltable carousel pockets derived from the operations
 *   plan      which operations form which program, with the cost of each grouping (pure, no geometry)
 *   programs  each operation through the generator, one `Program`, one emit per program
 */
export * from "./op.ts"
export * from "./setup.ts"
export * from "./tooltable.ts"
export * from "./plan.ts"
export * from "./programs.ts"
