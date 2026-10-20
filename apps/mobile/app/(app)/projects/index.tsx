import { useCallback, useMemo, useState } from "react"
import { RefreshControl, Text, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import { Stack, useRouter } from "expo-router"
import { ArrowUpRight, FolderOpen, Layers3, Plus, Search } from "lucide-react-native"
import { useSyncExternalStore } from "react"
import { accountStore } from "@/lib/account"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { toast } from "@/components/ui/ToastHost"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { usePoll } from "@/lib/use-poll"
import { hexToRgba, useTheme } from "@/lib/theme"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { IconTile } from "@/components/ui/icon-tile"
import { Pill } from "@/components/ui/Pill"
import { relativeTime } from "@/lib/format"

export default function ProjectsScreen() {
  const { client, config, connectivity } = useServer()
  const { palette } = useTheme()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.account)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const resource = useResource(
    useCallback((signal) => client ? client.projects(signal) : Promise.reject(new Error("Not connected")), [client]), "projects",
    { cacheKey: `projects:${config?.fingerprint ?? ""}:${account?.subject ?? "local"}` },
  )
  // The list spans every project, so no single project stream can keep it fresh.
  usePoll(() => void resource.reload(), 40_000, connectivity === "online")
  const projects = resource.data ?? []
  const list = useMemo(() => [...projects]
    .filter((project) => `${project.name} ${project.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [resource.data, query])

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

  return <>
    <BottomSheet open={creating} onClose={() => setCreating(false)} title="New project">
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <TextField label="Name" value={newName} onChangeText={setNewName} placeholder="Gripper assembly" editable={!createBusy} />
        <TextField label="Description" value={newDescription} onChangeText={setNewDescription} placeholder="Optional" editable={!createBusy} />
        {createError ? <ErrorBanner message={createError} /> : null}
        <ActionButton label="Create project" loading={createBusy} disabled={createBusy || !newName.trim()} onPress={() => void create()} />
      </View>
    </BottomSheet>
    <Stack.Screen options={{ title: "Projects", headerSearchBarOptions: {
      placeholder: "Search projects", hideWhenScrolling: false,
      onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery(""),
      tintColor: palette.accent,
    } }} />
    <FlashList data={list} keyExtractor={(item) => item.id} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}
      contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={resource.loading && Boolean(resource.data)} onRefresh={() => void resource.reload()} tintColor={palette.accent} />}
      ListHeaderComponent={<View style={{ gap: 20, paddingBottom: 16 }}>
        <SurfaceCard tone="surface">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <IconTile size={48}><Layers3 size={24} color={palette.accent} /></IconTile>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8 }}>YOUR WORKSPACE</Text>
              <Text style={{ color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" }} numberOfLines={fontScale > 1.2 ? undefined : 2}>{config?.name || "Desktop projects"}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 14, color: palette.soft, fontSize: 14, lineHeight: 21 }}>Review designs, inspect toolpaths and move work forward with your assistant.</Text>
          <View style={{ paddingTop: 14, gap: 12, alignItems: "flex-start" }}>
            <ActionButton label="New project" icon={<Plus size={19} color={palette.onAccent} />} fullWidth={false} onPress={() => { haptic("selection"); setCreating(true) }} />
            <Pill>{projects.length} {projects.length === 1 ? "project" : "projects"}</Pill></View>
        </SurfaceCard>
        {resource.error ? <ErrorBanner message={resource.stale ? `Showing saved projects. ${resource.error}` : resource.error} actionLabel="Try again" onAction={() => void resource.reload()} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 12, rowGap: 4 }}>
          <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.ink, fontSize: 19, lineHeight: 25, fontWeight: "700" }}>{query ? "Search results" : "Recent projects"}</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>Last updated</Text>
        </View>
      </View>}
      ListEmptyComponent={resource.loading && !resource.data ? <View style={{ gap: 12 }}>{[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 144, borderRadius: 22 }} />)}</View> : !resource.error ?
        <EmptyState title={query ? "No matching projects" : "Your workspace starts here"} description={query ? "Try another project name or description." : "Tap New project to create one. Its designs, history and reviews will appear here."} icon={query ? <Search size={25} color={palette.accent} /> : <FolderOpen size={25} color={palette.accent} />} /> : null}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item }) => <PressableScale subtle tint accessibilityLabel={`Open project ${item.name}`}
        onPress={() => { haptic("selection"); router.push(`/projects/${item.id}`) }}
        style={{ padding: 18, borderRadius: 22, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconTile><FolderOpen size={21} color={palette.accent} /></IconTile>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={{ color: palette.ink, fontSize: 18, lineHeight: 24, fontWeight: "600", letterSpacing: -0.3 }} numberOfLines={fontScale > 1.2 ? undefined : 2}>{item.name}</Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>{relativeTime(item.updatedAt)}</Text>
          </View>
          <ArrowUpRight size={19} color={palette.muted} />
        </View>
        <Text style={{ color: palette.soft, fontSize: 14, lineHeight: 21 }} numberOfLines={fontScale > 1.2 ? undefined : 2}>{item.description || "Open this workspace to explore designs, toolpaths and project history."}</Text>
        <View style={{ borderTopWidth: 0.5, borderTopColor: hexToRgba(palette.ink, 0.07), paddingTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 12, rowGap: 6 }}>
          <Text style={{ color: palette.muted, fontSize: 12 }}>Design · Manufacture · Review</Text>
          <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "600" }}>Open workspace</Text>
        </View>
      </PressableScale>}
    />
  </>
}
