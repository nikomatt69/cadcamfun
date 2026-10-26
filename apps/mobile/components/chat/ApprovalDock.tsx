import { useEffect, useRef, useState, type ReactNode } from "react"
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated"
import { ArrowRight, ChevronLeft, ChevronRight, HelpCircle, Shield } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { mono, type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import {
  approvalAnnouncement, approvalEyebrow, approvalMore, approvalPosition, currentApproval, decisionAccessibilityLabel, decisionLabels,
  stepApproval, type PendingApproval, type PendingPermission, type PendingQuestion, type PermissionDecision,
} from "@/lib/approval-dock"

// Layout-animation builders live at module scope: building them in render re-creates them on every re-render.
const ENTER = FadeInDown.duration(200).easing(EASE_OUT)
const EXIT = FadeOutDown.duration(140).easing(EASE_OUT)

/** One pill-shaped action. The label shrinks before it wraps, so three of them fit a phone-width card in a row. */
function DockButton({ label, accessibilityLabel, hint, tone, busy, disabled, onPress, icon }: {
  label: string
  accessibilityLabel: string
  hint?: string
  tone: "primary" | "secondary" | "quiet"
  busy?: boolean
  disabled?: boolean
  onPress: () => void
  icon?: ReactNode
}) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const color = tone === "primary" ? palette.onAccent : tone === "secondary" ? palette.accent : palette.soft
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      style={({ pressed }) => ({
        flexGrow: tone === "quiet" ? 0 : 1,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: tone === "quiet" ? 72 : 96,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderCurve: "continuous",
        borderWidth: tone === "primary" ? 0 : 1,
        borderColor: tone === "secondary" ? hexToRgba(palette.accent, 0.4) : hexToRgba(palette.ink, isDark ? 0.18 : 0.16),
        backgroundColor: tone === "primary" ? palette.accent : tone === "secondary" ? hexToRgba(palette.accent, isDark ? 0.16 : 0.09) : hexToRgba(palette.ink, isDark ? 0.06 : 0.04),
        opacity: disabled && !busy ? 0.45 : pressed ? 0.76 : 1,
        transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
      })}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : icon}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, color, ...typeStyle(13, { weight: "700" }) }}>{label}</Text>
    </Pressable>
  )
}

function PagerButton({ direction, label, onPress }: { direction: "previous" | "next"; label: string; onPress: () => void }) {
  const { palette } = useTheme()
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight
  return (
    <Pressable
      onPress={() => { haptic("selection"); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}
    >
      <Icon size={16} color={palette.muted} strokeWidth={2.2} />
    </Pressable>
  )
}

/**
 * Unanswered permission requests and questions, lifted next to the composer (nikcli's ComposerApprovalBar).
 *
 * A permission is decided right here: Allow once, Allow for this session, Deny. A question is answered in its
 * card in the transcript, so "Answer" takes the person there (and "Skip" declines it). The cards in the
 * transcript stay as the record and answer the same requests. When several wait, the pager steps through them.
 */
export function ApprovalDock({ approvals, gutter, onDecide, onSkip, onShow }: {
  approvals: readonly PendingApproval[]
  gutter: number
  onDecide: (requestId: string, decision: PermissionDecision) => Promise<void>
  onSkip: (requestId: string) => Promise<void>
  /** Scrolls the transcript to the card of a question. */
  onShow: (itemId: string) => void
}) {
  const { palette, isDark } = useTheme()
  const { fontScale } = useContentLayout()
  const reduced = usePrefersReducedMotion()
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ requestId: string; message: string } | null>(null)
  const submitting = useRef(false)

  const shown = currentApproval(approvals, selectedId)
  const first = approvals[0]
  const firstKey = first?.requestId
  const count = approvals.length

  // iOS ignores live regions: say once, when the oldest request changes, that the assistant is waiting.
  useEffect(() => {
    if (!first) return
    AccessibilityInfo.announceForAccessibility(approvalAnnouncement(first, count))
    // The request id is the identity; a growing count alone must not re-announce.
  }, [firstKey])

  if (!shown) return null
  const { approval, index } = shown
  const permission = approval.kind === "permission"
  const tint = permission ? palette.warning : palette.accent
  const stacked = fontScale > 1.3
  const error = failure?.requestId === approval.requestId ? failure.message : null
  const position = approvalPosition(index, count)
  const more = approvalMore(approval)

  const run = async (action: string, task: () => Promise<void>, fallback: string) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(action)
    setFailure(null)
    try {
      await task()
    } catch (cause) {
      haptic("error")
      setFailure({ requestId: approval.requestId, message: cause instanceof Error ? cause.message : fallback })
    } finally {
      submitting.current = false
      setBusy(null)
    }
  }
  const decide = (decision: PermissionDecision) => void run(decision, () => onDecide(approval.requestId, decision), "Could not record your decision. Try again.")
  const skip = () => void run("skip", () => onSkip(approval.requestId), "Could not skip the question. Try again.")
  const idle = busy === null

  return (
    <Animated.View
      entering={reduced ? undefined : ENTER}
      exiting={reduced ? undefined : EXIT}
      style={{ marginHorizontal: gutter, marginTop: 4 }}
    >
      <View
        style={{
          borderRadius: 18,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: hexToRgba(tint, isDark ? 0.34 : 0.28),
          backgroundColor: hexToRgba(tint, isDark ? 0.12 : 0.07),
          paddingHorizontal: 14,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 28, height: 28, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 10, borderCurve: "continuous", borderWidth: 1, borderColor: hexToRgba(tint, 0.26), backgroundColor: hexToRgba(tint, 0.12) }}>
            {permission ? <Shield size={14} color={tint} strokeWidth={2.1} /> : <HelpCircle size={14} color={tint} strokeWidth={2.1} />}
          </View>
          <View accessible accessibilityRole="header" accessibilityLabel={`${approvalEyebrow(approval)}. ${approval.title}${position ? `. ${position}` : ""}`} style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={1.4} style={{ color: tint, ...typeStyle(11, { weight: "700", trackingBoost: 0.4 }) }}>{approvalEyebrow(approval)}</Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{approval.title}</Text>
          </View>
          {count > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}>
              <PagerButton direction="previous" label="Previous request" onPress={() => setSelectedId(stepApproval(approvals, index, -1))} />
              <Text accessibilityElementsHidden importantForAccessibility="no" maxFontSizeMultiplier={1.2} style={{ minWidth: 38, textAlign: "center", color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(12, { weight: "600" }) }}>{position}</Text>
              <PagerButton direction="next" label="Next request" onPress={() => setSelectedId(stepApproval(approvals, index, 1))} />
            </View>
          ) : null}
        </View>

        {approval.kind === "permission" && approval.target ? (
          <View style={{ borderRadius: 10, borderCurve: "continuous", paddingHorizontal: 10, paddingVertical: 7, backgroundColor: hexToRgba(palette.ink, isDark ? 0.08 : 0.05) }}>
            <Text selectable numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ color: palette.ink, ...mono(12) }}>{approval.target}</Text>
            {more ? <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 2, color: palette.muted, ...typeStyle(11) }}>{more}</Text> : null}
          </View>
        ) : null}
        {approval.kind === "question" && (approval.prompt || more) ? (
          <Text numberOfLines={3} maxFontSizeMultiplier={1.4} style={{ color: palette.soft, ...typeStyle(13) }}>
            {[approval.prompt, more].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" selectable style={{ color: palette.danger, ...typeStyle(12, { weight: "500" }) }}>{error}</Text> : null}

        {approval.kind === "permission" ? (
          <PermissionActions approval={approval} busy={busy} idle={idle} stacked={stacked} onDecide={decide} />
        ) : (
          <QuestionActions approval={approval} busy={busy} idle={idle} stacked={stacked} onSkip={skip} onShow={() => { haptic("selection"); onShow(approval.itemId) }} />
        )}
      </View>
    </Animated.View>
  )
}

function PermissionActions({ approval, busy, idle, stacked, onDecide }: {
  approval: PendingPermission
  busy: string | null
  idle: boolean
  stacked: boolean
  onDecide: (decision: PermissionDecision) => void
}) {
  // Primary last, as on the card: the thumb lands on it.
  return (
    <View style={{ flexDirection: stacked ? "column-reverse" : "row", alignItems: "stretch", gap: 8 }}>
      <DockButton tone="quiet" label={decisionLabels.reject.short} accessibilityLabel={decisionAccessibilityLabel("reject", approval)} busy={busy === "reject"} disabled={!idle} onPress={() => onDecide("reject")} />
      <DockButton tone="secondary" label={decisionLabels.always.short} accessibilityLabel={decisionAccessibilityLabel("always", approval)} hint="Also allows matching actions until this conversation ends" busy={busy === "always"} disabled={!idle} onPress={() => onDecide("always")} />
      <DockButton tone="primary" label={decisionLabels.once.short} accessibilityLabel={decisionAccessibilityLabel("once", approval)} busy={busy === "once"} disabled={!idle} onPress={() => onDecide("once")} />
    </View>
  )
}

function QuestionActions({ approval, busy, idle, stacked, onSkip, onShow }: {
  approval: PendingQuestion
  busy: string | null
  idle: boolean
  stacked: boolean
  onSkip: () => void
  onShow: () => void
}) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: stacked ? "column-reverse" : "row", alignItems: "stretch", gap: 8 }}>
      <DockButton tone="quiet" label="Skip" accessibilityLabel={`Skip the question: ${approval.title}`} busy={busy === "skip"} disabled={!idle} onPress={onSkip} />
      <DockButton
        tone="primary"
        label="Answer"
        accessibilityLabel={`Answer: ${approval.title}`}
        hint="Scrolls to the question in the conversation"
        disabled={!idle}
        onPress={onShow}
        icon={<ArrowRight size={14} color={palette.onAccent} strokeWidth={2.4} />}
      />
    </View>
  )
}
