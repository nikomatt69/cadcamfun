import { useCallback, useMemo, useState } from "react"
import { KeyboardAvoidingView, Platform } from "react-native"
import { useRouter } from "expo-router"
import { Building2, Plus, Search } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { promptText } from "@/lib/manage"
import { filterOrganizations } from "@/lib/organizations"
import { projectMeta } from "@/lib/project-list"
import { toast } from "@/components/ui/ToastHost"
import { ActionButton } from "@/components/ui/ActionButton"
import { EmptyState } from "@/components/ui/EmptyState"
import { Pill } from "@/components/ui/Pill"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { RowList } from "@/components/project/RowList"
import { FlatRow } from "@/components/project/rows"
import { Dock } from "@/components/project/Dock"

/**
 * Organizations at desktop parity: the same list the desktop shows (your role and
 * member/project counts per org), searchable, with create and a full detail screen.
 * Live `organizations.changed` frames reload the list when the desktop changes one.
 */
export default function OrganizationsScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const { gutter } = useContentLayout()
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

  const total = resource.data?.length ?? 0
  const open = (id: string) => router.push({ pathname: "/(app)/settings/organization", params: { id } } as never)
  const empty = total > 0 ? (
    <EmptyState title="No matches" description="No organization matches your search." icon={<Search size={25} color={palette.muted} />}
      action={<ActionButton variant="secondary" label="Clear search" onPress={() => { haptic("selection"); setSearch("") }} />} />
  ) : (
    <EmptyState title="No organizations" description="Create one. It appears on the desktop at once." icon={<Building2 size={25} color={palette.accent} />}
      action={<ActionButton label="New organization" loading={busy} onPress={() => void create()} />} />
  )

  return (
    <ScreenFrame title="Organizations" subtitle={total > 0 ? `${total} ${total === 1 ? "organization" : "organizations"} · synced with the desktop` : "Synced with the desktop"} backLabel="Back to settings">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <RowList
          source={resource}
          sections={filtered.length > 0 ? [{ data: [...filtered] }] : []}
          keyExtractor={(item) => item.id}
          loadingLabel="Loading organizations"
          failureTitle="Could not load organizations"
          empty={empty}
          renderRow={(item) => (
            <FlatRow
              leading={<Building2 size={19} color={palette.muted} strokeWidth={2} />}
              title={item.name}
              {...(item.description ? { subtitle: item.description } : {})}
              meta={projectMeta([`${item.userCount} ${item.userCount === 1 ? "member" : "members"}`, `${item.projectCount} ${item.projectCount === 1 ? "project" : "projects"}`])}
              trailing={<Pill tone="accent">{item.role}</Pill>}
              onPress={() => { haptic("selection"); open(item.id) }}
              accessibilityHint="Opens the organization"
            />
          )}
        />
        <Dock
          gutter={gutter}
          {...(total > 0 ? { search: { value: search, onChange: setSearch, placeholder: "Search organizations" } } : {})}
          action={{ label: "New", icon: <Plus size={18} color={palette.onAccent} strokeWidth={2.4} />, onPress: () => void create(), loading: busy }}
        />
      </KeyboardAvoidingView>
    </ScreenFrame>
  )
}
