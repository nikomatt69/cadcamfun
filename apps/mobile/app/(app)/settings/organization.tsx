import { useCallback, useEffect, useState } from "react"
import { Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Trash2, UserRound } from "lucide-react-native"
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
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { Pill } from "@/components/ui/Pill"
import { toast } from "@/components/ui/ToastHost"
import { type } from "@/lib/typography"
import { ChoiceRow, DividedRows, SheetSection, SheetSummary, TILE_INSET } from "@/components/chat/sheet-parts"
import { FactRow, FactsCard, NavRow } from "@/components/manage/settings-parts"
import { ScreenFrame } from "@/components/manage/ScreenFrame"

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

  return (
    <ScreenFrame title={org?.name ?? "Organization"} {...(org ? { subtitle: `Your role · ${org.userRole}` } : {})} backLabel="Back to organizations">
      <PageScroll contentInsetAdjustmentBehavior="never" contentContainerStyle={{ gap: 24 }}>
        {loading && !org ? <Skeleton style={{ height: 220 }} /> : <>
          {error ? <ErrorBanner message={error} actionLabel="Retry" onAction={() => void load()} /> : null}
          {org ? <>
            <SheetSummary eyebrow="Organization" title={org.name} description={org.description ?? "No description."} />
            <SheetSection title="Overview">
              <FactsCard>
                {([["Your role", org.userRole], ["Members", String(org.members.length)], ["Projects", String(org.projectCount)], ["Created", relativeTime(org.createdAt)], ["Updated", relativeTime(org.updatedAt)]] as const).map(([label, value]) => (
                  <FactRow key={label} label={label} value={value} />
                ))}
              </FactsCard>
            </SheetSection>

            <SheetSection title={`Members · ${org.members.length}`} footer="Roles as stored on the desktop. Invites and role changes are managed there.">
              {org.members.length > 0 ? (
                <DividedRows inset={TILE_INSET}>
                  {org.members.map((member) => (
                    <NavRow key={member.id} icon={UserRound} title={member.name ?? member.email ?? "Unnamed member"} {...(member.email && member.name ? { description: member.email } : {})}
                      trailing={<Pill tone="accent">{member.role}</Pill>} />
                  ))}
                </DividedRows>
              ) : <Text style={{ color: palette.muted, paddingHorizontal: 4, ...type(14) }}>No members yet.</Text>}
            </SheetSection>

            {canUpdate ? (
              <SheetSection title="Settings" footer={canDelete ? "You administer this organization." : "Managers can rename; only admins can delete."}>
                <View style={{ gap: 14 }}>
                  <TextField label="Name" value={name} onChangeText={setName} placeholder="Organization name" />
                  <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
                  <ActionButton label="Save changes" loading={busy} disabled={name.trim() === ""} onPress={() => { if (client && id) void run(() => client.updateOrganization(id, name.trim(), description || null), "Organization saved") }} />
                </View>
              </SheetSection>
            ) : <Text style={{ color: palette.muted, paddingHorizontal: 4, ...type(13) }}>Members can view this organization. Ask an admin to change it.</Text>}

            {canDelete ? (
              <DividedRows inset={TILE_INSET}>
                <ChoiceRow icon={Trash2} destructive title="Delete organization" description="Removes it from the desktop too" busy={busy} onPress={() => void remove()} />
              </DividedRows>
            ) : null}
          </> : null}
        </>}
      </PageScroll>
    </ScreenFrame>
  )
}
