import { useCallback, useMemo, useState } from "react"
import { KeyboardAvoidingView, Platform } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Boxes, Cpu, Layers, Library, Search, Wrench, type LucideIcon } from "lucide-react-native"
import type { WorkspaceEntry } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { useCommitRevision } from "@/lib/use-commit-revision"
import { haptic } from "@/lib/haptics"
import { filterEntries } from "@/lib/workspace-filter"
import { routeParam } from "@/components/workspace/route"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ScreenFrame } from "@/components/project/ScreenFrame"
import { RowList, type RowSection } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"

type Kind = "materials" | "tools" | "machines" | "components"
type Row = WorkspaceEntry & { readonly kind: Kind }

const KINDS: ReadonlyArray<{ kind: Kind; title: string; icon: LucideIcon }> = [
  { kind: "materials", title: "Materials", icon: Layers },
  { kind: "tools", title: "Tools", icon: Wrench },
  { kind: "machines", title: "Machines", icon: Cpu },
  { kind: "components", title: "Components", icon: Boxes },
]

/**
 * The project's library — materials, tools, machines and components — as flat rows under one heading per kind,
 * with the dock's search at the foot. Components open their 3D preview; the rest are read-only here.
 */
export default function LibraryScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = routeParam(params.id)
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const revision = useCommitRevision(id)

  const { gutter } = useContentLayout()
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
  const total = library.data ? KINDS.reduce((sum, { kind }) => sum + library.data![kind].length, 0) : 0
  const sections = useMemo((): RowSection<Row>[] => library.data ? KINDS.flatMap(({ kind, title }) => {
    const rows = filterEntries(library.data![kind], query).map((entry) => ({ ...entry, kind }))
    return rows.length > 0 ? [{ title: `${title} · ${rows.length}`, data: rows }] : []
  }) : [], [library.data, query])
  const source = useMemo(() => ({ ...library, data: library.data ? sections.flatMap((section) => section.data) : undefined }), [library, sections])

  const empty = searching && total > 0 ? (
    <EmptyState title="No matches" description={`Nothing in the library matches “${query.trim()}”.`} icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setQuery("") }} />} />
  ) : (
    <EmptyState title="Library is empty" description="Materials, tools, machines and components used by this project show up here." icon={<Library size={25} color={palette.accent} />} />
  )

  return (
    <ScreenFrame title="Library" {...(total > 0 ? { subtitle: `${total} ${total === 1 ? "entry" : "entries"} · Synced from your desktop` } : {})}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <RowList<Row>
          source={source}
          sections={sections}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          loadingLabel="Loading the library"
          failureTitle="Could not load the library"
          empty={empty}
          renderRow={(item) => {
            const Icon = KINDS.find((entry) => entry.kind === item.kind)?.icon ?? Library
            const opens = item.kind === "components"
            return (
              <FlatRow
                leading={<Icon size={19} color={palette.muted} strokeWidth={2} />}
                title={item.name}
                {...(item.subtitle ? { subtitle: item.subtitle } : {})}
                {...(opens ? { onPress: () => openComponent(item), accessibilityHint: "Opens the 3D preview" } : {})}
              />
            )
          }}
        />
        {total > 0 ? <Dock gutter={gutter} search={{ value: query, onChange: setQuery, placeholder: "Search tools, materials, machines" }} /> : null}
      </KeyboardAvoidingView>
    </ScreenFrame>
  )
}
