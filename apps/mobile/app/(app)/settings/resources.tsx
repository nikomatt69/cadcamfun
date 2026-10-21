import { useCallback, useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Cpu, Layers3, Plus, Wrench } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import type { ResourceKind, ResourceRow } from "@/lib/client"
import { filterResources, resourceSubtitle, resourceTypes, type VisibilityFilter } from "@/lib/resources"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { FilterChips } from "@/components/ui/FilterChips"
import { TextField } from "@/components/ui/TextField"
import { type } from "@/lib/typography"

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
  return <>
    <Stack.Screen options={{ title: "Resources", headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel={`New ${current.noun}`} hitSlop={11} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }} onPress={create}>
        <Plus size={22} color={palette.accent} />
      </Pressable>
    ) }} />
    <ResourceList resource={{ ...resource, data: filtered }} keyExtractor={(item) => item.id}
      emptyTitle={rows.length === 0 ? `No ${current.label.toLowerCase()}` : "No matches"}
      emptyDescription={rows.length === 0 ? `Tap + to add a ${current.noun}. It appears on the desktop at once.` : "No resources match your filters."}
      emptyIcon={<Icon size={26} color={palette.accent} />}
      header={<View style={{ gap: 12, paddingBottom: 12 }}>
        <SegmentedControl segments={KINDS.map(({ value, label }) => ({ value, label }))} value={kind} onChange={(next) => { setKind(next); setTypeFilter("") }} />
        <TextField label="Search" placeholder={`Search ${current.label.toLowerCase()}…`} value={search} onChangeText={setSearch} autoCorrect={false} />
        {types.length > 0 ? <FilterChips options={[{ id: "", label: "All types" }, ...types.map((value) => ({ id: value, label: value }))]} value={typeFilter} onChange={setTypeFilter} accessibilityLabel="Type filter" /> : null}
        <FilterChips options={[{ id: "all" as VisibilityFilter, label: "All" }, { id: "public" as VisibilityFilter, label: "Public" }, { id: "private" as VisibilityFilter, label: "Private" }]} value={visibility} onChange={setVisibility} accessibilityLabel="Visibility filter" />
        <Text style={{ color: palette.muted, ...type(13) }}>{filtered.length} of {rows.length} {current.label.toLowerCase()} · synced with the desktop</Text>
      </View>}
      renderItem={({ item }) => <RecordCard title={item.name} subtitle={resourceSubtitle(kind, item)}
        meta={`${item.isPublic ? "Public" : "Private"}${item.updatedAt ? ` · Updated ${relativeTime(item.updatedAt)}` : ""}`} leading={<Icon size={21} color={palette.accent} />}
        accessibilityHint="Opens the resource. Edit or delete it there."
        {...{ onPress: () => open(item), onLongPress: () => open(item) }} />}
    />
  </>
}
