import { useCallback } from "react"
import { View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { ListRow } from "@/components/ui/ListRow"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

export function EntryList({
  client,
  projectId,
  revision,
  load,
  emptyTitle,
  emptyDescription,
  onOpen,
}: {
  client: CompanionClient
  projectId: string
  revision: number
  load: (client: CompanionClient, projectId: string, signal: AbortSignal) => Promise<readonly WorkspaceEntry[]>
  emptyTitle: string
  emptyDescription: string
  onOpen: (entry: WorkspaceEntry) => void
}) {
  const { palette } = useTheme()
  const resource = useResource(
    useCallback((signal) => load(client, projectId, signal), [client, projectId, load]),
    `entries:${projectId}:${revision}`,
  )

  if (resource.loading && !resource.data) {
    return (
      <View style={{ padding: 16, gap: 10 }}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} style={{ height: 58 }} />
        ))}
      </View>
    )
  }

  if (resource.error) {
    return (
      <View style={{ padding: 16 }}>
        <ErrorBanner message={resource.error} actionLabel="Retry" onAction={() => void resource.reload()} />
      </View>
    )
  }

  const entries = resource.data ?? []
  if (entries.length === 0) {
    return (
      <View style={{ padding: 16 }}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </View>
    )
  }

  return (
    <FlashList
      data={entries}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={item.subtitle ?? undefined}
          onPress={() => {
            haptic("selection")
            onOpen(item)
          }}
        />
      )}
    />
  )
}
