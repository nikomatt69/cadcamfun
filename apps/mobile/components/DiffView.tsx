import { Fragment, useState } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import { ChevronRight, Minus, Plus, SquarePen } from "lucide-react-native"
import type { EntityChange } from "@cadcamfun/api"
import { SurfaceCard } from "./ui/SurfaceCard"
import { BottomSheet } from "./ui/BottomSheet"
import { PressableScale } from "./ui/PressableScale"
import { Pill, type PillTone } from "./ui/Pill"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"

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

function PropertyRow({ change, onOpen }: { change: PropertyChange; onOpen: () => void }) {
  const { palette } = useTheme()
  return <PressableScale subtle tint onPress={onOpen} accessibilityLabel={`Inspect change to ${pointerLabel(change.pointer)}`}
    style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6, minHeight: 44 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ flex: 1, minWidth: 0, color: palette.soft, fontSize: 13, lineHeight: 20, fontWeight: "600" }}>{pointerLabel(change.pointer)}</Text>
      <ChevronRight size={14} color={palette.muted} />
    </View>
    {change.before !== undefined ? <Text style={{ color: palette.danger, fontFamily: "Menlo", fontSize: 12, lineHeight: 19 }} numberOfLines={3}>− {valueText(change.before)}</Text> : null}
    {change.after !== undefined ? <Text style={{ color: palette.success, fontFamily: "Menlo", fontSize: 12, lineHeight: 19 }} numberOfLines={3}>+ {valueText(change.after)}</Text> : null}
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
          <Text selectable style={{ color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: "600" }}>{change.name || change.id || change.path.split("/").pop() || change.path}</Text>
          <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 19 }}>{change.path}</Text>
        </View>
        {fontScale <= 1.3 ? <Pill tone={status.tone}>{status.label}</Pill> : null}
      </View>
      {fontScale > 1.3 ? <Pill tone={status.tone}>{status.label}</Pill> : null}
    </View>
    {change.changes.length ? change.changes.map((property, index) => <Fragment key={index}>
      <View style={{ height: 0.5, marginHorizontal: 16, backgroundColor: palette.border }} />
      <PropertyRow change={property} onOpen={() => onOpen(property)} />
    </Fragment>) : <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 16 }}>{change.status === "added" ? "New file" : change.status === "deleted" ? "File removed" : "No property-level changes"}</Text>}
  </SurfaceCard>
}

/** A compact diff previews values; the native detail sheet keeps the complete change inspectable. */
export function DiffView({ changes }: { changes: readonly EntityChange[] }) {
  const { palette } = useTheme()
  const [selected, setSelected] = useState<PropertyChange | null>(null)
  return <>
    <View style={{ gap: 12 }}>{changes.map((change, index) => <EntityCard key={`${change.path}-${index}`} change={change}
      onOpen={(property) => { haptic("selection"); setSelected(property) }} />)}</View>
    <BottomSheet open={selected !== null} onClose={() => setSelected(null)} title="Change details">
      {selected ? <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Text selectable style={{ color: palette.soft, fontSize: 15, lineHeight: 22 }}>{pointerLabel(selected.pointer)}</Text>
        {[{ label: "Before", value: selected.before, color: palette.danger }, { label: "After", value: selected.after, color: palette.success }].map(({ label, value, color }) => <SurfaceCard key={label}>
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={{ color, fontSize: 15, fontWeight: "600" }}>{label}</Text>
            <Text selectable style={{ color: palette.ink, fontFamily: "Menlo", fontSize: 13, lineHeight: 21 }}>{valueText(value, true)}</Text>
          </View>
        </SurfaceCard>)}
      </View> : null}
    </BottomSheet>
  </>
}
