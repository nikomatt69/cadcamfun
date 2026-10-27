import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { useRouter } from "expo-router"
import { ArrowRight, Check, Folder, FolderOpen, Funnel, Pencil, Search, Sparkles, Tag, Trash2 } from "lucide-react-native"
import { assignedTags, matchesTag, tagScope, tagTarget } from "@/lib/list-tags"
import { useListTags } from "@/lib/use-list-tags"
import { TagBadges, TagFilter, TagSheet } from "@/components/ui/ListTags"
import type { ProjectSummary } from "@/lib/client"
import { useUIStore } from "@/lib/store"
import { accountStore } from "@/lib/account"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { usePoll } from "@/lib/use-poll"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { confirmDelete, promptText } from "@/lib/manage"
import { relativeTime } from "@/lib/format"
import { PROJECT_FILTERS, PROJECT_SORTS, listProjects, projectMeta, type ProjectFilter, type ProjectSort } from "@/lib/project-list"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { ListRow } from "@/components/ui/ListRow"
import { SearchDock } from "@/components/ui/SearchDock"
import { TextField } from "@/components/ui/TextField"
import { toast } from "@/components/ui/ToastHost"
import { BrandMark } from "@/components/layout/BrandMark"
import { CenteredScreenHeader } from "@/components/layout/CenteredScreenHeader"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ChoiceRow, DividedRows, SheetSection } from "@/components/chat/sheet-parts"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"

/** iOS cannot present an alert over a sheet that is still dismissing; the next step waits for it. */
const AFTER_DISMISS_MS = 350

/**
 * The projects of the paired desktop, laid out like nikcli's sessions index and this app's conversations list:
 * a centred header with a filter, flat rows under day headings, and one glass dock at the foot — search beside
 * the primary action, "New".
 */
export default function ProjectsScreen() {
  const { client, config, connectivity } = useServer()
  const { palette } = useTheme()
  const { gutter, onLayout } = useContentLayout()
  const router = useRouter()
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.account)
  const { collection, update } = useListTags(tagScope(config?.fingerprint ?? "", account?.subject ?? "local"))
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [taggingTarget, setTaggingTarget] = useState<string | null>(null)
  const activeTagFilter = tagFilter === "untagged" || collection.tags.some((tag) => tag.id === tagFilter) ? tagFilter : null
  const assistantProjectId = useUIStore((state) => state.assistantProjectId)
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<ProjectSort>("recent")
  const [filter, setFilter] = useState<ProjectFilter>("all")
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const descriptionRef = useRef<TextInput>(null)

  const resource = useResource(
    useCallback((signal) => client ? client.projects(signal) : Promise.reject(new Error("Not connected")), [client]), "projects",
    { cacheKey: `projects:${config?.fingerprint ?? ""}:${account?.subject ?? "local"}` },
  )
  // The list spans every project, so no single project stream can keep it fresh.
  usePoll(() => void resource.reload(), 40_000, connectivity === "online")
  // A project deleted on the desktop must not stay selected on the phone: follow the fresh list, never the saved copy.
  useEffect(() => {
    if (resource.data && !resource.stale && !resource.error) useUIStore.getState().forgetMissingProjects(resource.data.map((project) => project.id))
  }, [resource.data, resource.stale, resource.error])

  const sections = useMemo(() => listProjects((resource.data ?? []).filter((item) => matchesTag(collection, tagTarget("project", item.id), activeTagFilter)), { query, sort, filter }), [resource.data, query, sort, filter, collection, activeTagFilter])
  const customised = sort !== "recent" || filter !== "all" || activeTagFilter !== null

  const open = (project: ProjectSummary) => router.push(`/projects/${project.id}`)

  const askAssistant = (project: ProjectSummary) => {
    haptic("selection")
    setAssistantProject(project.id)
    router.navigate("/assistant/chat")
  }

  /** Rename or delete a project on the desktop; the list follows the desktop's answer. */
  const rename = async (project: ProjectSummary) => {
    if (!client) return
    try {
      const name = await promptText("Rename project", undefined, project.name)
      if (!name || name === project.name) return
      await client.renameProject(project.id, name)
      haptic("success")
      toast("Project renamed", "success")
      await resource.reload()
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error")
    }
  }
  const remove = async (project: ProjectSummary) => {
    if (!client) return
    try {
      if (!await confirmDelete(`Delete “${project.name}”?`, "Its designs, components, toolpaths and history are removed from the desktop too. This cannot be undone.")) return
      await client.deleteProject(project.id)
      haptic("success")
      toast("Project deleted", "success")
      await resource.reload()
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error")
    }
  }
  const afterSheet = (step: () => void) => { setActionsFor(null); setTimeout(step, AFTER_DISMISS_MS) }

  const create = async () => {
    if (!client || !newName.trim()) return
    setCreateBusy(true)
    setCreateError(null)
    try {
      const project = await client.createProject(newName.trim(), newDescription.trim() || undefined)
      haptic("success")
      setCreating(false)
      setNewName("")
      setNewDescription("")
      void resource.reload()
      router.push(`/projects/${project.id}`)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the project")
      toast("Could not create the project", "error")
    } finally {
      setCreateBusy(false)
    }
  }
  const startCreate = () => { haptic("selection"); setCreateError(null); setCreating(true) }

  const searching = query.trim() !== ""
  const empty = searching ? (
    <EmptyState title="No matches" description={`No project has “${query.trim()}” in its name or description.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : filter !== "all" || activeTagFilter !== null ? (
    <EmptyState title="No matching projects" description="Show every project, or pick another filter." icon={<Folder size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Show all" onPress={() => { haptic("selection"); setFilter("all"); setTagFilter(null) }} />} />
  ) : (
    <EmptyState title="Your workspace starts here" description="Create a project. Its designs, history and reviews will appear here." icon={<FolderOpen size={25} color={palette.accent} />}
      action={<ActionButton label="New project" onPress={startCreate} />} />
  )

  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 4 }}>
          <CenteredScreenHeader
            title="Projects"
            {...(config?.name ? { subtitle: config.name } : {})}
            left={<BrandMark size={32} wordmark={false} stacked={false} />}
            right={
              <IconCircleButton
                tone="warm"
                accessibilityLabel={customised ? "Sort and filter projects, changed" : "Sort and filter projects"}
                 accessibilityHint="Sorts by date or name and filters by date or tag"
                onPress={() => { haptic("selection"); setOptionsOpen(true) }}
              >
                <Funnel size={18} color={palette.ink} strokeWidth={2.2} fill={customised ? palette.ink : "none"} />
              </IconCircleButton>
            }
          />
        </View>
        <RowList<ProjectSummary>
          source={resource}
          sections={sections}
          keyExtractor={(item) => item.id}
          extraData={{ assistantProjectId, collection }}
          loadingLabel="Loading projects"
          failureTitle="Could not load projects"
          empty={empty}
          renderRow={(item) => {
            const current = item.id === assistantProjectId
            return (
              <FlatRow
                leading={<FolderOpen size={19} color={current ? palette.accent : palette.muted} strokeWidth={2} />}
                title={item.name}
                {...(item.description ? { subtitle: item.description } : {})}
                meta={projectMeta([current && "In the assistant", relativeTime(item.updatedAt)])}
                onPress={() => { haptic("selection"); open(item) }}
                onLongPress={() => { haptic("selection"); setActionsFor(item) }}
                accessibilityHint="Opens this project. Long press for actions."
                 selected={current}
                 accessibilityLabel={[item.name, item.description, ...assignedTags(collection, tagTarget("project", item.id)).map((tag) => `Tag: ${tag.name}`)].filter(Boolean).join(". ")}
              ><TagBadges collection={collection} target={tagTarget("project", item.id)} /></FlatRow>
            )
          }}
        />
        <SearchDock gutter={gutter} actionLabel="New" onAction={startCreate} value={query} onChangeText={setQuery} placeholder="Search projects" />
      </KeyboardAvoidingView>

      <BottomSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title="Sort and filter" padded>
        <SheetSection title="Sort by">
          <DividedRows>
            {PROJECT_SORTS.map((item) => (
              <ListRow key={item.id} title={item.label} subtitle={item.description} selected={item.id === sort} showChevron={false}
                trailing={item.id === sort ? <Check size={18} color={palette.ink} strokeWidth={2.4} /> : undefined}
                onPress={() => { if (item.id !== sort) haptic("selection"); setSort(item.id) }} />
            ))}
          </DividedRows>
        </SheetSection>
        <SheetSection title="Show">
          <DividedRows>
            {PROJECT_FILTERS.map((item) => (
              <ListRow key={item.id} title={item.label} subtitle={item.description} selected={item.id === filter} showChevron={false}
                trailing={item.id === filter ? <Check size={18} color={palette.ink} strokeWidth={2.4} /> : undefined}
                onPress={() => { if (item.id !== filter) haptic("selection"); setFilter(item.id) }} />
            ))}
          </DividedRows>
        </SheetSection>
        <TagFilter collection={collection} value={activeTagFilter} onChange={setTagFilter} onManage={() => { setOptionsOpen(false); setTaggingTarget(null); setTimeout(() => setTagsOpen(true), AFTER_DISMISS_MS) }} />
      </BottomSheet>

      <BottomSheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor?.name ?? "Project"} padded>
        {actionsFor ? (
          <DividedRows>
            <ChoiceRow icon={ArrowRight} title="Open project" description="History, pull requests and the workspace" onPress={() => { const target = actionsFor; afterSheet(() => open(target)) }} />
            <ChoiceRow icon={Sparkles} title="Ask the assistant" description="Work on this project in the Assistant tab" onPress={() => { const target = actionsFor; setActionsFor(null); askAssistant(target) }} />
            <ChoiceRow icon={Pencil} title="Rename" description="Change the name on the desktop too" onPress={() => { const target = actionsFor; afterSheet(() => void rename(target)) }} />
            <ChoiceRow icon={Tag} title="Tags" description="Set colors and labels for this project" onPress={() => { setTaggingTarget(tagTarget("project", actionsFor.id)); afterSheet(() => setTagsOpen(true)) }} />
            <ChoiceRow icon={Trash2} destructive title="Delete" description="Removes the project from the desktop" onPress={() => { const target = actionsFor; afterSheet(() => void remove(target)) }} />
          </DividedRows>
        ) : null}
      </BottomSheet>

      <TagSheet open={tagsOpen} onClose={() => setTagsOpen(false)} collection={collection} update={update} target={taggingTarget} />

      <BottomSheet open={creating} onClose={() => setCreating(false)} title="New project" padded>
        <TextField label="Name" value={newName} onChangeText={setNewName} placeholder="Gripper assembly" autoCapitalize="sentences" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => descriptionRef.current?.focus()} editable={!createBusy} />
        <TextField ref={descriptionRef} label="Description" value={newDescription} onChangeText={setNewDescription} placeholder="Optional" returnKeyType="done" onSubmitEditing={() => { if (newName.trim() && !createBusy) void create() }} editable={!createBusy} />
        {createError ? <ErrorBanner message={createError} /> : null}
        <ActionButton label="Create project" loading={createBusy} disabled={createBusy || !newName.trim()} onPress={() => void create()} />
      </BottomSheet>
    </SafeAreaView>
  )
}
