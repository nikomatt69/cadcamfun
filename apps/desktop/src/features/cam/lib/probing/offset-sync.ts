/**
 * Loading and saving the work-offset table through the `ProbingService` (spec 73 §4): the one place that moves rows between the
 * machine configuration and the editing store, so a save always carries the revision the load read and a 409 sets the conflict flag.
 */
import { Effect } from "effect"
import type { ProbingService } from "../../api/probing.ts"
import { isSaveConflict } from "../../../cad/lib/stored-revision.ts"
import { WorkOffsetConflict } from "../../api/probing.ts"
import type { MachineProfile } from "./contract.ts"
import { useWorkOffsetStore, type LoadedOffsets } from "../../store/workOffsetStore.ts"

type Run = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String((cause as { message: unknown }).message) : String(cause))

/** Reads the table of the machine (or of a setup) into the store. */
export const loadOffsets = async (service: Pick<ProbingService, "workOffsets">, run: Run, profile: MachineProfile, machineConfigId: string, setupId?: string): Promise<void> => {
  const store = useWorkOffsetStore.getState()
  store.setLoading(true)
  try {
    const document = await run(service.workOffsets.get(machineConfigId, setupId))
    store.load(profile, document as LoadedOffsets)
  } catch (cause) {
    store.setLoading(false)
    store.setError(messageOf(cause))
  }
}

/** Writes the edited table; true when it was written. A stale revision keeps the user's edits and sets the conflict flag. */
export const saveOffsets = async (service: Pick<ProbingService, "workOffsets">, run: Run, profile: MachineProfile): Promise<boolean> => {
  const store = useWorkOffsetStore.getState()
  const id = store.machineConfigId
  if (id === undefined) return false
  store.setSaving(true)
  store.setError(undefined)
  try {
    const document = await run(service.workOffsets.put(id, { entries: store.entries(), ...(store.updatedAt !== undefined ? { baseUpdatedAt: store.updatedAt } : {}) }, store.setupId))
    useWorkOffsetStore.getState().load(profile, document as LoadedOffsets)
    useWorkOffsetStore.getState().setSaving(false)
    return true
  } catch (cause) {
    const state = useWorkOffsetStore.getState()
    state.setSaving(false)
    if (cause instanceof WorkOffsetConflict || isSaveConflict(cause)) state.setConflict(true)
    else state.setError(messageOf(cause))
    return false
  }
}
