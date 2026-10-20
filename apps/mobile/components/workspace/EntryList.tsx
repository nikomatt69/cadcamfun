import { useCallback, useMemo, useState } from "react"
import { Pressable, Text } from "react-native"
import { Stack } from "expo-router"
import { Box, Plus, Search } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient, EntryKind } from "@/lib/client"
import { chooseAction, confirmDelete, promptText } from "@/lib/manage"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { filterEntries } from "@/lib/workspace-filter"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"

/** A searchable workspace list, most recently changed first. The search bar lives in the native header. */
export function EntryList({ client, projectId, revision, load, emptyTitle, emptyDescription, searchPlaceholder = "Search", onOpen, manage }: {
  client: CompanionClient
  projectId: string
  revision: number
  load: (client: CompanionClient, projectId: string, signal: AbortSignal) => Promise<readonly WorkspaceEntry[]>
  emptyTitle: string
  emptyDescription: string
  searchPlaceholder?: string
  onOpen: (entry: WorkspaceEntry) => void
  /** When set, the list can create, rename and delete entries of this kind on the desktop. */
  manage?: { readonly kind: EntryKind; readonly noun: string }
}) {
  const { palette } = useTheme()
  const [query, setQuery] = useState("")
  const resource = useResource(useCallback((signal) => load(client, projectId, signal), [client, projectId, load]), `entries:${projectId}:${revision}`)
  const entries = useMemo(() => resource.data ? filterEntries(resource.data, query) : undefined, [resource.data, query])
  const total = resource.data?.length ?? 0
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      haptic("success")
      toast(done, "success")
      await resource.reload()
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error")
    } finally {
      setBusy(false)
    }
  }
  const create = async (): Promise<void> => {
    if (!manage || busy) return
    const name = await promptText(`New ${manage.noun}`, "Name")
    if (name) await run(() => client.createEntry(projectId, manage.kind, name), `${manage.noun} created`)
  }
  const openActions = async (entry: WorkspaceEntry): Promise<void> => {
    if (!manage || busy) return
    const choice = await chooseAction(entry.name, ["Rename", "Delete"], "Delete")
    if (choice === "Rename") {
      const name = await promptText(`Rename ${manage.noun}`, undefined, entry.name)
      if (name && name !== entry.name) await run(() => client.renameEntry(manage.kind, entry.id, name), `${manage.noun} renamed`)
    } else if (choice === "Delete" && await confirmDelete(`Delete “${entry.name}”?`, `This ${manage.noun} is removed from the desktop too.`)) {
      await run(() => client.deleteEntry(manage.kind, entry.id), `${manage.noun} deleted`)
    }
  }
  const searching = query.trim() !== ""
  return <>
    <Stack.Screen options={{ headerSearchBarOptions: {
      placeholder: searchPlaceholder, hideWhenScrolling: false, tintColor: palette.accent,
      onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery(""),
    }, ...(manage ? { headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel={`New ${manage.noun}`} hitSlop={10} disabled={busy} onPress={() => void create()}>
        <Plus size={22} color={palette.accent} />
      </Pressable>
    ) } : {}) }} />
    <ResourceList resource={{ ...resource, data: entries }} keyExtractor={(item) => item.id}
      emptyTitle={searching && total > 0 ? "No matches" : emptyTitle}
      emptyDescription={searching && total > 0 ? `Nothing named “${query.trim()}”. Try another word.` : manage ? `${emptyDescription} Tap + to add one.` : emptyDescription}
      emptyIcon={searching && total > 0 ? <Search size={26} color={palette.accent} /> : <Box size={26} color={palette.accent} />}
      header={total > 0 ? <Text style={{ color: palette.muted, fontSize: 13, fontVariant: ["tabular-nums"] }}>
        {searching ? `${entries?.length ?? 0} of ${total}` : `${total} ${total === 1 ? "item" : "items"}`} · Synced from your desktop
      </Text> : null}
      renderItem={({ item }) => <RecordCard title={item.name} subtitle={item.subtitle ?? undefined} meta={`Updated ${relativeTime(item.updatedAt)}`}
        leading={<Box size={21} color={palette.accent} />} onPress={() => onOpen(item)}
        {...(manage ? { onLongPress: () => void openActions(item) } : {})} />}
    />
  </>
}
