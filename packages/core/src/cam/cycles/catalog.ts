/**
 * Which post the Cycles tab is talking to, and which of the legacy templates that post can insert (spec 69).
 * Fanuc, Haas, Mazak, LinuxCNC, Okuma and the generic ISO post insert the Fanuc blocks: they are EIA canned cycles
 * or expanded G0/G1. Heidenhain inserts the Klartext blocks. Siemens inserts its own cycles for six templates.
 * GRBL inserts nothing.
 */
import { familyOf } from "../post/macro-syntax.ts"
import { SIEMENS_CYCLE_IDS, siemensCycle } from "./siemens.ts"
import { emitTemplate, findCycle, templatesFor, type CycleTemplate, type CycleValues, type TemplateDialect } from "./templates.ts"

export type CycleController = TemplateDialect | "haas" | "mazak" | "okuma" | "siemens" | "linuxcnc" | "generic" | "grbl"

export interface CycleSupport {
  readonly cycles: boolean
  readonly macros: boolean
  /** Why a list is short or empty, when the reason is not obvious from the list itself. */
  readonly note?: string
}

export const CONTROLLERS: ReadonlyArray<{ readonly id: CycleController; readonly name: string }> = [
  { id: "fanuc", name: "Fanuc" },
  { id: "haas", name: "Haas" },
  { id: "mazak", name: "Mazak" },
  { id: "okuma", name: "Okuma" },
  { id: "siemens", name: "Siemens" },
  { id: "heidenhain", name: "Heidenhain" },
  { id: "linuxcnc", name: "LinuxCNC" },
  { id: "generic", name: "Generic ISO" }
]

const ISO: ReadonlyArray<CycleController> = ["fanuc", "haas", "mazak", "okuma", "linuxcnc", "generic"]

const isController = (id: string): id is CycleController =>
  id === "fanuc" || id === "haas" || id === "mazak" || id === "okuma" || id === "siemens" || id === "heidenhain" || id === "linuxcnc" || id === "generic" || id === "grbl"

/** The cycles-tab controller of a post id. An unknown post uses the generic ISO dialect. */
export const controllerOfPost = (postId: string): CycleController => (isController(postId) ? postId : "generic")

export const cycleSupport = (controller: CycleController): CycleSupport => {
  if (controller === "grbl" || familyOf(controller) === "none") {
    return { cycles: false, macros: false, note: "GRBL has no variables, macros or fixed cycles." }
  }
  if (controller === "siemens") {
    return {
      cycles: true, macros: true,
      note: "Siemens writes CYCLE81, CYCLE83, CYCLE84, CYCLE85, POCKET3 and SLOT1. The other templates stay on the ISO posts."
    }
  }
  return { cycles: true, macros: true }
}

const siemensTemplates = (): ReadonlyArray<CycleTemplate> =>
  SIEMENS_CYCLE_IDS.map((id) => findCycle(id)).filter((cycle): cycle is CycleTemplate => cycle !== undefined)

/** Templates the tab lists for `controller`. */
export const availableCycles = (controller: CycleController): ReadonlyArray<CycleTemplate> => {
  if (!cycleSupport(controller).cycles) return []
  if (controller === "heidenhain") return templatesFor("heidenhain")
  if (controller === "siemens") return siemensTemplates()
  if (ISO.includes(controller)) return templatesFor("fanuc")
  return []
}

const dialectOf = (controller: CycleController): TemplateDialect | undefined => {
  if (controller === "heidenhain") return "heidenhain"
  if (ISO.includes(controller)) return "fanuc"
  return undefined
}

/**
 * The block inserted for `cycle` on `controller`. ISO-family posts receive the Fanuc block. Siemens receives its
 * native cycle, or a refusal naming the template when that template has none.
 */
export const generateCycleCode = (cycle: CycleTemplate, values: CycleValues, controller: CycleController): string => {
  if (controller === "siemens") return siemensCycle(cycle, values)
  const dialect = dialectOf(controller)
  if (dialect === undefined) throw new RangeError(`${controller} has no fixed cycles`)
  if (!cycle.controllerTypes.includes(dialect)) throw new RangeError(`${cycle.id} is not written for ${controller}`)
  return emitTemplate(cycle, values, dialect)
}
