import { memo, useMemo, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { Box, Camera, Check, CircleGauge, Copy, FileCode2, Globe, GitPullRequest, Play, Route, Shield, SquareTerminal, Workflow, Wrench, X, type LucideIcon } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import type { ChatRow } from "@/lib/chat-log"
import { useCopiedFeedback } from "@/hooks/use-copied-feedback"
import { layout } from "@/lib/layout"
import { caps, mono, type as typeStyle } from "@/lib/typography"
import { toolIdentity, type ToolIconKey } from "@/lib/tool-identity"
import { clipText } from "@/lib/transcript-rows"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { DisclosureChevron, Reveal } from "./disclosure"
import { ImageThumb, ImageViewer } from "./image-preview"

/**
 * A muted row showing the assistant working — vcs_start_change, cad_*, cam_* tool calls. Watching
 * the assistant act is the feedback loop (Apple §13 causality: the row appears at the causal
 * moment, and the tool that changed state is the one the user reads).
 */
export const TOOL_ICONS: Record<ToolIconKey, LucideIcon> = {
  box: Box, route: Route, git: GitPullRequest, workflow: Workflow, gauge: CircleGauge, wrench: Wrench,
  camera: Camera, code: FileCode2, play: Play, terminal: SquareTerminal, file: FileCode2, globe: Globe, shield: Shield,
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * What a tool rendered (the model from the desktop's viewport). Thumbnails stay visible even when the card is collapsed:
 * seeing the part change is how the user follows a CAD turn from the phone. A tap opens a zoomable full-screen view.
 */
export function ToolImages({ images, tool }: { images: readonly string[]; tool: string }) {
  const [shown, setShown] = useState<{ uri: string; title: string } | null>(null)
  const name = tool.replaceAll("_", " ")
  const single = images.length === 1
  return <>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {images.map((uri, index) => {
        const title = single ? name : `${name} ${index + 1} of ${images.length}`
        return <ImageThumb key={index} uri={uri} label={`Render from ${name}${single ? "" : `, ${index + 1} of ${images.length}`}`} expandGlyph
          badge={single ? undefined : `${index + 1}/${images.length}`}
          onPress={() => { haptic("selection"); setShown({ uri, title }) }}
          style={{ flex: 1, maxWidth: single ? 320 : undefined, aspectRatio: 4 / 3 }} />
      })}
    </View>
    <ImageViewer uri={shown?.uri ?? null} title={shown?.title ?? ""} onClose={() => setShown(null)} />
  </>
}

/**
 * Tool input/output: monospaced, scrolls sideways instead of wrapping (G-code and JSON lose their shape when wrapped)
 * and stops growing at a fixed height so one huge result cannot push the whole transcript away.
 */
function CodeBlock({ text, color }: { text: string; color: string }) {
  const { palette, isDark } = useTheme()
  const [all, setAll] = useState(false)
  const clip = useMemo(() => clipText(text), [text])
  return (
    <View style={{ borderRadius: 12, borderCurve: "continuous", backgroundColor: hexToRgba(palette.ink, isDark ? 0.07 : 0.045), overflow: "hidden" }}>
      <View style={{ maxHeight: 260 }}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 10 }}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
            <Text selectable maxFontSizeMultiplier={1.6} style={{ color, ...mono(12) }}>{all ? text : clip.text}</Text>
          </ScrollView>
        </ScrollView>
      </View>
      {clip.clipped ? (
        <PressableScale subtle tint onPress={() => { haptic("selection"); setAll((value) => !value) }} accessibilityRole="button" accessibilityState={{ expanded: all }}
          accessibilityLabel={all ? "Show less" : `Show all ${clip.total.toLocaleString("en")} characters`}
          style={{ minHeight: layout.touchTarget, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hexToRgba(palette.ink, 0.09) }}>
          <Text style={{ color: palette.accent, ...typeStyle(12, { weight: "600" }) }}>{all ? "Show less" : `Show all (${clip.total.toLocaleString("en")} characters)`}</Text>
        </PressableScale>
      ) : null}
    </View>
  )
}

export const ToolCallRow = memo(function ToolCallRow({ row }: { row: Extract<ChatRow, { kind: "tool" }> }) {
  const { palette, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const { copied, error: copyError, copy } = useCopiedFeedback()
  const { fontScale } = useWindowDimensions()
  const identity = toolIdentity(row.rawTool, row.tool)
  const Icon = TOOL_ICONS[identity.icon]
  const hasDetails = row.input !== undefined || Boolean(row.output) || Boolean(row.diagnostic)
  const statusColor = row.ok === null ? palette.warning : row.ok ? palette.success : palette.danger

  const toggle = () => {
    if (!hasDetails) return
    haptic("selection")
    setOpen((value) => !value)
  }

  const copyOutput = async () => {
    if (!row.output) return
    const success = await copy(row.output)
    if (success) haptic("success")
  }

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 4,
        overflow: "hidden",
        borderRadius: layout.cardRadius,
        borderCurve: "continuous",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: hexToRgba(palette.ink, isDark ? 0.13 : 0.09),
        backgroundColor: hexToRgba(palette.ink, isDark ? 0.055 : 0.035),
      }}
    >
      <PressableScale
        onPress={hasDetails ? toggle : undefined}
        subtle
        tint
        accessible
        accessibilityRole={hasDetails ? "button" : "text"}
        accessibilityState={hasDetails ? { expanded: open } : undefined}
        accessibilityLabel={`${identity.title}, ${row.ok === null ? "running" : row.ok ? "completed" : "failed"}${hasDetails ? ", tool details" : ""}`}
        style={{ minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(statusColor, 0.12) }}>
          <Icon size={17} color={statusColor} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={fontScale > 1.3 ? undefined : 1} style={{ color: palette.muted, ...caps(11, { weight: "700" }) }}>{row.agent ? `${identity.category} · ${row.agent}` : identity.category}</Text>
          <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{identity.title}</Text>
        </View>
        {row.ok === null ? <ActivityIndicator size="small" color={statusColor} /> : row.ok ? <Check size={16} color={statusColor} /> : <X size={16} color={statusColor} />}
        {hasDetails ? <DisclosureChevron open={open} color={palette.muted} /> : null}
      </PressableScale>

      {row.images?.length ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><ToolImages images={row.images} tool={row.tool} /></View> : null}

      {open ? (
        <Reveal style={{ gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hexToRgba(palette.ink, 0.09), padding: 12 }}>
          {row.diagnostic ? (
            <View style={{ gap: 4, borderRadius: 13, borderCurve: "continuous", backgroundColor: hexToRgba(row.diagnostic.severity === "error" ? palette.danger : palette.warning, 0.1), padding: 11 }}>
              <Text selectable style={{ color: palette.ink, ...typeStyle(14, { weight: "600" }) }}>{row.diagnostic.message}</Text>
              {row.diagnostic.recovery ? <Text selectable style={{ color: palette.soft, ...typeStyle(13) }}>{row.diagnostic.recovery}</Text> : null}
            </View>
          ) : null}
          {row.input !== undefined ? (
            <View style={{ gap: 6 }}>
              <Text accessibilityRole="header" style={{ color: palette.muted, ...caps(11, { weight: "700" }) }}>Input</Text>
              <CodeBlock text={stringify(row.input)} color={palette.soft} />
            </View>
          ) : null}
          {row.output ? (
            <View style={{ gap: 6 }}>
              {copyError ? <ErrorBanner message={copyError} /> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.muted, ...caps(11, { weight: "700" }) }}>Output</Text>
                <PressableScale onPress={() => void copyOutput()} subtle accessibilityRole="button" accessibilityLabel={copied ? "Tool output copied" : "Copy tool output"} style={{ minHeight: layout.touchTarget, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 }}>
                  <Copy size={12} color={palette.muted} />
                  <Text style={{ color: palette.soft, ...typeStyle(12, { weight: "600" }) }}>{copied ? "Copied" : "Copy"}</Text>
                </PressableScale>
              </View>
              <CodeBlock text={row.output} color={row.ok === false ? palette.ink : palette.soft} />
            </View>
          ) : null}
        </Reveal>
      ) : null}
    </View>
  )
})
