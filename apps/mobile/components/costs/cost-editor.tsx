import { useCallback, useRef, useState } from "react"
import { Text } from "react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { costCurrency, costNumber, costTitle, type RateEntry, type RateKind } from "@/lib/costs"
import { confirmDelete } from "@/lib/manage"
import { errorMessage } from "@/lib/throttle"
import { SheetShell } from "@/components/ui/SheetShell"
import { ActionButton } from "@/components/ui/ActionButton"
import { TextField } from "@/components/ui/TextField"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { CostChoice } from "./cost-fields"

export function CostEditor({ kind, entry, onClose, onSaved }: { kind: RateKind; entry?: RateEntry; onClose: () => void; onSaved: () => void }) {
  const { client } = useServer()
  const { palette } = useTheme()
  const row = entry?.row
  const [values, setValues] = useState<Record<string, string>>(() => row ? Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => [k, String(v)])) : { currencyCode: "EUR", wasteFactor: "0", minimumCharge: "0", replacementThreshold: "100", setupTime: "30" })
  const [target, setTarget] = useState(entry?.kind === "material-costs" ? entry.row.materialId : entry?.kind === "tool-wear" ? entry.row.toolId : "")
  const [organizationId, setOrganizationId] = useState(row?.organizationId ?? "")
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState<string>()
  const choices = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    const [organizations, resources] = await Promise.all([
      client.organizations(signal), kind === "operation-costs" ? Promise.resolve([]) : client.resources(kind === "material-costs" ? "materials" : "tools", signal),
    ])
    return { organizations, resources }
  }, [client, kind]), `cost-editor:${kind}`)
  const put = (key: string, value: string) => setValues((previous) => ({ ...previous, [key]: value }))
  const number = (key: string, label: string) => costNumber(values[key] ?? "", label)

  const run = async (remove = false) => {
    if (!client || pending.current) return
    pending.current = true
    setBusy(true); setError(undefined)
    try {
      if (remove && entry) {
        if (!(await confirmDelete(`Delete ${costTitle(entry)}?`, "This cost record will also be removed from the desktop. Saved estimates keep their original amounts."))) return
        if (kind === "material-costs") await client.deleteMaterialCost(entry.row.id)
        else if (kind === "tool-wear") await client.deleteToolWearCost(entry.row.id)
        else await client.deleteOperationCost(entry.row.id)
      } else {
        const currencyCode = costCurrency(values["currencyCode"] ?? "")
        if (kind === "material-costs") {
          if (!target) throw new Error("Choose a material")
          const input = { currencyCode, costPerUnit: number("costPerUnit", "Cost per m³"), wasteFactor: number("wasteFactor", "Waste"), minimumCharge: number("minimumCharge", "Minimum charge") }
          if (row) await client.updateMaterialCost(row.id, input)
          else await client.createMaterialCost({ ...input, materialId: target, organizationId: organizationId || null })
        } else if (kind === "tool-wear") {
          if (!target) throw new Error("Choose a tool")
          const input = { currencyCode, wearRatePerMeter: number("wearRatePerMeter", "Wear per metre"), replacementCost: number("replacementCost", "Replacement cost"), replacementThreshold: number("replacementThreshold", "Replacement threshold") }
          if (input.replacementThreshold > 100 || input.replacementThreshold === 0) throw new Error("Replacement threshold must be greater than 0 and at most 100%")
          if (row) await client.updateToolWearCost(row.id, input)
          else await client.createToolWearCost({ ...input, toolId: target, organizationId: organizationId || null })
        } else {
          const name = values["name"]?.trim()
          if (!name) throw new Error("Enter a name")
          const input = { currencyCode, name, machineHourlyRate: number("machineHourlyRate", "Machine hourly rate"), operatorHourlyRate: number("operatorHourlyRate", "Operator hourly rate"), setupTime: number("setupTime", "Setup time") }
          if (row) await client.updateOperationCost(row.id, input)
          else await client.createOperationCost({ ...input, organizationId: organizationId || null })
        }
      }
      onSaved(); onClose()
    } catch (cause) { setError(errorMessage(cause, "Could not save the cost record")) }
    finally { pending.current = false; setBusy(false) }
  }
  const fields = kind === "material-costs" ? [["costPerUnit", "Cost per m³"], ["wasteFactor", "Waste (%)"], ["minimumCharge", "Minimum charge"]]
    : kind === "tool-wear" ? [["wearRatePerMeter", "Wear per metre (%)"], ["replacementCost", "Replacement cost"], ["replacementThreshold", "Replacement threshold (%)"]]
    : [["machineHourlyRate", "Machine rate / hour"], ["operatorHourlyRate", "Operator rate / hour"], ["setupTime", "Setup time (minutes)"]]

  return <SheetShell open onClose={() => { if (!pending.current) onClose() }} title={entry ? costTitle(entry) : "New cost record"}>
    {choices.error ? <ErrorBanner message={choices.error} onAction={() => void choices.reload()} actionLabel="Retry" /> : null}
    {kind !== "operation-costs" ? <CostChoice label={kind === "material-costs" ? "Material" : "Tool"} value={target} disabled={!!row || busy}
      options={choices.data?.resources ?? []} onChange={setTarget} /> : <TextField label="Name" editable={!busy} value={values["name"] ?? ""} onChangeText={(v) => put("name", v)} />}
    {row ? <Text style={{ color: palette.muted, ...type(13) }}>{entry?.row.organization?.name ?? "Personal cost record"}</Text>
      : <CostChoice label="Organization" value={organizationId} disabled={busy} options={[{ id: "", name: "Personal" }, ...(choices.data?.organizations ?? [])]} onChange={setOrganizationId} />}
    {fields.map(([key = "", label = ""]) => <TextField key={key} label={label} value={values[key] ?? ""} editable={!busy} keyboardType="decimal-pad" onChangeText={(v) => put(key, v)} />)}
    <TextField label="Currency" value={values["currencyCode"] ?? ""} editable={!busy} maxLength={3} autoCapitalize="characters" autoCorrect={false} onChangeText={(v) => put("currencyCode", v)} />
    {error ? <ErrorBanner message={error} /> : null}
    <ActionButton label="Save cost record" loading={busy} onPress={() => void run()} />
    {entry ? <ActionButton label="Delete cost record" variant="danger" disabled={busy} onPress={() => void run(true)} /> : null}
  </SheetShell>
}
