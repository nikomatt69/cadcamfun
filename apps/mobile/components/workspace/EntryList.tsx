import { useCallback, useMemo, useState } from "react"
import { KeyboardAvoidingView, Platform } from "react-native"
import type { LucideIcon } from "lucide-react-native"
import { ArrowRight, Box, Pencil, Plus, Search, Trash2 } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient, EntryKind } from "@/lib/client"
import { confirmDelete, promptText } from "@/lib/manage"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { filterEntries } from "@/lib/workspace-filter"
import { projectMeta, sectionByDay, timeOf } from "@/lib/project-list"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ChoiceRow, DividedRows } from "@/components/chat/sheet-parts"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"

/** iOS cannot present an alert over a sheet that is still dismissing; the next step waits for it. */
const AFTER_DISMISS_MS = 350

/**
 * A workspace list (designs, components, toolpaths) laid out like the Projects list: flat rows under day
 * headings, newest first, and the glass dock at the foot — search, plus "New" when the list can create.
 * A long press opens the entry's actions. The screen around it draws the header (`ScreenFrame`).
 */
export function EntryList({ client, projectId, revision, load, emptyTitle, emptyDescription, searchPlaceholder = "Search", icon: Icon = Box, onOpen, manage }: {
  client: CompanionClient
  projectId: string
  revision: number
  load: (client: CompanionClient, projectId: string, signal: AbortSignal) => Promise<readonly WorkspaceEntry[]>
  emptyTitle: string
  emptyDescription: string
  searchPlaceholder?: string
  /** The glyph of each row. */
  icon?: LucideIcon
  onOpen: (entry: WorkspaceEntry) => void
  /** When set, the list can create, rename and delete entries of this kind on the desktop. */
  manage?: { readonly kind: EntryKind; readonly noun: string }
}) {
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
  const [query, setQuery] = useState("")
  const [actionsFor, setActionsFor] = useState<WorkspaceEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const resource = useResource(useCallback((signal) => load(client, projectId, signal), [client, projectId, load]), `entries:${projectId}:${revision}`)
  const sections = useMemo(() => sectionByDay(filterEntries(resource.data ?? [], query), (entry) => timeOf(entry.updatedAt)), [resource.data, query])
  const total = resource.data?.length ?? 0

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
    if (name) await run(() => client.createEntry(projectId, manage.kind, name), `${capitalised(manage.noun)} created`)
  }
  const rename = async (entry: WorkspaceEntry): Promise<void> => {
    if (!manage) return
    const name = await promptText(`Rename ${manage.noun}`, undefined, entry.name)
    if (name && name !== entry.name) await run(() => client.renameEntry(manage.kind, entry.id, name), `${capitalised(manage.noun)} renamed`)
  }
  const remove = async (entry: WorkspaceEntry): Promise<void> => {
    if (!manage) return
    if (await confirmDelete(`Delete “${entry.name}”?`, `This ${manage.noun} is removed from the desktop too.`)) {
      await run(() => client.deleteEntry(manage.kind, entry.id), `${capitalised(manage.noun)} deleted`)
    }
  }
  const afterSheet = (step: () => void) => { setActionsFor(null); setTimeout(step, AFTER_DISMISS_MS) }

  const searching = query.trim() !== ""
  const empty = searching && total > 0 ? (
    <EmptyState title="No matches" description={`Nothing named “${query.trim()}”. Try another word.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <EmptyState title={emptyTitle} description={emptyDescription} icon={<Icon size={25} color={palette.accent} />}
      action={manage ? <ActionButton label={`New ${manage.noun}`} loading={busy} onPress={() => void create()} /> : undefined} />
  )

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <RowList<WorkspaceEntry>
        source={resource}
        sections={sections}
        keyExtractor={(item) => item.id}
        loadingLabel={`Loading ${searchPlaceholder.replace(/^Search /, "")}`}
        failureTitle="Could not load the workspace"
        empty={empty}
        renderRow={(item) => (
          <FlatRow
            leading={<Icon size={19} color={palette.muted} strokeWidth={2} />}
            title={item.name}
            {...(item.subtitle ? { subtitle: item.subtitle } : {})}
            meta={projectMeta([`Updated ${relativeTime(item.updatedAt)}`])}
            onPress={() => { haptic("selection"); onOpen(item) }}
            {...(manage ? { onLongPress: () => { haptic("selection"); setActionsFor(item) }, accessibilityHint: "Opens the preview. Long press for actions." } : { accessibilityHint: "Opens the preview" })}
          />
        )}
      />
      <Dock
        gutter={gutter}
        {...(total > 0 || searching ? { search: { value: query, onChange: setQuery, placeholder: searchPlaceholder } } : {})}
        {...(manage ? { action: { label: "New", icon: <Plus size={18} color={palette.onAccent} strokeWidth={2.4} />, onPress: () => void create(), loading: busy } } : {})}
      />

      <BottomSheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor?.name ?? "Item"} padded>
        {actionsFor && manage ? (
          <DividedRows>
            <ChoiceRow icon={ArrowRight} title="Open" description="The 3D preview" onPress={() => { const target = actionsFor; afterSheet(() => onOpen(target)) }} />
            <ChoiceRow icon={Pencil} title="Rename" description="Change the name on the desktop too" onPress={() => { const target = actionsFor; afterSheet(() => void rename(target)) }} />
            <ChoiceRow icon={Trash2} destructive title="Delete" description={`Removes the ${manage.noun} from the desktop`} onPress={() => { const target = actionsFor; afterSheet(() => void remove(target)) }} />
          </DividedRows>
        ) : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  )
}

const capitalised = (noun: string): string => noun.charAt(0).toUpperCase() + noun.slice(1)
