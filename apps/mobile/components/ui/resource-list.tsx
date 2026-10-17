import type { ReactNode } from "react"
import { RefreshControl, View } from "react-native"
import { FlashList, type FlashListProps } from "@shopify/flash-list"
import { layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { useTheme } from "@/lib/theme"
import { EmptyState } from "./EmptyState"
import { ErrorBanner } from "./ErrorBanner"
import { Skeleton } from "./Skeleton"

interface ListResource<T> {
  data: readonly T[] | undefined
  loading: boolean
  error: string | undefined
  reload: () => Promise<void>
}

type ResourceListProps<T> = {
  resource: ListResource<T>
  keyExtractor: NonNullable<FlashListProps<T>["keyExtractor"]>
  renderItem: NonNullable<FlashListProps<T>["renderItem"]>
  header?: ReactNode
  emptyTitle: string
  emptyDescription: string
  emptyIcon?: ReactNode
  emptyAction?: ReactNode
  loadingLabel?: string
}

/** One scroll owner for populated, empty, loading and failed lists; refresh never hides existing rows. */
export function ResourceList<T>({
  resource, keyExtractor, renderItem, header, emptyTitle, emptyDescription,
  emptyIcon, emptyAction, loadingLabel = "Loading items",
}: ResourceListProps<T>) {
  const { palette } = useTheme()
  const content = useContentLayout()
  const initialLoading = resource.loading && resource.data === undefined

  return (
    <FlashList
      onLayout={content.onLayout}
      data={resource.data ?? []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: content.gutter, paddingTop: 12, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={resource.loading && resource.data !== undefined}
          onRefresh={() => void resource.reload()} tintColor={palette.accent} />
      }
      ListHeaderComponent={header || resource.error ? (
        <View style={{ gap: layout.gap, paddingBottom: layout.gap }}>
          {header}
          {resource.error ? <ErrorBanner message={resource.error} actionLabel="Try again" onAction={() => void resource.reload()} /> : null}
        </View>
      ) : null}
      ListEmptyComponent={initialLoading ? (
        <View accessible accessibilityLabel={loadingLabel} style={{ gap: 12 }}>
          {[0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 96 }} />)}
        </View>
      ) : !resource.error ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} action={emptyAction} />
      ) : null}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    />
  )
}
