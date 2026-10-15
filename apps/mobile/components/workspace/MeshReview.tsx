import { FlatList, Text, View } from "react-native"
import { Sparkles } from "lucide-react-native"
import type { MeshPart, MeshPreview, PreviewParameter } from "@cadcamfun/api"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { PreviewViewport } from "@/components/preview/PreviewViewport"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ListRow } from "@/components/ui/ListRow"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Skeleton } from "@/components/ui/Skeleton"

/**
 * Shared 3D review for a design or a component. The phone draws the mesh and reports a selection.
 * The action only opens the assistant with a prompt — it does not write geometry.
 */
export function MeshReview({
  mesh,
  loading,
  error,
  onRetry,
  parameters,
  selectedPartId,
  onSelectPart,
  actionLabel,
  onAction,
}: {
  mesh: MeshPreview | undefined
  loading: boolean
  error: string | undefined
  onRetry: () => void
  parameters?: readonly PreviewParameter[]
  selectedPartId: string | undefined
  onSelectPart: (id: string | undefined) => void
  actionLabel: string
  onAction: () => void
}) {
  const { palette } = useTheme()
  const parts = mesh?.parts ?? []

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ height: 300 }}>
        {mesh ? (
          <PreviewViewport
            bounds={mesh.bounds}
            revision={mesh.revision}
            mesh={mesh}
            selectedPartId={selectedPartId}
            onSelectPart={(id) => {
              haptic("selection")
              onSelectPart(id)
            }}
          />
        ) : (
          <Skeleton style={{ flex: 1, borderRadius: 0 }} />
        )}
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} />
        </View>
      ) : null}

      <FlatList
        style={{ flex: 1 }}
        data={parts}
        keyExtractor={(item) => item.id}
        extraData={selectedPartId}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View>
            {mesh?.truncated ? (
              <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 16, paddingHorizontal: 16, paddingTop: 10 }}>
                Preview truncated so it fits on the phone.
              </Text>
            ) : null}
            {parameters && parameters.length > 0 ? (
              <View>
                <SectionHeader>Parameters</SectionHeader>
                {parameters.map((parameter) => (
                  <ListRow key={parameter.key} title={parameter.key} subtitle={parameter.value} showChevron={false} />
                ))}
              </View>
            ) : null}
            <SectionHeader>Elements</SectionHeader>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 12 }}>
              No solid elements in this preview.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <PartRow
            part={item}
            selected={item.id === selectedPartId}
            onPress={() => {
              haptic("selection")
              onSelectPart(item.id === selectedPartId ? undefined : item.id)
            }}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />}
      />

      <View style={{ padding: 16, paddingTop: 8 }}>
        <ActionButton
          label={actionLabel}
          icon={<Sparkles size={16} color={palette.onAccent} />}
          disabled={!mesh || Boolean(error)}
          onPress={onAction}
        />
      </View>
    </View>
  )
}

function PartRow({ part, selected, onPress }: { part: MeshPart; selected: boolean; onPress: () => void }) {
  const { palette } = useTheme()
  const subtitle = part.triangleCount > 0 ? `${part.triangleCount} triangles` : "Not in this preview"
  return (
    <ListRow
      title={part.name || part.id}
      subtitle={subtitle}
      trailing={selected ? <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "600" }}>Selected</Text> : undefined}
      showChevron={false}
      onPress={onPress}
    />
  )
}
