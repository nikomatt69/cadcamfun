import { useCallback, useRef, useState } from "react"
import { Text } from "react-native"
import type { CalculatedEstimate } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { estimateInput } from "@/lib/costs"
import { errorMessage } from "@/lib/throttle"
import { SheetShell } from "@/components/ui/SheetShell"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { CostBreakdown, CostChoice } from "./cost-fields"

export function CostCalculator({ projectId: initialProjectId = "", toolpathId: initialToolpathId = "", onClose, onSaved }: {
  projectId?: string; toolpathId?: string; onClose: () => void; onSaved: () => void
}) {
  const { client } = useServer()
  const { palette } = useTheme()
  const [projectId, setProjectId] = useState(initialProjectId)
  const [toolpathId, setToolpathId] = useState(initialToolpathId)
  const [organizationId, setOrganizationId] = useState("")
  const [result, setResult] = useState<typeof CalculatedEstimate.Type>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState<string>()
  const choices = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    const [projects, organizations] = await Promise.all([client.projects(signal), client.organizations(signal)])
    return { projects, organizations }
  }, [client]), "cost-projects")
  const toolpaths = useResource(useCallback(async (signal) => {
    if (!projectId) return []
    if (!client) throw new Error("Not connected")
    return client.workspaceToolpaths(projectId, signal)
  }, [client, projectId]), `cost-toolpaths:${projectId}`)
  const clear = () => { setResult(undefined); setError(undefined); setSaved(false) }
  const run = async (save: boolean) => {
    if (!client || pending.current) return
    pending.current = true; setBusy(true); setError(undefined)
    try {
      if (save && result && !saved) {
        await client.createEstimate(estimateInput(result))
        setSaved(true); onSaved()
      } else if (!save) {
        if (!toolpathId || !toolpaths.data?.some((row) => row.id === toolpathId)) throw new Error("Choose a toolpath in this project")
        setResult(await client.calculateEstimate({ toolpathId, organizationId: organizationId || null }))
        setSaved(false)
      }
    } catch (cause) { setError(errorMessage(cause, "Could not calculate or save the estimate")) }
    finally { pending.current = false; setBusy(false) }
  }
  return <SheetShell open onClose={() => { if (!pending.current) onClose() }} title="Calculate estimate" description="The desktop calculates from the saved program and its cost settings. Recalculate after changing the program or its rates.">
    {choices.error ? <ErrorBanner message={choices.error} onAction={() => void choices.reload()} actionLabel="Retry" /> : null}
    <CostChoice label="Project" value={projectId} options={choices.data?.projects ?? []} disabled={busy} onChange={(id) => { setProjectId(id); setToolpathId(""); clear() }} />
    {toolpaths.error ? <ErrorBanner message={toolpaths.error} onAction={() => void toolpaths.reload()} actionLabel="Retry" /> : null}
    <CostChoice label="Toolpath" value={toolpathId} options={toolpaths.data ?? []} disabled={busy || !projectId} onChange={(id) => { setToolpathId(id); clear() }} />
    {projectId && !toolpaths.loading && toolpaths.data?.length === 0 ? <Text style={{ color: palette.muted, ...type(14) }}>This project has no saved toolpaths.</Text> : null}
    <CostChoice label="Organization" value={organizationId} options={[{ id: "", name: "Personal" }, ...(choices.data?.organizations ?? [])]} disabled={busy} onChange={(id) => { setOrganizationId(id); clear() }} />
    {error ? <ErrorBanner message={error} /> : null}
    <ActionButton label={result ? "Recalculate" : "Calculate"} loading={busy} disabled={!toolpathId || toolpaths.loading} onPress={() => void run(false)} />
    {result ? <>
      <CostBreakdown result={result} />
      <Text style={{ color: palette.muted, ...type(13) }}>{result.details.calculatedValues.totalPathLengthMm.toFixed(1)} mm path · {result.details.calculatedValues.materialVolumeM3.toPrecision(4)} m³ stock · {result.details.calculatedValues.totalSetupTimeMinutes} min setup</Text>
      <ActionButton label={saved ? "Estimate saved" : "Save estimate"} disabled={busy || saved} onPress={() => void run(true)} />
    </> : null}
  </SheetShell>
}
