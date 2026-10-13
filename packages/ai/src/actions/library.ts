/**
 * `library` and `parts` and `library_edit` — the user's own reusable data: saved components, materials, cutters and
 * machine configurations. Reading is separated from writing because the host's permissions are keyed by tool id:
 * a specialist that may look up the shop's aluminium must not be able to delete a cutter from it.
 *
 * The catalogue owns the identity, the effect and the validation of every one of these actions; the sidecar
 * contributes the implementation (it is the only thing that can reach the repositories). Nothing declares them twice.
 */
import { z } from "zod"
import { contributedAction, defineAction, type ActionSpec } from "./action.ts"

const point3 = z.object({ x: z.number(), y: z.number(), z: z.number() })
const transform = z.object({
  move: point3.optional(),
  rotate: z.object({ axis: z.enum(["x", "y", "z"]), degrees: z.number(), about: point3.optional() }).optional(),
  scale: z.object({ factor: z.number(), about: point3.optional() }).optional()
}).optional()

const property = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

export const LIBRARY_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({ id: "library.component_list", kind: "read", replaces: "cad_component_list", contribution: "library.component_list", parameters: z.object({}) }),
  contributedAction({ id: "library.lookup_component", kind: "read", replaces: "lib_lookup_component", contribution: "library.lookup_component", parameters: z.object({ query: z.string().default("") }) }),
  defineAction({
    id: "library.lookup_material", kind: "read", replaces: "lib_lookup_material",
    parameters: z.object({ query: z.string() }),
    run: ({ query }, { handlers }) => handlers.lookupMaterial(query)
  }),
  defineAction({
    id: "library.lookup_tool", kind: "read", replaces: "lib_lookup_tool",
    parameters: z.object({ query: z.string() }),
    run: ({ query }, { handlers }) => handlers.lookupTool(query)
  }),
  contributedAction({ id: "library.lookup_machine_config", kind: "read", replaces: "lib_lookup_machine_config", contribution: "library.lookup_machine_config", parameters: z.object({ query: z.string().default("") }) })
]

export const PARTS_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({
    id: "parts.save", kind: "write", replaces: "cad_component_save", contribution: "parts.save",
    parameters: z.object({ ids: z.array(z.string().min(1)).min(1), name: z.string().min(1) })
  }),
  contributedAction({
    id: "parts.insert", kind: "write", replaces: "cad_component_insert", contribution: "parts.insert",
    parameters: z.object({ componentId: z.string().min(1), transform })
  }),
  contributedAction({
    // Removing a saved part is the destructive action of the group: the whole tool is registered as `ask`.
    id: "parts.delete", kind: "destructive", replaces: "cad_component_delete", contribution: "parts.delete",
    parameters: z.object({ componentId: z.string().min(1), confirm: z.literal(true) })
  })
]

export const LIBRARY_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({
    id: "library_edit.upsert_material", kind: "write", replaces: "lib_upsert_material", contribution: "library_edit.upsert_material",
    parameters: z.object({
      id: z.string().optional(), name: z.string().min(1), description: z.string().optional(),
      properties: property.default({}), isPublic: z.boolean().default(false)
    })
  }),
  contributedAction({
    id: "library_edit.upsert_tool", kind: "write", replaces: "lib_upsert_tool", contribution: "library_edit.upsert_tool",
    parameters: z.object({
      id: z.string().optional(), name: z.string().min(1), type: z.string(), diameter: z.number().positive(), material: z.string(),
      numberOfFlutes: z.number().int().positive().optional(), maxRPM: z.number().int().positive().optional(), coolantType: z.string().optional(),
      cuttingLength: z.number().positive().optional(), totalLength: z.number().positive().optional(), shankDiameter: z.number().positive().optional(),
      notes: z.string().optional(), isPublic: z.boolean().default(false)
    })
  }),
  contributedAction({
    id: "library_edit.upsert_machine_config", kind: "write", replaces: "lib_upsert_machine_config", contribution: "library_edit.upsert_machine_config",
    parameters: z.object({
      id: z.string().optional(), name: z.string().min(1), kind: z.enum(["mill", "lathe", "3Dprinter"]),
      kinematics: z.record(z.string(), z.object({ min: z.number(), max: z.number() })).default({}),
      postProcessor: z.string(), workOffsets: z.array(z.string()).default(["G54", "G55", "G56", "G57", "G58", "G59"]),
      probing: z.record(z.string(), z.unknown()).optional(), maxRPM: z.number().int().positive().optional(), maxFeed: z.number().positive().optional(),
      isPublic: z.boolean().default(false)
    })
  }),
  contributedAction({
    id: "library_edit.set_default", kind: "write", replaces: "lib_set_default", contribution: "library_edit.set_default",
    parameters: z.object({ materialId: z.string().optional(), toolId: z.string().optional(), machineConfigId: z.string().optional() })
  }),
  contributedAction({
    // Removing a library row cannot be undone from the assistant's side.
    id: "library_edit.delete", kind: "destructive", replaces: "lib_delete", contribution: "library_edit.delete",
    parameters: z.object({ kind: z.enum(["material", "tool", "machine_config"]), id: z.string().min(1), confirm: z.literal(true) })
  })
]

export { property as libraryPropertySchema, point3 as libraryPoint3, transform as libraryTransformSchema }