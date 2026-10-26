import type { ReactNode } from "react"
import { RefreshControl, SectionList, View, type LayoutChangeEvent, type ListRenderItemInfo } from "react-native"
import { CloudOff } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { RowSeparator, RowsSkeleton, SectionTitle } from "./rows"

/** What a list needs to know about the request behind it. `useResource` satisfies it. */
export interface ListSource {
  readonly data: readonly unknown[] | undefined
  readonly loading: boolean
  readonly error: string | undefined
  /** The rows on screen are the copy saved on the phone. */
  readonly stale?: boolean
  readonly reload: () => Promise<void>
}

export interface RowSection<T> {
  readonly title?: string
  readonly data: T[]
}

/**
 * A list of flat rows under muted headings with every state a list can be in (the conversations screen's list):
 * row-shaped skeletons while the first answer is on its way, an empty state that says how to fill the list, an
 * error that offers a retry, a banner when the rows are the saved copy, and pull to refresh that keeps the rows.
 *
 * `empty` is what the caller shows when the list is genuinely empty or the search matched nothing; loading and a
 * failed first load are drawn here.
 */
export function RowList<T>({
  source, sections, keyExtractor, renderRow, empty, header, loadingLabel, failureTitle, skeletonLines = 2, extraData, onLayout,
}: {
  source: ListSource
  sections: readonly RowSection<T>[]
  keyExtractor: (item: T) => string
  renderRow: (item: T) => ReactNode
  empty: ReactNode
  /** Above the first heading: filter chips, a summary line. */
  header?: ReactNode
  loadingLabel: string
  failureTitle: string
  skeletonLines?: 1 | 2
  extraData?: unknown
  onLayout?: (event: LayoutChangeEvent) => void
}) {
  const { palette } = useTheme()
  const { gutter, onLayout: measure } = useContentLayout()
  const initialLoading = source.loading && source.data === undefined
  const failed = source.error !== undefined && (source.data === undefined || source.data.length === 0)
  const banner = (source.error !== undefined && !failed) || source.stale === true
  const content = initialLoading ? <RowsSkeleton label={loadingLabel} lines={skeletonLines} />
    : failed ? (
      <EmptyState
        title={failureTitle}
        description={source.error ?? "The desktop did not answer."}
        icon={<CloudOff size={25} color={palette.danger} />}
        action={<ActionButton variant="secondary" label="Try again" loading={source.loading} onPress={() => { haptic("selection"); void source.reload() }} />}
      />
    ) : empty
  return (
    <SectionList<T, RowSection<T>>
      onLayout={(event) => { measure(event); onLayout?.(event) }}
      style={{ flex: 1 }}
      sections={sections as RowSection<T>[]}
      keyExtractor={keyExtractor}
      extraData={extraData}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 16, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={source.loading && source.data !== undefined} onRefresh={() => void source.reload()} tintColor={palette.muted} />}
      ListHeaderComponent={header || banner ? (
        <View style={{ gap: 8, paddingBottom: 4 }}>
          {header}
          {banner ? (
            <ErrorBanner
              message={source.stale ? "The desktop is out of reach. Showing the copy saved on this phone." : source.error ?? ""}
              actionLabel="Try again"
              onAction={() => void source.reload()}
            />
          ) : null}
        </View>
      ) : null}
      ListEmptyComponent={<>{content}</>}
      renderSectionHeader={({ section }) => section.title ? <SectionTitle first={sections[0] === section}>{section.title}</SectionTitle> : null}
      ItemSeparatorComponent={() => <RowSeparator />}
      renderItem={({ item }: ListRenderItemInfo<T>) => <>{renderRow(item)}</>}
    />
  )
}
