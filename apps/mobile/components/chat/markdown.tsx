import { memo, useMemo, useState, type ReactNode } from "react"
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from "react-native"
import { Check, Copy, Share2, Square, SquareCheck } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import type { Palette } from "@/lib/palette"
import { haptic } from "@/lib/haptics"
import { caps, mono, type as typeStyle } from "@/lib/typography"
import { toast } from "@/components/ui/ToastHost"
import { useCopiedFeedback } from "@/hooks/use-copied-feedback"
import { codeLineCount, inlineText, parseMarkdown, type Align, type Block, type Inline, type ListItem } from "@/lib/markdown"
import { highlightCode, languageOf, type TokenKind } from "@/lib/code-highlight"
import * as Clipboard from "expo-clipboard"

/**
 * The assistant's prose (nikcli: react-native-markdown-display) drawn from lib/markdown's blocks.
 *
 * Every block is its own memoized component keyed by its source text, so while an answer streams only the block being
 * written re-renders. Text is selectable per block; links open in the system browser and a long press copies them;
 * code scrolls sideways instead of wrapping (G-code and JSON lose their shape when wrapped) and copies whole.
 */

const BODY = 17

/** The collapsed height of a long code block, and the most lines drawn at once (the whole text is still copied). */
const CODE_COLLAPSED_LINES = 12
const CODE_MAX_LINES = 300

interface Ctx {
  readonly palette: Palette
  readonly isDark: boolean
  readonly selectable: boolean
}

function openLink(href: string) {
  haptic("selection")
  void Linking.openURL(href).catch(() => toast("Could not open the link", "error"))
}

function copyLink(href: string) {
  haptic("selection")
  Clipboard.setStringAsync(href).then(() => toast("Link copied", "success"), () => toast("Could not copy the link", "error"))
}

/** Inline content as nested <Text>: formatting nests, so a bold link inside italics keeps both. */
function renderInline(nodes: readonly Inline[], ctx: Ctx, key = ""): ReactNode[] {
  const { palette, isDark } = ctx
  return nodes.map((node, index) => {
    const k = `${key}${index}`
    switch (node.t) {
      case "text": return node.v
      case "br": return "\n"
      case "strong": return <Text key={k} style={{ fontWeight: "700" }}>{renderInline(node.c, ctx, `${k}.`)}</Text>
      case "em": return <Text key={k} style={{ fontStyle: "italic" }}>{renderInline(node.c, ctx, `${k}.`)}</Text>
      case "del": return <Text key={k} style={{ textDecorationLine: "line-through", color: palette.muted }}>{renderInline(node.c, ctx, `${k}.`)}</Text>
      case "code":
        return <Text key={k} style={{ ...mono(BODY - 2.5), color: palette.ink, backgroundColor: hexToRgba(palette.ink, isDark ? 0.14 : 0.08) }}>{node.v}</Text>
      case "link":
        return (
          <Text key={k} accessibilityRole="link" accessibilityHint="Opens the link. Long press copies it" onPress={() => openLink(node.href)} onLongPress={() => copyLink(node.href)}
            style={{ color: palette.accent, textDecorationLine: "underline" }}>
            {renderInline(node.c, ctx, `${k}.`)}
          </Text>
        )
    }
  })
}

const HEADING_STYLE: Record<number, { size: number; weight: TextStyle["fontWeight"]; top: number }> = {
  1: { size: 22, weight: "700", top: 8 },
  2: { size: 20, weight: "700", top: 6 },
  3: { size: 18, weight: "700", top: 4 },
  4: { size: 17, weight: "700", top: 2 },
  5: { size: 17, weight: "600", top: 2 },
  6: { size: 15, weight: "600", top: 2 },
}

/* ---------------------------------------------------------------------------------------------- code */

function tokenColor(kind: TokenKind, palette: Palette): string {
  switch (kind) {
    case "comment": return palette.muted
    case "command": return palette.accent
    case "motion": return palette.warning
    case "feed": return palette.success
    case "param": return palette.info
    case "number": return palette.info
    case "string": return palette.success
    case "key": return palette.accent
    case "keyword": return palette.warning
    case "punct": return palette.muted
    case "plain": return palette.ink
  }
}

/** A fenced block: language and size on top with Copy and Share, the code below scrolling sideways. */
const CodeFence = memo(function CodeFence({ block, selectable }: { block: Extract<Block, { t: "code" }>; selectable: boolean }) {
  const { palette, isDark } = useTheme()
  const { copied, copy } = useCopiedFeedback(2000)
  const [expanded, setExpanded] = useState(false)
  const lines = codeLineCount(block.v)
  const long = lines > CODE_COLLAPSED_LINES
  const shown = expanded ? CODE_MAX_LINES : CODE_COLLAPSED_LINES
  const language = languageOf(block.lang, block.v)
  const visible = useMemo(() => {
    const text = long ? block.v.split("\n").slice(0, shown).join("\n") : block.v
    return highlightCode(language, text)
  }, [block.v, language, long, shown])
  const label = block.lang || (language === "gcode" ? "gcode" : "code")
  const hidden = Math.max(0, lines - shown)

  const onCopy = async () => {
    if (await copy(block.v)) haptic("success")
  }

  return (
    <View style={{ borderRadius: 14, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, backgroundColor: hexToRgba(palette.ink, isDark ? 0.07 : 0.045) }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 4, minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.accent, ...caps(10, { weight: "700" }) }}>{label}</Text>
        <Text style={{ flex: 1, color: palette.muted, ...typeStyle(11), fontVariant: ["tabular-nums"] }}>{lines} {lines === 1 ? "line" : "lines"}</Text>
        <Pressable onPress={() => void onCopy()} hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="button" accessibilityLabel={copied ? "Code copied" : `Copy ${label} code`}
          style={({ pressed }) => ({ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: 18, borderCurve: "continuous", backgroundColor: copied ? hexToRgba(palette.success, 0.16) : hexToRgba(palette.ink, pressed ? 0.12 : 0.07) })}>
          {copied ? <Check size={12} color={palette.success} /> : <Copy size={12} color={palette.soft} />}
          <Text style={{ color: copied ? palette.success : palette.soft, ...typeStyle(12, { weight: "600" }) }}>{copied ? "Copied" : "Copy"}</Text>
        </Pressable>
        <Pressable onPress={() => { haptic("selection"); void Share.share({ message: block.v }).catch(() => undefined) }} accessibilityRole="button" accessibilityLabel={`Share ${label} code`}
          style={({ pressed }) => ({ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: hexToRgba(palette.ink, pressed ? 0.12 : 0.07) })}>
          <Share2 size={13} color={palette.soft} />
        </Pressable>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text selectable={selectable} maxFontSizeMultiplier={1.6} style={{ ...mono(12.5) }}>
          {visible.map((line, lineIndex) => (
            <Text key={lineIndex}>
              {line.map((token, tokenIndex) => <Text key={tokenIndex} style={{ color: tokenColor(token.kind, palette) }}>{token.text}</Text>)}
              {lineIndex < visible.length - 1 ? "\n" : ""}
            </Text>
          ))}
        </Text>
      </ScrollView>
      {long ? (
        <Pressable onPress={() => { haptic("selection"); setExpanded((value) => !value) }} accessibilityRole="button" accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Show fewer lines" : `Show ${Math.min(lines, CODE_MAX_LINES) - CODE_COLLAPSED_LINES} more lines`}
          style={({ pressed }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: pressed ? hexToRgba(palette.ink, 0.05) : "transparent" })}>
          <Text style={{ color: palette.accent, ...typeStyle(12, { weight: "600" }) }}>
            {expanded ? "Show less" : `Show ${Math.min(lines, CODE_MAX_LINES) - CODE_COLLAPSED_LINES} more lines`}
          </Text>
          {expanded && hidden > 0 ? <Text style={{ color: palette.muted, ...typeStyle(11) }}>The first {CODE_MAX_LINES} of {lines} lines are shown; Copy takes all of it.</Text> : null}
        </Pressable>
      ) : null}
    </View>
  )
}, (prev, next) => prev.block.raw === next.block.raw && prev.selectable === next.selectable)

/* ------------------------------------------------------------------------------------------------ table */

const CELL_MIN = 72
const CELL_MAX = 220

function Table({ block, ctx }: { block: Extract<Block, { t: "table" }>; ctx: Ctx }) {
  const { palette, isDark } = ctx
  const { fontScale } = useWindowDimensions()
  const widths = block.head.map((head, column) => {
    const longest = Math.max(inlineText(head).length, ...block.rows.map((row) => inlineText(row[column] ?? []).length))
    return Math.round(Math.min(CELL_MAX, Math.max(CELL_MIN, longest * 8 + 24)) * Math.min(fontScale, 1.4))
  })
  const alignOf = (align: Align): TextStyle["textAlign"] => align
  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderRadius: 12, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border }}>
      <View>
        {[block.head, ...block.rows].map((row, rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: "row", backgroundColor: rowIndex === 0 ? hexToRgba(palette.ink, isDark ? 0.09 : 0.05) : "transparent", borderTopWidth: rowIndex === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
            {row.map((cell, column) => (
              <View key={column} style={{ width: widths[column], paddingHorizontal: 10, paddingVertical: 8, borderLeftWidth: column === 0 ? 0 : StyleSheet.hairlineWidth, borderLeftColor: palette.border }}>
                <Text selectable={ctx.selectable} accessibilityRole={rowIndex === 0 ? "header" : undefined}
                  style={{ color: rowIndex === 0 ? palette.ink : palette.soft, textAlign: alignOf(block.align[column] ?? "left"), ...typeStyle(14, { weight: rowIndex === 0 ? "600" : "400" }) }}>
                  {renderInline(cell, ctx, `c${rowIndex}.${column}.`)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

/* ------------------------------------------------------------------------------------------------ blocks */

function ListView({ block, ctx, depth }: { block: Extract<Block, { t: "list" }>; ctx: Ctx; depth: number }) {
  const { palette } = ctx
  const { fontScale } = useWindowDimensions()
  const last = block.start + block.items.length - 1
  const markerWidth = block.ordered ? Math.max(22, String(last).length * 10 + 12) : 16
  return (
    <View style={{ gap: 5 }}>
      {block.items.map((item: ListItem, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ width: markerWidth, minHeight: Math.round((typeStyle(BODY).lineHeight ?? 22) * fontScale), alignItems: item.checked === undefined && !block.ordered ? "center" : "flex-start", justifyContent: "center", marginRight: 4 }}>
            {item.checked !== undefined ? (item.checked ? <SquareCheck size={16} color={palette.success} /> : <Square size={16} color={palette.muted} />)
              : <Text accessibilityElementsHidden={!block.ordered} importantForAccessibility={block.ordered ? "auto" : "no"} style={{ color: palette.accent, fontVariant: ["tabular-nums"], ...typeStyle(BODY, { weight: block.ordered ? "600" : "700" }) }}>{block.ordered ? `${block.start + index}.` : depth === 0 ? "•" : "–"}</Text>}
          </View>
          <View accessible={false} style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {item.blocks.map((child, childIndex) => <BlockView key={childIndex} block={child} ctx={ctx} depth={depth + 1} />)}
          </View>
        </View>
      ))}
    </View>
  )
}

const BlockView = memo(function BlockView({ block, ctx, depth = 0 }: { block: Block; ctx: Ctx; depth?: number }) {
  const { palette } = ctx
  switch (block.t) {
    case "p":
      return <Text selectable={ctx.selectable} style={{ color: palette.ink, ...typeStyle(BODY, { leadingScale: 1.04 }) }}>{renderInline(block.c, ctx)}</Text>
    case "h": {
      const heading = HEADING_STYLE[block.level]!
      return (
        <Text accessibilityRole="header" selectable={ctx.selectable} style={{ marginTop: depth === 0 ? heading.top : 0, color: block.level === 6 ? palette.muted : palette.ink, ...typeStyle(heading.size, { weight: heading.weight }) }}>
          {renderInline(block.c, ctx)}
        </Text>
      )
    }
    case "code":
      return <CodeFence block={block} selectable={ctx.selectable} />
    case "list":
      return <ListView block={block} ctx={ctx} depth={depth} />
    case "quote":
      return (
        <View style={{ gap: 6, paddingLeft: 12, paddingRight: 8, paddingVertical: 6, borderLeftWidth: 3, borderLeftColor: palette.accent, borderRadius: 4, backgroundColor: hexToRgba(palette.accent, 0.06) }}>
          {block.blocks.map((child, index) => <BlockView key={index} block={child} ctx={ctx} depth={depth + 1} />)}
        </View>
      )
    case "hr":
      return <View accessibilityElementsHidden importantForAccessibility="no" style={{ height: StyleSheet.hairlineWidth, marginVertical: 6, backgroundColor: palette.border }} />
    case "table":
      return <Table block={block} ctx={ctx} />
  }
}, (prev, next) => prev.block.raw === next.block.raw && prev.depth === next.depth && prev.ctx.palette === next.ctx.palette && prev.ctx.selectable === next.ctx.selectable)

/**
 * The answer's prose. `selectable` is false while the bubble shows its action chips, so a long press selects nothing
 * underneath them.
 */
export const Markdown = memo(function Markdown({ text, selectable = true }: { text: string; selectable?: boolean }) {
  const { palette, isDark } = useTheme()
  const blocks = useMemo(() => parseMarkdown(text), [text])
  const ctx = useMemo<Ctx>(() => ({ palette, isDark, selectable }), [palette, isDark, selectable])
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) => <BlockView key={index} block={block} ctx={ctx} />)}
    </View>
  )
})
