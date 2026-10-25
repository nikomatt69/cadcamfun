import { useCallback, useRef, useState } from "react"
import { Text } from "react-native"
import type { EstimateDetails } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { estimateNotes } from "@/lib/costs"
import { confirmDelete } from "@/lib/manage"
import { errorMessage } from "@/lib/throttle"
import { SheetShell } from "@/components/ui/SheetShell"
import { ActionButton } from "@/components/ui/ActionButton"
import { TextField } from "@/components/ui/TextField"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { CostBreakdown } from "./cost-fields"

export function EstimateDetail({ estimate, onClose, onSaved }: { estimate: typeof EstimateDetails.Type; onClose: () => void; onSaved: () => void }) {
  const { client } = useServer()
  const { palette } = useTheme()
  const [notes, setNotes] = useState(estimateNotes(estimate.details))
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState<string>()
  const resource = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.estimate(estimate.id, signal)
  }, [client, estimate.id]), `estimate:${estimate.id}`)
  const row = resource.data ?? estimate
  const run = async (remove: boolean) => {
    if (!client || pending.current) return
    pending.current = true; setBusy(true); setError(undefined)
    try {
      if (remove) {
        if (!(await confirmDelete("Delete estimate?", "This saved estimate will also be removed from the desktop."))) return
        await client.deleteEstimate(row.id)
      } else await client.updateEstimate(row.id, { notes })
      onSaved(); onClose()
    } catch (cause) { setError(errorMessage(cause, "Could not update the estimate")) }
    finally { pending.current = false; setBusy(false) }
  }
  return <SheetShell open onClose={() => { if (!pending.current) onClose() }} title={row.toolpath.name} description={`Saved ${new Date(row.createdAt).toLocaleString()} · ${row.organization?.name ?? "Personal estimate"}`}>
    {resource.error ? <ErrorBanner message={resource.error} actionLabel="Retry" onAction={() => void resource.reload()} /> : null}
    <CostBreakdown result={row} />
    <Text style={{ color: palette.muted, ...type(13) }}>These are the saved amounts. Calculate a new estimate to use the current program and rates.</Text>
    <TextField label="Notes" multiline value={notes} onChangeText={setNotes} editable={!busy} />
    {error ? <ErrorBanner message={error} /> : null}
    <ActionButton label="Save notes" loading={busy} onPress={() => void run(false)} />
    <ActionButton label="Delete estimate" variant="danger" disabled={busy} onPress={() => void run(true)} />
  </SheetShell>
}
