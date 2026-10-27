import { useState } from "react"
import { Alert, Text, View } from "react-native"
import { Check, Pencil, Trash2 } from "lucide-react-native"
import { assignedTags, deleteTag, saveTag, TAG_COLORS, toggleTag, type ListTag, type TagCollection } from "@/lib/list-tags"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { BottomSheet } from "./BottomSheet"
import { ListRow } from "./ListRow"
import { TextField } from "./TextField"
import { ActionButton } from "./ActionButton"
import { PressableScale } from "./PressableScale"
import { DividedRows, SheetSection } from "@/components/chat/sheet-parts"

export function TagBadges({ collection, target }: { collection: TagCollection; target: string }) {
  const tags = assignedTags(collection, target)
  if (!tags.length) return null
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}</View>
}
function TagBadge({ tag }: { tag: ListTag }) {
  const { palette } = useTheme()
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8, backgroundColor: hexToRgba(tag.color, 0.13) }}><Dot color={tag.color} /><Text style={{ color: palette.ink, ...type(12) }}>{tag.name}</Text></View>
}
function Dot({ color }: { color: string }) { return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> }

export function TagFilter({ collection, value, onChange, onManage }: { collection: TagCollection; value: string | null; onChange: (value: string | null) => void; onManage: () => void }) {
  const { palette } = useTheme()
  return <SheetSection title="Tags" footer="Tags are saved on this phone, separately for each desktop and account.">
    <DividedRows>{[{ id: null, name: "All tags", color: palette.muted }, { id: "untagged", name: "Untagged", color: palette.muted }, ...collection.tags].map((tag) => <ListRow key={tag.id ?? "all"} title={tag.name} leading={<Dot color={tag.color} />} selected={value === tag.id} showChevron={false} trailing={value === tag.id ? <Check size={18} color={palette.ink} /> : undefined} onPress={() => onChange(tag.id)} />)}</DividedRows>
    <ActionButton variant="secondary" label="Manage tags" onPress={onManage} />
  </SheetSection>
}

export function TagSheet({ open, onClose, collection, update, target }: { open: boolean; onClose: () => void; collection: TagCollection; update: (change: (value: TagCollection) => TagCollection) => void; target: string | null }) {
  const { palette } = useTheme()
  const [editing, setEditing] = useState<ListTag | null>(null)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(TAG_COLORS[0].hex)
  const begin = (tag: ListTag) => { setEditing(tag); setName(tag.name); setColor(tag.color) }
  const close = () => { setEditing(null); onClose() }
  const valid = name.trim().length > 0 && !collection.tags.some((tag) => tag.id !== editing?.id && tag.name.toLowerCase() === name.trim().toLowerCase())
  return <BottomSheet open={open} onClose={close} title={editing ? "Edit tag" : target ? "Set tags" : "Manage tags"} padded>
    {editing ? <>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={40} autoFocus returnKeyType="done" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{TAG_COLORS.map((item) => <PressableScale key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ selected: color === item.hex }} onPress={() => setColor(item.hex)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(item.hex, 0.15), borderWidth: color === item.hex ? 2 : 0, borderColor: item.hex }}><Dot color={item.hex} /></PressableScale>)}</View>
      <ActionButton label="Save tag" disabled={!valid} onPress={() => { update((value) => { const isNew = !value.tags.some((tag) => tag.id === editing.id); const saved = saveTag(value, { ...editing, name, color }); return target && isNew ? toggleTag(saved, target, editing.id) : saved }); setEditing(null) }} />
      <ActionButton variant="secondary" label="Cancel" onPress={() => setEditing(null)} />
    </> : <>
      <Text style={{ color: palette.muted, ...type(13) }}>{target ? "Choose one or more tags. Changes are saved immediately on this phone." : "Rename tags, choose their colors, or create your own. Saved on this phone."}</Text>
      <DividedRows>{collection.tags.map((tag) => <View key={tag.id} style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><ListRow title={tag.name} leading={<Dot color={tag.color} />} showChevron={false} selected={Boolean(target && collection.assignments[target]?.includes(tag.id))} trailing={target && collection.assignments[target]?.includes(tag.id) ? <Check size={18} color={palette.ink} /> : undefined} onPress={() => target ? update((value) => toggleTag(value, target, tag.id)) : begin(tag)} /></View>
        <PressableScale accessibilityRole="button" accessibilityLabel={`Edit ${tag.name}`} onPress={() => begin(tag)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Pencil size={17} color={palette.muted} /></PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel={`Delete ${tag.name}`} onPress={() => Alert.alert("Delete tag?", "This removes the tag from every project and conversation on this phone. Projects and conversations are not deleted.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => update((value) => deleteTag(value, tag.id)) }])} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Trash2 size={17} color={palette.danger} /></PressableScale>
      </View>)}</DividedRows>
      <ActionButton variant="secondary" label="New tag" onPress={() => begin({ id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "", color: TAG_COLORS[0].hex })} />
      {target ? <ActionButton variant="secondary" label="Remove all tags" disabled={!assignedTags(collection, target).length} onPress={() => update((value) => ({ ...value, assignments: { ...value.assignments, [target]: [] } }))} /> : null}
      <ActionButton label="Done" onPress={close} />
    </>}
  </BottomSheet>
}
