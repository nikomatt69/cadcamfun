import { useCallback, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Stack } from "expo-router"
import { Cpu, Layers3, Plus, Wrench } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { chooseAction, confirmDelete, promptText } from "@/lib/manage"
import type { ResourceKind, ResourceRow } from "@/lib/client"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { toast } from "@/components/ui/ToastHost"

const KINDS: readonly { value: ResourceKind; label: string; noun: string }[] = [
  { value: "materials", label: "Materials", noun: "material" },
  { value: "tools", label: "Tools", noun: "tool" },
  { value: "machine-configs", label: "Machines", noun: "machine" },
]

/** The signed-in user's own materials, tools and machines. Detailed editing stays on the desktop. */
export default function ResourcesScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const [kind, setKind] = useState<ResourceKind>("materials")
  const [busy, setBusy] = useState(false)
  const current = KINDS.find((entry) => entry.value === kind)!
  const resource = useResource(
    useCallback((signal) => (client ? client.resources(kind, signal) : Promise.reject(new Error("Not connected"))), [client, kind]),
    `resources:${kind}`,
  )

  const run = async (action: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      haptic("success")
      toast(done, "success")
      await resource.reload()
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error")
    } finally {
      setBusy(false)
    }
  }

  const create = async (): Promise<void> => {
    if (!client || busy || kind === "machine-configs") return
    const name = await promptText(`New ${current.noun}`, "Name")
    if (!name) return
    if (kind === "materials") {
      const density = Number((await promptText("Density", "g/cm³ (steel is about 7.85)", "7.85"))?.replace(",", "."))
      if (Number.isFinite(density) && density > 0) await run(() => client.createMaterial(name, density), "Material created")
    } else {
      const diameter = Number((await promptText("Diameter", "mm", "6"))?.replace(",", "."))
      if (Number.isFinite(diameter) && diameter > 0) await run(() => client.createTool(name, diameter), "Tool created (carbide end mill — refine it on the desktop)")
    }
  }

  const openActions = async (row: ResourceRow): Promise<void> => {
    if (!client || busy) return
    const choice = await chooseAction(row.name, kind === "machine-configs" ? ["Duplicate", "Delete"] : ["Delete"], "Delete")
    if (choice === "Duplicate") await run(() => client.cloneMachine(row.id), "Machine duplicated")
    else if (choice === "Delete" && await confirmDelete(`Delete “${row.name}”?`, `This ${current.noun} is removed from the desktop too.`)) {
      await run(() => client.deleteResource(kind, row.id), `${current.noun[0]!.toUpperCase()}${current.noun.slice(1)} deleted`)
    }
  }

  const Icon = kind === "materials" ? Layers3 : kind === "tools" ? Wrench : Cpu
  return <>
    <Stack.Screen options={{ title: "Resources", headerRight: () => kind === "machine-configs" ? null : (
      <Pressable accessibilityRole="button" accessibilityLabel={`New ${current.noun}`} hitSlop={10} disabled={busy} onPress={() => void create()}>
        <Plus size={22} color={palette.accent} />
      </Pressable>
    ) }} />
    <ResourceList resource={resource} keyExtractor={(item) => item.id}
      emptyTitle={`No ${current.label.toLowerCase()}`} emptyDescription={kind === "machine-configs" ? "Create machines on the desktop; you can duplicate and delete them here." : "Tap + to add one. Refine it on the desktop."}
      emptyIcon={<Icon size={26} color={palette.accent} />}
      header={<View style={{ gap: 12, paddingBottom: 12 }}>
        <SegmentedControl segments={KINDS.map(({ value, label }) => ({ value, label }))} value={kind} onChange={setKind} />
        <Text style={{ color: palette.muted, fontSize: 13 }}>Only your own {current.label.toLowerCase()} · long-press a row for actions</Text>
      </View>}
      renderItem={({ item }) => <RecordCard title={item.name} subtitle={item.type ?? item.description ?? undefined}
        meta={item.updatedAt ? `Updated ${relativeTime(item.updatedAt)}` : undefined} leading={<Icon size={21} color={palette.accent} />}
        {...{ onPress: () => void openActions(item), onLongPress: () => void openActions(item) }} />}
    />
  </>
}
