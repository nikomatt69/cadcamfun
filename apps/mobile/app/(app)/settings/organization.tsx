import { useCallback, useEffect, useState } from "react"
import { Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { confirmDelete } from "@/lib/manage"
import { canDeleteOrganization, canUpdateOrganization } from "@/lib/organizations"
import { relativeTime } from "@/lib/format"
import type { OrganizationDetails } from "@/lib/client"
import { PageScroll } from "@/components/layout/page-scroll"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { ListRow } from "@/components/ui/ListRow"
import { toast } from "@/components/ui/ToastHost"
import { type } from "@/lib/typography"

/**
 * One organization at desktop parity: overview, members with roles, and settings.
 * Rename needs ADMIN/MANAGER and delete ADMIN only — the sidecar enforces the same
 * rules, the UI only hides what would be refused. Member invite/role endpoints do
 * not exist in the API (the desktop invite is a no-op too), so members are read-only.
 */
export default function OrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const [org, setOrg] = useState<OrganizationDetails | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const load = useCallback(async () => {
    if (!client || !id) return
    setLoading(true)
    try {
      const value = await client.organization(id)
      setOrg(value); setName(value.name); setDescription(value.description ?? ""); setError(undefined)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the organization") }
    finally { setLoading(false) }
  }, [client, id])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, done: string, back = false): Promise<void> => {
    setBusy(true)
    try { await action(); haptic("success"); toast(done, "success"); if (back) router.back(); else void load() }
    catch (cause) { haptic("error"); toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error") }
    finally { setBusy(false) }
  }

  const remove = async (): Promise<void> => {
    if (!client || !id || busy) return
    if (await confirmDelete(`Delete “${name}”?`, "The organization and its memberships are removed from the desktop too. Projects keep existing without it.")) {
      await run(() => client.deleteOrganization(id), "Organization deleted", true)
    }
  }

  const canUpdate = org ? canUpdateOrganization(org.userRole) : false
  const canDelete = org ? canDeleteOrganization(org.userRole) : false

  return <>
    <Stack.Screen options={{ title: org?.name ?? "Organization" }} />
    <PageScroll>
      {loading && !org ? <Skeleton style={{ height: 220 }} /> : <>
        {error ? <ErrorBanner message={error} actionLabel="Retry" onAction={() => void load()} /> : null}
        {org ? <>
          <SurfaceCard title="Overview" description={org.description ?? "No description."}>
            <View style={{ padding: 16, gap: 6 }}>
              {([["Your role", org.userRole], ["Members", String(org.members.length)], ["Projects", String(org.projectCount)], ["Created", relativeTime(org.createdAt)], ["Updated", relativeTime(org.updatedAt)]] as const).map(([label, value]) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
                  <Text style={{ color: palette.muted, ...type(14) }}>{label}</Text>
                  <Text selectable style={{ color: palette.ink, ...type(14, { weight: "600" }) }}>{value}</Text>
                </View>))}
            </View>
          </SurfaceCard>

          <SurfaceCard title="Members" description="Roles as stored on the desktop. Invites and role changes are managed there.">
            <View>
              {org.members.map((member, index) => (
                <View key={member.id}>
                  {index > 0 ? <View style={{ height: 0.5, backgroundColor: palette.border, marginLeft: 16 }} /> : null}
                  <ListRow title={member.name ?? member.email ?? "Unnamed member"} subtitle={member.email ?? undefined}
                    trailing={<Text style={{ color: palette.accentStrong, ...type(12, { weight: "700" }) }}>{member.role}</Text>} showChevron={false} />
                </View>))}
              {org.members.length === 0 ? <Text style={{ color: palette.muted, padding: 16, ...type(14) }}>No members yet.</Text> : null}
            </View>
          </SurfaceCard>

          {canUpdate ? <SurfaceCard title="Settings" description={canDelete ? "You administer this organization." : "Managers can rename; only admins can delete."}>
            <View style={{ gap: 14, padding: 16 }}>
              <TextField label="Name" value={name} onChangeText={setName} placeholder="Organization name" />
              <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
              <ActionButton label="Save changes" loading={busy} disabled={name.trim() === ""} onPress={() => { if (client && id) void run(() => client.updateOrganization(id, name.trim(), description || null), "Organization saved") }} />
              {canDelete ? <ActionButton label="Delete organization" variant="danger" loading={busy} onPress={() => void remove()} /> : null}
            </View>
          </SurfaceCard> : <SurfaceCard title="Settings"><Text style={{ color: palette.muted, padding: 16, ...type(14) }}>Members can view this organization. Ask an admin to change it.</Text></SurfaceCard>}
        </> : null}
      </>}
    </PageScroll>
  </>
}
