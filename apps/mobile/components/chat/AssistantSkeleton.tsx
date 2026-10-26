import { View, type DimensionValue } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { Skeleton } from "@/components/ui/Skeleton"

/** A prompt of the person's own: a right-aligned bubble holding two lines. */
function PromptSkeleton({ width }: { width: DimensionValue }) {
  const { palette, isDark } = useTheme()
  return (
    <View style={{ width: "100%", alignItems: "flex-end" }}>
      <View style={{ width, maxWidth: "82%", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderCurve: "continuous", backgroundColor: hexToRgba(palette.ink, isDark ? 0.14 : 0.08) }}>
        <Skeleton style={{ height: 12, borderRadius: 6 }} />
        <Skeleton style={{ height: 12, width: "62%", borderRadius: 6 }} />
      </View>
    </View>
  )
}

/** The assistant's reply: bare lines of text, the way answers are drawn in the transcript. */
function ReplySkeleton() {
  return (
    <View style={{ width: "100%", gap: 8, paddingHorizontal: 2 }}>
      <Skeleton style={{ height: 12, width: "92%", borderRadius: 6 }} />
      <Skeleton style={{ height: 12, width: "78%", borderRadius: 6 }} />
      <Skeleton style={{ height: 12, width: "64%", borderRadius: 6 }} />
    </View>
  )
}

/**
 * The first read of a stored conversation (nikcli's SessionDetailSkeleton, in the transcript's shape).
 * It is bottom-anchored like the real transcript, so the rows do not jump when the past arrives.
 * One labelled element for VoiceOver; the bars themselves are hidden from it.
 */
export function AssistantSkeleton({ gutter }: { gutter: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the conversation"
      accessibilityLiveRegion="polite"
      style={{ flex: 1, justifyContent: "flex-end", gap: 18, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 16, overflow: "hidden" }}
    >
      <PromptSkeleton width="46%" />
      <ReplySkeleton />
      <PromptSkeleton width="30%" />
      <ReplySkeleton />
      <PromptSkeleton width="38%" />
    </View>
  )
}
