/** The machine the probing panel works against (spec 73 §4): the machine picked in the CAD / CAM workspaces, read as the core's profile. */
import { profileOfConfig, type MachineProfile } from "./contract.ts"

interface PickedMachine { readonly id: string; readonly name: string; readonly type?: string | undefined; readonly config: object }

/** The profile of the picked machine, or undefined when none is picked. */
export const profileOfMachine = (machine: PickedMachine | null | undefined): MachineProfile | undefined =>
  machine === null || machine === undefined ? undefined : profileOfConfig(machine.config as Record<string, unknown>, (machine.type ?? "mill") as MachineProfile["kind"])
