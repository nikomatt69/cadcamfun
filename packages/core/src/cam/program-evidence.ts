import type { Program } from "./ir.ts"

/** Exact tool/move evidence, independent of program and toolpath display labels. */
export const programGeometryText = (program: Program): string => JSON.stringify(program.toolpaths.map((path) => ({ toolId: path.toolId, moves: path.moves })))
