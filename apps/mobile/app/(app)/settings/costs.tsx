import { useCallback, useMemo, useState } from "react"
import { Text, View } from "react-native"
import { Stack, useLocalSearchParams } from "expo-router"
import { Calculator } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { COST_TABS, costSubtitle, costTitle, type CostEntry, type CostKind, type RateEntry, type RateKind } from "@/lib/costs"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { TextField } from "@/components/ui/TextField"
import { FilterChips } from "@/components/ui/FilterChips"
import { ActionButton } from "@/components/ui/ActionButton"
import { CostCalculator } from "@/components/costs/cost-calculator"
import { CostEditor } from "@/components/costs/cost-editor"
import { EstimateDetail } from "@/components/costs/estimate-detail"

/** The same persisted estimates and rates as the desktop, through the pinned companion client. */
export default function CostsScreen() {
  const { projectId, toolpathId } = useLocalSearchParams<{ projectId?: string; toolpathId?: string }>()
  const { client } = useServer()
  const { palette } = useTheme()
  const [kind, setKind] = useState<CostKind>("estimates")
  const [search, setSearch] = useState("")
  const [calculator, setCalculator] = useState(!!toolpathId)
  const [editor, setEditor] = useState<{ kind: RateKind; entry?: RateEntry }>()
  const [selected, setSelected] = useState<Extract<CostEntry, { kind: "estimates" }>>()
  const resource = useResource(useCallback(async (signal): Promise<CostEntry[]> => {
    if (!client) throw new Error("Not connected")
    switch (kind) {
      case "estimates": return (await client.estimates(projectId, signal)).map((row) => ({ kind, row }))
      case "material-costs": return (await client.materialCosts(signal)).map((row) => ({ kind, row }))
      case "tool-wear": return (await client.toolWearCosts(signal)).map((row) => ({ kind, row }))
      case "operation-costs": return (await client.operationCosts(signal)).map((row) => ({ kind, row }))
    }
  }, [client, kind, projectId]), `costs:${kind}:${projectId ?? "all"}`)
  const rows = useMemo(() => (resource.data ?? []).filter((entry) => `${costTitle(entry)} ${entry.row.organization?.name ?? "personal"}`.toLowerCase().includes(search.trim().toLowerCase())), [resource.data, search])
  const saved = () => { void resource.reload() }

  return <>
    <Stack.Screen options={{ title: "Production costs" }} />
    <ResourceList resource={{ ...resource, data: resource.data === undefined ? undefined : rows }} keyExtractor={(entry) => `${entry.kind}:${entry.row.id}`}
      emptyTitle={search ? "No matches" : "No cost records"} emptyDescription={search ? "Try another name or organization." : kind === "estimates" ? "Calculate and save an estimate from a program on your desktop." : "Add a cost record to share it with the desktop."}
      emptyIcon={<Calculator size={26} color={palette.accent} />}
      header={<View style={{ gap: 12 }}>
        <FilterChips options={COST_TABS} value={kind} onChange={setKind} accessibilityLabel="Cost categories" />
        <TextField label="Search" placeholder="Name or organization…" value={search} onChangeText={setSearch} autoCorrect={false} />
        <ActionButton label={kind === "estimates" ? "Calculate estimate" : "Add cost record"} onPress={() => kind === "estimates" ? setCalculator(true) : setEditor({ kind })} />
        <Text style={{ color: palette.muted, ...type(13) }}>Shared with your desktop{kind === "estimates" && projectId ? " · this project" : ""}</Text>
      </View>}
      renderItem={({ item }) => <RecordCard leading={<Calculator size={21} color={palette.accent} />} title={costTitle(item)} subtitle={costSubtitle(item)} meta={`${item.row.organization?.name ?? "Personal"} · ${new Date(item.row.updatedAt).toLocaleDateString()}`}
        onPress={() => item.kind === "estimates" ? setSelected(item) : setEditor({ kind: item.kind, entry: item })} />}
    />
    {calculator ? <CostCalculator key={`calculator:${client ? "connected" : "offline"}`} projectId={projectId} toolpathId={toolpathId} onClose={() => setCalculator(false)} onSaved={saved} /> : null}
    {editor ? <CostEditor key={`${editor.kind}:${editor.entry?.row.id ?? "new"}`} {...editor} onClose={() => setEditor(undefined)} onSaved={saved} /> : null}
    {selected ? <EstimateDetail key={selected.row.id} estimate={selected.row} onClose={() => setSelected(undefined)} onSaved={saved} /> : null}
  </>
}
