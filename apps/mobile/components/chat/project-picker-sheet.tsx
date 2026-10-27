import { View } from "react-native"
import { Check } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ListRow } from "@/components/ui/ListRow"
import { Skeleton } from "@/components/ui/Skeleton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import type { ProjectSummary } from "@/lib/client"
import { useTheme } from "@/lib/theme"
import type { Resource } from "@/lib/use-resource"

/** The project the assistant works in, chosen from the desktop's list: shared by the conversation list and the conversation. */
export function ProjectPickerSheet({ open, onClose, projects, selectedId, onSelect }: {
  open: boolean
  onClose: () => void
  projects: Resource<ProjectSummary[]>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { palette } = useTheme()
  return (
    <BottomSheet open={open} onClose={onClose} title="Assistant project">
      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        {projects.error ? <ErrorBanner message={projects.error} actionLabel="Try again" onAction={() => void projects.reload()} /> : null}
        {projects.loading && projects.data === undefined ? <View accessible accessibilityLabel="Loading assistant projects" style={{ gap: 8 }}>{[0, 1].map((key) => <Skeleton key={key} style={{ height: 76 }} />)}</View> : null}
        {(projects.data ?? []).map((project) => (
          <SurfaceCard key={project.id} inset={false}>
            <ListRow
              onPress={() => onSelect(project.id)}
              title={project.name}
              subtitle={project.description ?? undefined}
              selected={project.id === selectedId}
              trailing={project.id === selectedId ? <Check size={20} color={palette.accent} /> : undefined}
            />
          </SurfaceCard>
        ))}
        {!projects.loading && !projects.error && (projects.data ?? []).length === 0 ? (
          <View style={{ paddingVertical: 20 }}>
            <EmptyState title="No projects on the desktop" />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  )
}
