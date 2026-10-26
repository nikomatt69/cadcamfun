import { useCallback, useMemo, useState } from "react"
import { KeyboardAvoidingView, Platform, View } from "react-native"
import { useRouter } from "expo-router"
import { Cpu, Layers3, Plus, Search, Wrench } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import type { ResourceKind, ResourceRow } from "@/lib/client"
import { filterResources, resourceSubtitle, resourceTypes, type VisibilityFilter } from "@/lib/resources"
import { haptic } from "@/lib/haptics"
import { projectMeta } from "@/lib/project-list"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { FilterChips } from "@/components/ui/FilterChips"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"

const KINDS: readonly { value: ResourceKind; label: string; noun: string }[] = [
  { value: "materials", label: "Materials", noun: "material" },
  { value: "tools", label: "Tools", noun: "tool" },
  { value: "machine-configs", label: "Machines", noun: "machine" },
]

/**
 * Resources at desktop parity: the user's materials, tools and machines with search,
 * type and visibility filters, full create/edit forms (detail screen) and live sync —
 * the list reloads from the host stream whenever the desktop changes a row.
 */
export default function ResourcesScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const router = useRouter()
  const [kind, setKind] = useState<ResourceKind>("materials")
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [visibility, setVisibility] = useState<VisibilityFilter>("all")
  const current = KINDS.find((entry) => entry.value === kind)!

  const resource = useResource(
    useCallback((signal) => (client ? client.resources(kind, signal) : Promise.reject(new Error("Not connected"))), [client, kind]),
    `resources:${kind}`,
  )
  const rows = useMemo(() => resource.data ?? [], [resource.data])
  const filtered = useMemo(() => filterResources(rows, { search, type: typeFilter, visibility }), [rows, search, typeFilter, visibility])
  const types = useMemo(() => resourceTypes(rows), [rows])

  const open = (row: ResourceRow) => router.push({ pathname: "/(app)/settings/resource", params: { kind, id: row.id } } as never)
  const create = () => router.push({ pathname: "/(app)/settings/resource", params: { kind, create: "1" } } as never)

  const Icon = kind === "materials" ? Layers3 : kind === "tools" ? Wrench : Cpu
  const filtering = search.trim() !== "" || typeFilter !== "" || visibility !== "all"
  const clearFilters = () => { haptic("selection"); setSearch(""); setTypeFilter(""); setVisibility("all") }
  const empty = rows.length > 0 ? (
    <EmptyState title="No matches" description="No resources match your filters." icon={<Search size={25} color={palette.muted} />}
      action={filtering ? <ActionButton variant="secondary" label="Clear filters" onPress={clearFilters} /> : undefined} />
  ) : (
    <EmptyState title={`No ${current.label.toLowerCase()}`} description={`Add a ${current.noun}. It appears on the desktop at once.`} icon={<Icon size={25} color={palette.accent} />}
      action={<ActionButton label={`New ${current.noun}`} onPress={create} />} />
  )

  return (
    <ScreenFrame title="Resources" subtitle={rows.length > 0 ? `${filtered.length} of ${rows.length} ${current.label.toLowerCase()} · synced` : "Synced with the desktop"} backLabel="Back to settings">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <RowList<ResourceRow>
          source={resource}
          sections={filtered.length > 0 ? [{ data: [...filtered] }] : []}
          keyExtractor={(item) => item.id}
          extraData={kind}
          header={(
            <View style={{ gap: 12, paddingTop: 4 }}>
              <SegmentedControl segments={KINDS.map(({ value, label }) => ({ value, label }))} value={kind} onChange={(next) => { setKind(next); setTypeFilter("") }} />
              {types.length > 0 ? <FilterChips options={[{ id: "", label: "All types" }, ...types.map((value) => ({ id: value, label: value }))]} value={typeFilter} onChange={(value) => { haptic("selection"); setTypeFilter(value) }} accessibilityLabel="Type filter" /> : null}
              <FilterChips options={[{ id: "all" as VisibilityFilter, label: "All" }, { id: "public" as VisibilityFilter, label: "Public" }, { id: "private" as VisibilityFilter, label: "Private" }]} value={visibility} onChange={(value) => { haptic("selection"); setVisibility(value) }} accessibilityLabel="Visibility filter" />
            </View>
          )}
          loadingLabel={`Loading ${current.label.toLowerCase()}`}
          failureTitle={`Could not load ${current.label.toLowerCase()}`}
          empty={empty}
          renderRow={(item) => (
            <FlatRow
              leading={<Icon size={19} color={palette.muted} strokeWidth={2} />}
              title={item.name}
              subtitle={resourceSubtitle(kind, item)}
              meta={projectMeta([item.isPublic ? "Public" : "Private", item.updatedAt && `Updated ${relativeTime(item.updatedAt)}`])}
              onPress={() => { haptic("selection"); open(item) }}
              accessibilityHint="Opens the resource. Edit or delete it there."
            />
          )}
        />
        <Dock
          gutter={gutter}
          search={{ value: search, onChange: setSearch, placeholder: `Search ${current.label.toLowerCase()}` }}
          action={{ label: "New", icon: <Plus size={18} color={palette.onAccent} strokeWidth={2.4} />, onPress: create }}
        />
      </KeyboardAvoidingView>
    </ScreenFrame>
  )
}
