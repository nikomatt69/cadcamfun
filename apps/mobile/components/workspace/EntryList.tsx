import { useCallback, useMemo, useState } from "react"
import { useRouter } from "expo-router"
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native"
import type { LucideIcon } from "lucide-react-native"
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowRight, Box, Ellipsis, MessageSquare, Pencil, Plus, Search, Trash2 } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import type { CompanionClient, EntryKind } from "@/lib/client"
import { confirmDelete, promptText } from "@/lib/manage"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { relativeTime } from "@/lib/format"
import { projectMeta } from "@/lib/project-list"
import { newEntryAssistantDraft, workspaceSections, type WorkspaceSort } from "@/lib/workspace-list"
import { useUIStore } from "@/lib/store"
import { type as textStyle } from "@/lib/typography"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ChoiceRow, DividedRows } from "@/components/chat/sheet-parts"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"
import { ToolpathIllustration } from "@/components/workspace/ToolpathIllustration"

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
  onOpen: (entry: Pick<WorkspaceEntry, "id" | "name">) => void
  /** When set, the list can create, rename and delete entries of this kind on the desktop. */
  manage?: { readonly kind: EntryKind; readonly noun: string }
}) {
  const { palette } = useTheme()
  const router = useRouter()
  const setAssistantDraft = useUIStore((state) => state.setAssistantDraft)
  const { gutter } = useContentLayout()
  const [query, setQuery] = useState("")
  const [actionsFor, setActionsFor] = useState<WorkspaceEntry | null>(null)
  const [sort, setSort] = useState<WorkspaceSort>("recent")
  const [sortOpen, setSortOpen] = useState(false)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const resource = useResource(useCallback((signal) => load(client, projectId, signal), [client, projectId, load]), `entries:${projectId}:${revision}`)
  const sections = useMemo(() => workspaceSections(resource.data ?? [], query, sort), [resource.data, query, sort])
  const total = resource.data?.length ?? 0
  const shown = sections.reduce((sum, section) => sum + section.data.length, 0)

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
    const name = await promptText(`New ${manage.noun}`, `This creates an empty ${manage.noun}. Enter a name to get started.`)
    if (!name) return
    setBusy(true)
    try {
      const entry = await client.createEntry(projectId, manage.kind, name)
      haptic("success")
      void resource.reload()
      setCreated(entry)
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error")
    } finally {
      setBusy(false)
    }
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
    <EmptyState title="No matches" description={`No items match “${query.trim()}”. Try another word.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <View style={{ gap: 12 }}>
      {manage?.kind === "toolpaths" ? <ToolpathIllustration /> : null}
      <EmptyState title={emptyTitle} description={emptyDescription} icon={<Icon size={25} color={palette.accent} />}
        action={manage ? <ActionButton label={`New ${manage.noun}`} loading={busy} onPress={() => void create()} /> : undefined} />
    </View>
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
        header={total > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text accessibilityLiveRegion="polite" style={{ flexShrink: 1, color: palette.muted, ...textStyle(13) }}>
              {searching ? `${shown} of ${total}` : total} {total === 1 ? "item" : "items"}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${sort === "recent" ? "recently updated" : "name"}`} accessibilityHint="Choose how items are ordered" onPress={() => setSortOpen(true)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ArrowDownWideNarrow size={16} color={palette.soft} />
              <Text style={{ color: palette.soft, ...textStyle(14, { weight: "600" }) }}>{sort === "recent" ? "Recent" : "Name"}</Text>
            </Pressable>
          </View>
        ) : undefined}
        renderRow={(item) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <FlatRow
                leading={<Icon size={19} color={palette.muted} strokeWidth={2} />}
                title={item.name}
                {...(item.subtitle ? { subtitle: item.subtitle } : {})}
                meta={projectMeta([`Updated ${relativeTime(item.updatedAt)}`])}
                onPress={() => { haptic("selection"); onOpen(item) }}
                {...(manage ? { onLongPress: () => { haptic("selection"); setActionsFor(item) }, chevron: false, accessibilityHint: "Opens the preview. More actions are available in the next button." } : { accessibilityHint: "Opens the preview" })}
              />
            </View>
            {manage ? <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${item.name}`} accessibilityHint="Open, rename or delete" disabled={busy} onPress={() => { haptic("selection"); setActionsFor(item) }} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busy ? 0.45 : 1 }}><Ellipsis size={20} color={palette.soft} /></Pressable> : null}
          </View>
        )}
      />
      <Dock
        gutter={gutter}
        {...(total > 0 || searching ? { search: { value: query, onChange: setQuery, placeholder: searchPlaceholder } } : {})}
        {...(manage ? { action: { label: "New", icon: <Plus size={18} color={palette.onAccent} strokeWidth={2} />, onPress: () => void create(), loading: busy } } : {})}
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
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort items" padded>
        <DividedRows>
          <ChoiceRow icon={ArrowDownWideNarrow} title="Recently updated" description="Newest changes first" selected={sort === "recent"} onPress={() => { setSort("recent"); setSortOpen(false) }} />
          <ChoiceRow icon={ArrowDownAZ} title="Name" description="A to Z" selected={sort === "name"} onPress={() => { setSort("name"); setSortOpen(false) }} />
        </DividedRows>
      </BottomSheet>
      <BottomSheet open={created !== null} onClose={() => setCreated(null)} title={`${manage ? capitalised(manage.noun) : "Item"} created`} padded>
        {created && manage ? (
          <DividedRows>
            {manage.kind === "drawings" ? <ChoiceRow icon={MessageSquare} title="Define with assistant" description={`Describe what the empty ${manage.noun} should contain`} onPress={() => {
              const draft = newEntryAssistantDraft(created)
              setCreated(null)
              setAssistantDraft({ projectId, ...draft, ...(manage.kind === "drawings" ? { drawingId: created.id, drawingName: created.name } : {}) })
              setTimeout(() => router.navigate("/assistant/chat"), AFTER_DISMISS_MS)
            }} /> : <Text style={{ padding: 16, color: palette.soft, ...textStyle(13) }}>Open the design used by this {manage.noun} to work with the assistant.</Text>}
            <ChoiceRow icon={ArrowRight} title="Open preview" description={`The new ${manage.noun} is empty until you define it`} onPress={() => {
              const entry = created
              setCreated(null)
              setTimeout(() => onOpen(entry), AFTER_DISMISS_MS)
            }} />
          </DividedRows>
        ) : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  )
}

const capitalised = (noun: string): string => noun.charAt(0).toUpperCase() + noun.slice(1)
