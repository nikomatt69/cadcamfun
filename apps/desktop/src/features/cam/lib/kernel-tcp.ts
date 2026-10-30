import { cam } from "@cadcamfun/core"
import type { CamKernelRequest } from "@cadcamfun/api"

/** Why the tool-centre-point switch is unavailable for the machine the settings name. */
export interface TcpRefusal {
  readonly key: "cam.kernel.tcpNeedsFiveAxis" | "cam.kernel.tcpNoWord"
  readonly params: Readonly<Record<string, string>>
}

/**
 * The kernel writes tool-centre-point output (`tcp`) only for a machine with a rotary table (it builds the table kinematics from it)
 * and a post that has a tip-control word (Okuma, generic and LinuxCNC have none). A post definition may bring its own word, so with one
 * set the kernel alone decides and its refusal comes back as an issue. `undefined`: the switch is available.
 */
export const tcpRefusal = (settings: Pick<CamKernelRequest, "machine" | "machineConfig" | "postDefinition">): TcpRefusal | undefined => {
  const machine = settings.machineConfig !== undefined
    ? cam.kernel.kernelMachineOfConfig(settings.machineConfig as never)
    : cam.kernel.findMachine(settings.machine ?? cam.kernel.DEFAULT_MACHINE.id)
  if (machine === undefined || machine.fiveAxis === undefined) return { key: "cam.kernel.tcpNeedsFiveAxis", params: {} }
  if (settings.postDefinition === undefined && cam.dialectOf(machine.post)?.tcp === undefined) return { key: "cam.kernel.tcpNoWord", params: { post: machine.post } }
  return undefined
}
