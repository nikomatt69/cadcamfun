/**
 * Interference, clearance and bill of materials of an assembly model, wired to the exact checks of `assembly-analysis.ts`: the
 * leaf occurrences are placed (sub-assemblies expanded, the configuration applied) and handed over as parts. Screening is the
 * existing box test, so only pairs whose boxes meet reach an exact Boolean.
 */
import { assemblyClearance, assemblyInterference, billOfMaterials, type AssemblyPart, type BomRow, type Clearance, type InterferenceOptions, type InterferenceReport } from "../assembly-analysis.ts"
import { flattenAssembly, occurrenceBrep, type Assembly } from "./model.ts"
import type { Transform } from "../brep/index.ts"

/** The parts of an assembly in the world; `poses` (a solved pose) overrides the occurrences' own transforms. */
export const assemblyParts = (a: Assembly, configuration?: string, poses?: ReadonlyMap<string, Transform>): AssemblyPart[] =>
  flattenAssembly(a, configuration).map((f) => {
    const def = a.definitions.find((d) => d.id === f.definition)!
    const placed = poses?.get(f.path)
    return {
      id: f.path, name: def.name, brep: occurrenceBrep(a, placed === undefined ? f : { ...f, transform: placed }, configuration),
      ...(def.designation !== undefined ? { designation: def.designation } : {}),
      ...(def.material !== undefined ? { material: def.material } : {}),
      ...(def.density !== undefined ? { density: def.density } : {})
    }
  })

export const interferenceOf = (a: Assembly, options: InterferenceOptions & { readonly configuration?: string; readonly poses?: ReadonlyMap<string, Transform> } = {}): InterferenceReport =>
  assemblyInterference(assemblyParts(a, options.configuration, options.poses), options)

export const clearanceOf = (a: Assembly, within = 5, configuration?: string, poses?: ReadonlyMap<string, Transform>): ReadonlyArray<Clearance> =>
  assemblyClearance(assemblyParts(a, configuration, poses), within)

export const bomOf = (a: Assembly, configuration?: string): ReadonlyArray<BomRow> => billOfMaterials(assemblyParts(a, configuration))
