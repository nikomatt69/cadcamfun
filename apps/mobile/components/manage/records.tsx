import { useMemo, type ReactNode } from "react"
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions, type ListRenderItem } from "react-native"
import { CloudOff, type LucideIcon } from "lucide-react-native"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ActionButton } from "@/components/ui/ActionButton"
import { Skeleton } from "@/components/ui/Skeleton"
import { useContentLayout } from "@/components/layout/use-content-layout"

/**
 * The flat record list the settings screens share (organizations, resources, cost records): rows on the page
 * with a hairline between them, a skeleton shaped like the rows while the first answer loads, and one
 * place that decides between rows, an empty state, an error with a retry and the "saved copy" banner.
 * It is the conversations list's anatomy, for lists that are not grouped by day.
 */

/** Left edge of a row's text: 4pt padding, the 28pt glyph slot and a 12pt gap. */
export const ROW_TEXT_INSET = 4 + 28 + 12

/** A hairline that starts at the row's text, like the conversations list. */
export function RowSeparator({ inset = ROW_TEXT_INSET }: { inset?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: hexToRgba(palette.ink, 0.12) }} />
}

/** A muted heading over a group of rows (the day headings of the conversations list). */
export function ListHeading({ title, accessory }: { title: string; accessory?: ReactNode }) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 16, paddingBottom: 8, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={{ color: palette.muted, ...type(15, { weight: "500" }) }}>{title}</Text>
      {accessory}
    </View>
  )
}

/** One record: a quiet glyph, a title, a subtitle and a meta line, with an optional trailing element. Press opens, long press offers actions. */
export function RecordRow({ icon: Icon, leading, title, subtitle, meta, trailing, onPress, onLongPress, hint, label }: {
  icon?: LucideIcon
  /** Replaces the glyph (an unread dot, a status). It sits in the same 28pt slot. */
  leading?: ReactNode
  title: string
  subtitle?: string
  meta?: string
  trailing?: ReactNode
  onPress: () => void
  onLongPress?: () => void
  hint?: string
  label?: string
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const wrap = fontScale > 1.3
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      onLongPress={onLongPress ? () => { haptic("selection"); onLongPress() } : undefined}
      delayLongPress={380}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={label ?? [title, subtitle, meta].filter(Boolean).join(". ")}
      accessibilityHint={hint}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 12, borderCurve: "continuous" }}
    >
      <View style={{ width: 28, alignItems: "center", marginTop: 1 }}>
        {leading ?? (Icon ? <Icon size={21} color={palette.soft} strokeWidth={2} /> : null)}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...type(17, { weight: "600" }) }} numberOfLines={wrap ? undefined : 2}>{title}</Text>
        {subtitle ? <Text style={{ color: palette.soft, ...type(14) }} numberOfLines={wrap ? undefined : 2}>{subtitle}</Text> : null}
        {meta ? <Text style={{ color: palette.muted, ...type(13) }} numberOfLines={wrap ? undefined : 1}>{meta}</Text> : null}
      </View>
      {trailing ? <View style={{ flexShrink: 0, maxWidth: "34%", marginTop: 2 }}>{trailing}</View> : null}
    </PressableScale>
  )
}

/** Row-shaped placeholders: a glyph slot, a title and a meta line. */
export function RecordSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <View accessible accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, key) => (
        <View key={key}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4 }}>
            <View style={{ width: 28, alignItems: "center" }}><Skeleton style={{ width: 20, height: 20, borderRadius: 6 }} /></View>
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 17, width: `${72 - key * 7}%`, borderRadius: 6 }} />
              <Skeleton style={{ height: 13, width: "44%", borderRadius: 6 }} />
            </View>
          </View>
          {key < rows - 1 ? <RowSeparator /> : null}
        </View>
      ))}
    </View>
  )
}

interface ListResource<T> {
  readonly data: readonly T[] | undefined
  readonly loading: boolean
  readonly error: string | undefined
  readonly stale?: boolean
  readonly reload: () => Promise<void>
}

/**
 * The list with its states. `empty` is shown when the answer is in and nothing matches; the skeleton, the
 * failed state (an empty state with a retry) and the "saved copy" banner are decided here. Pull to refresh never hides rows.
 */
export function RecordList<T>({ resource, keyExtractor, renderItem, header, empty, noun, footer }: {
  resource: ListResource<T>
  keyExtractor: (item: T) => string
  renderItem: (item: T) => ReactNode
  header?: ReactNode
  empty: ReactNode
  /** Plural noun for the loading and failed states ("organizations"). */
  noun: string
  footer?: ReactNode
}) {
  const { palette } = useTheme()
  const { gutter, onLayout } = useContentLayout()
  const data = resource.data
  const initialLoading = resource.loading && data === undefined
  const failed = resource.error !== undefined && data === undefined
  const render: ListRenderItem<T> = ({ item }) => <>{renderItem(item)}</>
  const banner = useMemo(() => resource.stale
    ? "The desktop is out of reach. Showing the copy saved on this phone."
    : resource.error !== undefined && data !== undefined ? resource.error : undefined, [resource.stale, resource.error, data])
  return (
    <FlatList<T>
      onLayout={onLayout}
      style={{ flex: 1 }}
      data={data ?? []}
      keyExtractor={keyExtractor}
      renderItem={render}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 16, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={resource.loading && data !== undefined} onRefresh={() => void resource.reload()} tintColor={palette.muted} />}
      ListHeaderComponent={header || banner ? (
        <View style={{ gap: 12, paddingBottom: 4 }}>
          {header}
          {banner ? <ErrorBanner message={banner} actionLabel="Try again" onAction={() => void resource.reload()} /> : null}
        </View>
      ) : null}
      ListEmptyComponent={initialLoading ? <RecordSkeleton label={`Loading ${noun}`} /> : failed ? (
        <EmptyState
          title={`Could not load ${noun}`}
          description={resource.error ?? "The desktop did not answer."}
          icon={<CloudOff size={25} color={palette.danger} />}
          action={<ActionButton variant="secondary" label="Try again" loading={resource.loading} onPress={() => void resource.reload()} />}
        />
      ) : <>{empty}</>}
      ItemSeparatorComponent={RowSeparator}
      ListFooterComponent={footer ? <View style={{ paddingTop: 12 }}>{footer}</View> : null}
    />
  )
}
