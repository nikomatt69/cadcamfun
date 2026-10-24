/**
 * Picking the machine a job runs on, from either workspace: the CAD workpiece panel's `<select>` and
 * the CAM sidebar's listbox are two renderings of the same pick.
 *
 * A pick is the CAD workpiece's machine, the preview's machine and the kernel's machine at once: a
 * built-in preset names itself, a configuration of the library travels with the request. Clearing
 * the pick goes back to Auto, where the preview and the kernel follow the program.
 */
import { cam as coreCam } from "@cadcamfun/core"
import { useCADStore, type MachineConfig } from "../../cad/store/cadStore.ts"
import { useCamStore } from "../store/camStore.ts"
import { useGeneratorStore } from "../store/generatorStore.ts"
import { kernelMachineConfigOf, machineResourceKind } from "./machines.ts"

export const pickMachine = (machine: MachineConfig | undefined): void => {
  const cad = useCADStore.getState()
  const cam = useCamStore.getState()
  cad.setSelectedMachine(machine ?? null)
  cam.setMachineOverride(machine === undefined ? undefined : machineResourceKind(machine))
  if (machine === undefined) return
  const gen = useGeneratorStore.getState()
  const builtin = coreCam.kernel.findMachine(machine.id)
  if (builtin !== undefined) gen.patchKernelSettings({ machine: builtin.id, machineConfig: undefined })
  else {
    const row = kernelMachineConfigOf(machine)
    if (row !== undefined) gen.patchKernelSettings({ machineConfig: row, machine: undefined })
  }
}
