import { useCallback } from "react"
import { ScrollView, View } from "react-native"
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
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Skeleton } from "@/components/ui/Skeleton"

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

  const catalogue = library.data
  const empty =
    catalogue &&
    catalogue.materials.length === 0 &&
    catalogue.tools.length === 0 &&
    catalogue.machines.length === 0 &&
    catalogue.components.length === 0

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ title: "Library", headerLargeTitle: false }} />
      {library.loading && !catalogue ? (
        <View style={{ padding: 16, gap: 10 }}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} style={{ height: 58 }} />
          ))}
        </View>
      ) : library.error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={library.error} actionLabel="Retry" onAction={() => void library.reload()} />
        </View>
      ) : empty ? (
        <View style={{ padding: 16 }}>
          <EmptyState title="Library is empty" description="Materials, tools, machines and components used by this project show up here." />
        </View>
      ) : catalogue ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic">
          <Catalogue title="Materials" entries={catalogue.materials} />
          <Catalogue title="Tools" entries={catalogue.tools} />
          <Catalogue title="Machines" entries={catalogue.machines} />
          <Catalogue title="Components" entries={catalogue.components} onOpen={openComponent} />
        </ScrollView>
      ) : null}
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
  const { palette } = useTheme()
  if (entries.length === 0) return null
  return (
    <View>
      <SectionHeader>{title}</SectionHeader>
      {entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} /> : null}
          <ListRow
            title={entry.name}
            subtitle={entry.subtitle ?? undefined}
            showChevron={Boolean(onOpen)}
            onPress={onOpen ? () => onOpen(entry) : undefined}
          />
        </View>
      ))}
    </View>
  )
}
