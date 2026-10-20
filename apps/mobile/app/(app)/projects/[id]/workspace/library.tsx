import { useCallback, useMemo, useState } from "react"
import { RefreshControl, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import type { WorkspaceEntry } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { haptic } from "@/lib/haptics"
import { routeParam } from "@/components/workspace/route"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ListRow } from "@/components/ui/ListRow"
import { Divider, SectionHeader } from "@/components/ui/SectionHeader"
import { type } from "@/lib/typography"
import { Skeleton } from "@/components/ui/Skeleton"
import { PageScroll } from "@/components/layout/page-scroll"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { Library, Search } from "lucide-react-native"
import { filterEntries } from "@/lib/workspace-filter"

export default function LibraryScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const revision = useCommitRevision(id)

  const library = useResource(
    useCallback(
      (signal) => (client ? client.workspaceLibrary(id, signal) : Promise.reject(new Error("Not connected"))),
      [client, id],
    ),
    `library:${id}:${revision}`,
  )

  const openComponent = (entry: WorkspaceEntry) => {
    haptic("selection")
    router.push(`/projects/${id}/workspace/components/${entry.id}?name=${encodeURIComponent(entry.name)}`)
  }

  const [query, setQuery] = useState("")
  const searching = query.trim() !== ""
  const catalogue = useMemo(() => library.data ? {
    materials: filterEntries(library.data.materials, query),
    tools: filterEntries(library.data.tools, query),
    machines: filterEntries(library.data.machines, query),
    components: filterEntries(library.data.components, query),
  } : undefined, [library.data, query])
  const count = (value: typeof catalogue) => value ? value.materials.length + value.tools.length + value.machines.length + value.components.length : 0
  const total = library.data ? library.data.materials.length + library.data.tools.length + library.data.machines.length + library.data.components.length : 0
  const empty = catalogue && count(catalogue) === 0

  return (
    <View collapsable={false} style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ title: "Library", headerLargeTitle: false, headerSearchBarOptions: {
        placeholder: "Search tools, materials, machines", hideWhenScrolling: false, tintColor: palette.accent,
        onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery(""),
      } }} />
      <PageScroll refreshControl={<RefreshControl refreshing={library.loading && Boolean(library.data)} onRefresh={() => void library.reload()} tintColor={palette.accent} />}>
      {library.error && catalogue ? <ErrorBanner message={library.error} actionLabel="Retry" onAction={() => void library.reload()} /> : null}
      {catalogue && total > 0 ? <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...type(13) }}>
        {searching ? `${count(catalogue)} of ${total}` : `${total} ${total === 1 ? "entry" : "entries"}`} · Synced from your desktop
      </Text> : null}
      {library.loading && !catalogue ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} style={{ height: 58 }} />
          ))}
        </View>
      ) : library.error && !catalogue ? (
        <ErrorBanner message={library.error} actionLabel="Retry" onAction={() => void library.reload()} />
      ) : empty ? (
        searching && total > 0
          ? <EmptyState title="No matches" description={`Nothing in the library matches “${query.trim()}”.`} icon={<Search size={25} color={palette.accent} />} />
          : <EmptyState title="Library is empty" description="Materials, tools, machines and components used by this project show up here." icon={<Library size={25} color={palette.accent} />} />
      ) : catalogue ? (
        <>
          <Catalogue title="Materials" entries={catalogue.materials} />
          <Catalogue title="Tools" entries={catalogue.tools} />
          <Catalogue title="Machines" entries={catalogue.machines} />
          <Catalogue title="Components" entries={catalogue.components} onOpen={openComponent} />
        </>
      ) : null}
      </PageScroll>
    </View>
  )
}

function Catalogue({
  title,
  entries,
  onOpen,
}: {
  title: string
  entries: readonly WorkspaceEntry[]
  onOpen?: (entry: WorkspaceEntry) => void
}) {
  if (entries.length === 0) return null
  return (
    <View>
      <SectionHeader>{title} · {entries.length}</SectionHeader>
      <SurfaceCard inset={false}>{entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? <Divider inset={16} /> : null}
          <ListRow
            title={entry.name}
            subtitle={entry.subtitle ?? undefined}
            showChevron={Boolean(onOpen)}
            onPress={onOpen ? () => onOpen(entry) : undefined}
          />
        </View>
      ))}</SurfaceCard>
    </View>
  )
}
