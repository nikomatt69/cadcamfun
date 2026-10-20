import { Fragment, useMemo, useState } from "react"
import { StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { ChevronRight, Minus, Plus, SquarePen } from "lucide-react-native"
import type { EntityChange } from "@cadcamfun/api"
import { SurfaceCard } from "./ui/SurfaceCard"
import { BottomSheet } from "./ui/BottomSheet"
import { PressableScale } from "./ui/PressableScale"
import { Pill, type PillTone } from "./ui/Pill"
import { hexToRgba, useTheme } from "@/lib/theme"
import { mono, type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { diffSummary, filterChanges, formatDiffSummary, type ChangeFilter } from "@/lib/workspace-filter"
import { FilterChips } from "./ui/FilterChips"

type PropertyChange = EntityChange["changes"][number]
const STATUS_PILL: Record<EntityChange["status"], { tone: PillTone; label: string }> = {
  added: { tone: "success", label: "Added" }, modified: { tone: "accent", label: "Modified" }, deleted: { tone: "danger", label: "Deleted" },
}
const pointerLabel = (pointer: string): string => pointer.replace(/^\/+/, "").replaceAll("/", " › ") || "Value"
function valueText(value: unknown, full = false): string {
  if (value === undefined) return "Not present"
  let text: string
  try { text = typeof value === "string" ? value : JSON.stringify(value, null, full ? 2 : undefined) ?? String(value) }
  catch { text = "This value could not be displayed." }
  if (text === "") return '""'
  return !full && text.length > 160 ? `${text.slice(0, 160)}…` : text
}

/** A removed or added value on its own tinted line: the sign and the tint carry the meaning, not the hue alone. */
function DiffLine({ sign, color, text, lines }: { sign: "−" | "+"; color: string; text: string; lines?: number }) {
  return <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderCurve: "continuous", backgroundColor: hexToRgba(color, 0.08) }}>
    <Text accessibilityElementsHidden importantForAccessibility="no" style={{ width: 10, color, ...mono(12, { weight: "700" }) }}>{sign}</Text>
    <Text accessibilityLabel={`${sign === "−" ? "Before" : "After"}: ${text}`} numberOfLines={lines} style={{ flex: 1, minWidth: 0, color, ...mono(12) }}>{text}</Text>
  </View>
}

function PropertyRow({ change, onOpen }: { change: PropertyChange; onOpen: () => void }) {
  const { palette } = useTheme()
  return <PressableScale subtle tint onPress={onOpen} accessibilityLabel={`Inspect change to ${pointerLabel(change.pointer)}`}
    style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6, minHeight: 44 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: palette.soft, ...type(13, { weight: "600" }) }}>{pointerLabel(change.pointer)}</Text>
      <ChevronRight size={14} color={palette.muted} />
    </View>
    {change.before !== undefined ? <DiffLine sign="−" color={palette.danger} text={valueText(change.before)} lines={3} /> : null}
    {change.after !== undefined ? <DiffLine sign="+" color={palette.success} text={valueText(change.after)} lines={3} /> : null}
  </PressableScale>
}
function EntityCard({ change, onOpen }: { change: EntityChange; onOpen: (property: PropertyChange) => void }) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const status = STATUS_PILL[change.status]
  const Glyph = change.status === "added" ? Plus : change.status === "deleted" ? Minus : SquarePen
  const color = change.status === "added" ? palette.success : change.status === "deleted" ? palette.danger : palette.accent
  return <SurfaceCard inset={false}>
    <View style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Glyph size={18} color={color} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text selectable numberOfLines={fontScale > 1.3 ? undefined : 2} style={{ color: palette.ink, ...type(16, { weight: "600" }) }}>{change.name || change.id || change.path.split("/").pop() || change.path}</Text>
          <Text selectable numberOfLines={fontScale > 1.3 ? undefined : 2} ellipsizeMode="middle" style={{ color: palette.muted, ...mono(12) }}>{change.path}</Text>
        </View>
        {fontScale <= 1.3 ? <Pill tone={status.tone}>{status.label}</Pill> : null}
      </View>
      {fontScale > 1.3 ? <Pill tone={status.tone}>{status.label}</Pill> : null}
    </View>
    {change.changes.length ? change.changes.map((property, index) => <Fragment key={index}>
      <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: palette.border }} />
      <PropertyRow change={property} onOpen={() => onOpen(property)} />
    </Fragment>) : <Text style={{ color: palette.muted, paddingHorizontal: 16, paddingBottom: 16, ...type(13) }}>{change.status === "added" ? "New file" : change.status === "deleted" ? "File removed" : "No property-level changes"}</Text>}
  </SurfaceCard>
}

/** A compact diff previews values; the native detail sheet keeps the complete change inspectable. */
export function DiffView({ changes }: { changes: readonly EntityChange[] }) {
  const { palette } = useTheme()
  const [selected, setSelected] = useState<PropertyChange | null>(null)
  const [filter, setFilter] = useState<ChangeFilter>("all")
  const summary = useMemo(() => diffSummary(changes), [changes])
  const visible = filterChanges(changes, filter)
  // Filters only help once a change touches more than one kind of file.
  const kinds = [summary.added, summary.modified, summary.deleted].filter((count) => count > 0).length
  const options = [
    { id: "all" as const, label: "All" },
    ...(summary.added ? [{ id: "added" as const, label: "Added" }] : []),
    ...(summary.modified ? [{ id: "modified" as const, label: "Modified" }] : []),
    ...(summary.deleted ? [{ id: "deleted" as const, label: "Deleted" }] : []),
  ]
  return <>
    <View style={{ gap: 12 }}>
      <Text selectable accessibilityRole="summary" style={{ color: palette.soft, fontVariant: ["tabular-nums"], ...type(13) }}>{formatDiffSummary(summary)}</Text>
      {kinds > 1 ? <FilterChips options={options} value={filter} onChange={setFilter}
        counts={{ all: summary.files, added: summary.added, modified: summary.modified, deleted: summary.deleted }} accessibilityLabel="Filter changes" /> : null}
      {visible.map((change, index) => <EntityCard key={`${change.path}-${index}`} change={change}
        onOpen={(property) => { haptic("selection"); setSelected(property) }} />)}
    </View>
    <BottomSheet open={selected !== null} onClose={() => setSelected(null)} title="Change details">
      {selected ? <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Text selectable accessibilityRole="header" style={{ color: palette.soft, ...type(15) }}>{pointerLabel(selected.pointer)}</Text>
        {[{ label: "Before", value: selected.before, color: palette.danger }, { label: "After", value: selected.after, color: palette.success }].map(({ label, value, color }) => <SurfaceCard key={label}>
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={{ color, ...type(15, { weight: "600" }) }}>{label}</Text>
            <Text selectable style={{ color: palette.ink, ...mono(13) }}>{valueText(value, true)}</Text>
          </View>
        </SurfaceCard>)}
      </View> : null}
    </BottomSheet>
  </>
}
