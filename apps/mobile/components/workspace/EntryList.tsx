import { useCallback, useMemo, useState } from "react"
import { Text } from "react-native"
import { Stack } from "expo-router"
import { Box, Search } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { filterEntries } from "@/lib/workspace-filter"
import { type } from "@/lib/typography"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

/** A searchable workspace list, most recently changed first. The search bar lives in the native header. */
export function EntryList({ client, projectId, revision, load, emptyTitle, emptyDescription, searchPlaceholder = "Search", onOpen }: {
  client: CompanionClient
  projectId: string
  revision: number
  load: (client: CompanionClient, projectId: string, signal: AbortSignal) => Promise<readonly WorkspaceEntry[]>
  emptyTitle: string
  emptyDescription: string
  searchPlaceholder?: string
  onOpen: (entry: WorkspaceEntry) => void
}) {
  const { palette } = useTheme()
  const [query, setQuery] = useState("")
  const resource = useResource(useCallback((signal) => load(client, projectId, signal), [client, projectId, load]), `entries:${projectId}:${revision}`)
  const entries = useMemo(() => resource.data ? filterEntries(resource.data, query) : undefined, [resource.data, query])
  const total = resource.data?.length ?? 0
  const searching = query.trim() !== ""
  return <>
    <Stack.Screen options={{ headerSearchBarOptions: {
      placeholder: searchPlaceholder, hideWhenScrolling: false, tintColor: palette.accent,
      onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery(""),
    } }} />
    <ResourceList resource={{ ...resource, data: entries }} keyExtractor={(item) => item.id}
      emptyTitle={searching && total > 0 ? "No matches" : emptyTitle}
      emptyDescription={searching && total > 0 ? `Nothing named “${query.trim()}”. Try another word.` : emptyDescription}
      emptyIcon={searching && total > 0 ? <Search size={26} color={palette.accent} /> : <Box size={26} color={palette.accent} />}
      header={total > 0 ? <Text accessibilityRole="summary" style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...type(13) }}>
        {searching ? `${entries?.length ?? 0} of ${total}` : `${total} ${total === 1 ? "item" : "items"}`} · Synced from your desktop
      </Text> : null}
      renderItem={({ item }) => <RecordCard title={item.name} subtitle={item.subtitle ?? undefined} meta={`Updated ${relativeTime(item.updatedAt)}`}
        leading={<Box size={21} color={palette.accent} />} onPress={() => onOpen(item)} />}
    />
  </>
}
