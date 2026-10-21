import { useCallback, useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Stack, useRouter } from "expo-router"
import { Building2, Plus } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { promptText } from "@/lib/manage"
import { filterOrganizations } from "@/lib/organizations"
import { ResourceList } from "@/components/ui/resource-list"
import { RecordCard } from "@/components/ui/record-card"
import { TextField } from "@/components/ui/TextField"
import { toast } from "@/components/ui/ToastHost"
import { type } from "@/lib/typography"

/**
 * Organizations at desktop parity: the same list the desktop shows (your role and
 * member/project counts per org), searchable, with create and a full detail screen.
 * Live `organizations.changed` frames reload the list when the desktop changes one.
 */
export default function OrganizationsScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)

  const resource = useResource(
    useCallback((signal) => (client ? client.organizations(signal) : Promise.reject(new Error("Not connected"))), [client]),
    "organizations",
  )
  const filtered = useMemo(() => filterOrganizations(resource.data ?? [], search), [resource.data, search])

  const create = async (): Promise<void> => {
    if (!client || busy) return
    const name = await promptText("New organization", "Name")
    if (!name) return
    const description = await promptText("Description", "Optional — leave empty and confirm to skip", "")
    setBusy(true)
    try {
      const created = await client.createOrganization(name, description || null)
      haptic("success")
      toast("Organization created", "success")
      await resource.reload()
      router.push({ pathname: "/(app)/settings/organization", params: { id: created.id } } as never)
    } catch (cause) {
      haptic("error")
      toast(cause instanceof Error ? cause.message : "Could not create the organization", "error")
    } finally { setBusy(false) }
  }

  return <>
    <Stack.Screen options={{ title: "Organizations", headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel="New organization" hitSlop={11} disabled={busy} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }} onPress={() => void create()}>
        <Plus size={22} color={palette.accent} />
      </Pressable>
    ) }} />
    <ResourceList resource={{ ...resource, data: filtered }} keyExtractor={(item) => item.id}
      emptyTitle={(resource.data ?? []).length === 0 ? "No organizations" : "No matches"}
      emptyDescription={(resource.data ?? []).length === 0 ? "Tap + to create one. It appears on the desktop at once." : "No organizations match your search."}
      emptyIcon={<Building2 size={26} color={palette.accent} />}
      header={<View style={{ gap: 12, paddingBottom: 12 }}>
        <TextField label="Search" placeholder="Search organizations…" value={search} onChangeText={setSearch} autoCorrect={false} />
        <Text style={{ color: palette.muted, ...type(13) }}>{filtered.length} of {(resource.data ?? []).length} organizations · synced with the desktop</Text>
      </View>}
      renderItem={({ item }) => <RecordCard title={item.name} subtitle={item.description ?? undefined}
        meta={`${item.userCount} ${item.userCount === 1 ? "member" : "members"} · ${item.projectCount} ${item.projectCount === 1 ? "project" : "projects"}`}
        status={<Text style={{ color: palette.accentStrong, ...type(12, { weight: "700" }) }}>{item.role}</Text>}
        leading={<Building2 size={21} color={palette.accent} />}
        accessibilityHint="Opens the organization."
        {...{ onPress: () => router.push({ pathname: "/(app)/settings/organization", params: { id: item.id } } as never) }} />}
    />
  </>
}
