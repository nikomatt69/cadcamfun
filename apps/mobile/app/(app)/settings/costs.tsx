import { useCallback, useMemo, useState } from "react"
import { KeyboardAvoidingView, Platform, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { Calculator, Plus, Search } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { projectMeta } from "@/lib/project-list"
import { COST_TABS, costSubtitle, costTitle, type CostEntry, type CostKind, type RateEntry, type RateKind } from "@/lib/costs"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"
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
  const { gutter } = useContentLayout()
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

  const searching = search.trim() !== ""
  const empty = searching ? (
    <EmptyState title="No matches" description="Try another name or organization." icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setSearch("") }} />} />
  ) : (
    <EmptyState title="No cost records" description={kind === "estimates" ? "Calculate and save an estimate from a program on your desktop." : "Add a cost record to share it with the desktop."} icon={<Calculator size={25} color={palette.accent} />} />
  )

  return <ScreenFrame title="Production costs" subtitle={`Shared with your desktop${kind === "estimates" && projectId ? " · this project" : ""}`} backLabel="Back">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <RowList<CostEntry>
        source={resource}
        sections={rows.length > 0 ? [{ data: rows }] : []}
        keyExtractor={(entry) => `${entry.kind}:${entry.row.id}`}
        header={<View style={{ paddingTop: 4 }}><FilterChips options={COST_TABS} value={kind} onChange={(next) => { haptic("selection"); setKind(next) }} accessibilityLabel="Cost categories" /></View>}
        loadingLabel="Loading cost records"
        failureTitle="Could not load the costs"
        empty={empty}
        renderRow={(item) => (
          <FlatRow
            leading={<Calculator size={19} color={palette.muted} strokeWidth={2} />}
            title={costTitle(item)}
            subtitle={costSubtitle(item)}
            meta={projectMeta([item.row.organization?.name ?? "Personal", new Date(item.row.updatedAt).toLocaleDateString()])}
            onPress={() => { haptic("selection"); if (item.kind === "estimates") setSelected(item); else setEditor({ kind: item.kind, entry: item }) }}
          />
        )}
      />
      <Dock
        gutter={gutter}
        search={{ value: search, onChange: setSearch, placeholder: "Name or organization" }}
        action={{ label: kind === "estimates" ? "Calculate" : "Add", icon: kind === "estimates" ? <Calculator size={17} color={palette.onAccent} strokeWidth={2.4} /> : <Plus size={18} color={palette.onAccent} strokeWidth={2.4} />, onPress: () => kind === "estimates" ? setCalculator(true) : setEditor({ kind }) }}
      />
    </KeyboardAvoidingView>
    {calculator ? <CostCalculator key={`calculator:${client ? "connected" : "offline"}`} projectId={projectId} toolpathId={toolpathId} onClose={() => setCalculator(false)} onSaved={saved} /> : null}
    {editor ? <CostEditor key={`${editor.kind}:${editor.entry?.row.id ?? "new"}`} {...editor} onClose={() => setEditor(undefined)} onSaved={saved} /> : null}
    {selected ? <EstimateDetail key={selected.row.id} estimate={selected.row} onClose={() => setSelected(undefined)} onSaved={saved} /> : null}
  </ScreenFrame>
}
