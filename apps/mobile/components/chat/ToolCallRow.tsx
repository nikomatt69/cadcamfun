import { memo, useState } from "react"
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Box, Check, CircleGauge, Copy, GitPullRequest, Route, Workflow, Wrench, X, type LucideIcon } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { PressableScale } from "@/components/ui/PressableScale"
import type { ChatRow } from "@/lib/chat-log"
import { useCopiedFeedback } from "@/hooks/use-copied-feedback"
import { layout } from "@/lib/layout"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { DisclosureChevron, Reveal } from "./disclosure"

/**
 * A muted row showing the assistant working — vcs_start_change, cad_*, cam_* tool calls. Watching
 * the assistant act is the feedback loop (Apple §13 causality: the row appears at the causal
 * moment, and the tool that changed state is the one the user reads).
 */
function toolIdentity(raw: string | undefined, label: string): { icon: LucideIcon; category: string; title: string } {
  const value = (raw ?? label).toLowerCase()
  const title = label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  if (value.startsWith("cad_")) return { icon: Box, category: "CAD", title }
  if (value.startsWith("cam_") || value.includes("toolpath") || value.includes("gcode")) return { icon: Route, category: "CAM", title }
  if (value.startsWith("vcs_") || value.includes("pull_request")) return { icon: GitPullRequest, category: "VERSION CONTROL", title }
  if (value.startsWith("actions_") || value.includes("workflow")) return { icon: Workflow, category: "ACTIONS", title }
  if (value.includes("verify") || value.includes("analy")) return { icon: CircleGauge, category: "ANALYSIS", title }
  return { icon: Wrench, category: "TOOL", title }
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
  const { palette } = useTheme()
  const { width, height } = useWindowDimensions()
  const [shown, setShown] = useState<string | null>(null)
  const name = tool.replaceAll("_", " ")
  return <>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {images.map((uri, index) => <Pressable key={index} onPress={() => { haptic("selection"); setShown(uri) }}
        accessibilityRole="imagebutton" accessibilityLabel={`Render from ${name}${images.length > 1 ? `, ${index + 1} of ${images.length}` : ""}`} accessibilityHint="Opens the image full screen"
        style={({ pressed }) => ({ flex: 1, maxWidth: images.length === 1 ? 320 : undefined, aspectRatio: 4 / 3, borderRadius: 12, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, backgroundColor: palette.panel, opacity: pressed ? 0.85 : 1 })}>
        <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
      </Pressable>)}
    </View>
    <Modal visible={shown !== null} animationType="fade" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={() => setShown(null)}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: layout.touchTarget + 8, paddingLeft: 20, paddingRight: 8 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "600" }}>{name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={() => setShown(null)}
            style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
        {/* iOS pinch-zooms a ScrollView natively; a double tap is not needed to read a render. */}
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          {shown ? <Image source={{ uri: shown }} resizeMode="contain" accessibilityLabel={`Render from ${name}`} style={{ width, height: height * 0.8 }} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>
}

export const ToolCallRow = memo(function ToolCallRow({ row }: { row: Extract<ChatRow, { kind: "tool" }> }) {
  const { palette, isDark } = useTheme()
  const [open, setOpen] = useState(false)
  const { copied, error: copyError, copy } = useCopiedFeedback()
  const identity = toolIdentity(row.rawTool, row.tool)
  const Icon = identity.icon
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
          <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8 }}>{row.agent ? `${identity.category} · ${row.agent.toUpperCase()}` : identity.category}</Text>
          <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" }}>{identity.title}</Text>
        </View>
        {row.ok === null ? <ActivityIndicator size="small" color={statusColor} /> : row.ok ? <Check size={16} color={statusColor} /> : <X size={16} color={statusColor} />}
        {hasDetails ? <DisclosureChevron open={open} color={palette.muted} /> : null}
      </PressableScale>

      {row.images?.length ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><ToolImages images={row.images} tool={row.tool} /></View> : null}

      {open ? (
        <Reveal style={{ gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hexToRgba(palette.ink, 0.09), padding: 12 }}>
          {row.diagnostic ? (
            <View style={{ gap: 4, borderRadius: 13, borderCurve: "continuous", backgroundColor: hexToRgba(row.diagnostic.severity === "error" ? palette.danger : palette.warning, 0.1), padding: 11 }}>
              <Text selectable style={{ color: palette.ink, fontSize: 14, lineHeight: 21, fontWeight: "600" }}>{row.diagnostic.message}</Text>
              {row.diagnostic.recovery ? <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 17 }}>{row.diagnostic.recovery}</Text> : null}
            </View>
          ) : null}
          {row.input !== undefined ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8 }}>INPUT</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text selectable style={{ color: palette.soft, fontFamily: "Menlo", fontSize: 12, lineHeight: 19 }}>{stringify(row.input)}</Text>
              </ScrollView>
            </View>
          ) : null}
          {row.output ? (
            <View style={{ gap: 6 }}>
              {copyError ? <ErrorBanner message={copyError} /> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ flexShrink: 1, color: palette.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8 }}>OUTPUT</Text>
                <PressableScale onPress={() => void copyOutput()} subtle accessibilityRole="button" accessibilityLabel={copied ? "Tool output copied" : "Copy tool output"} style={{ minHeight: layout.touchTarget, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 }}>
                  <Copy size={12} color={palette.muted} />
                  <Text style={{ color: palette.soft, fontSize: 12, lineHeight: 18, fontWeight: "600" }}>{copied ? "Copied" : "Copy"}</Text>
                </PressableScale>
              </View>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text selectable style={{ color: row.ok === false ? palette.ink : palette.soft, fontFamily: "Menlo", fontSize: 12, lineHeight: 19 }}>{row.output}</Text>
              </ScrollView>
            </View>
          ) : null}
        </Reveal>
      ) : null}
    </View>
  )
})
