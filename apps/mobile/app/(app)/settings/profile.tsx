import { useCallback, useState } from "react"
import { Text, View } from "react-native"
import { UserRound } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type, eyebrow } from "@/lib/typography"
import { initials, itemSubtitle, profileFacts, PROFILE_TABS, type ProfileListKind } from "@/lib/profile"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { PageScroll } from "@/components/layout/page-scroll"
import { FilterChips } from "@/components/ui/FilterChips"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { relativeTime } from "@/lib/format"

/** The desktop profile, read-only: identity card, counters and the lists of the account's work. Editing stays on the desktop. */
export default function ProfileScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const [tab, setTab] = useState<ProfileListKind>("projects")

  const profile = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.profile(signal)
  }, [client]), "profile:me", { cacheKey: "profile:me" })
  const stats = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.profileStats(signal)
  }, [client]), "profile:stats", { cacheKey: "profile:stats" })
  const items = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.userItems(tab, signal)
  }, [client, tab]), `profile:items:${tab}`, { cacheKey: `profile:items:${tab}` })

  const reload = () => { void profile.reload(); void stats.reload(); void items.reload() }
  const failure = profile.error ?? stats.error ?? items.error
  const me = profile.data
  const counters = stats.data
    ? [
      { id: "projects", label: "Projects", value: stats.data.projectsCount },
      { id: "components", label: "Components", value: stats.data.componentsCount },
      { id: "toolpaths", label: "Toolpaths", value: stats.data.toolpathsCount },
      { id: "drawings", label: "Drawings", value: stats.data.drawingsCount },
    ]
    : []

  return <ScreenFrame title="Profile" subtitle="Your account on the desktop" backLabel="Back">
    <PageScroll>
      {failure ? <ErrorBanner message={failure} actionLabel="Try again" onAction={reload} /> : null}

      {profile.loading && !me ? <Skeleton style={{ height: 150 }} /> : me ? (
        <SurfaceCard>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.accent, 0.14) }}>
              <Text style={{ color: palette.accentStrong, ...type(20, { weight: "700" }) }}>{initials(me.name, me.email)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: palette.ink, ...type(20, { weight: "700" }) }}>{me.name ?? "User"}</Text>
              {me.bio ? <Text numberOfLines={2} style={{ color: palette.soft, ...type(14) }}>{me.bio}</Text> : null}
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            {profileFacts(me).map((fact, index) => (
              <View key={fact.id} style={{ flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: palette.border }}>
                <Text style={{ width: 96, color: palette.muted, ...type(13) }}>{fact.label}</Text>
                <Text selectable style={{ flex: 1, color: palette.ink, ...type(14) }}>{fact.value}</Text>
              </View>
            ))}
          </View>
        </SurfaceCard>
      ) : !failure ? (
        <EmptyState title="No profile" description="Sign in on the desktop to see your profile here." icon={<UserRound size={25} color={palette.accent} />} />
      ) : null}

      {counters.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {counters.map((counter) => (
            <SurfaceCard key={counter.id} style={{ flexBasis: "47%", flexGrow: 1 }} accessibilityLabel={`${counter.label}: ${counter.value}`}>
              <Text style={{ color: palette.muted, ...eyebrow(11) }}>{counter.label}</Text>
              <Text style={{ marginTop: 6, color: palette.ink, fontVariant: ["tabular-nums"], ...type(28, { weight: "700" }) }}>{counter.value}</Text>
            </SurfaceCard>
          ))}
        </View>
      ) : null}

      <FilterChips options={PROFILE_TABS} value={tab} onChange={setTab} accessibilityLabel="Your work" />
      {items.loading && !items.data ? <Skeleton style={{ height: 120 }} /> : items.data && items.data.length > 0 ? (
        <SurfaceCard inset={false}>
          {items.data.map((item, index) => {
            const subtitle = itemSubtitle(tab, item)
            return (
              <View key={item.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: palette.border }}>
                <Text numberOfLines={1} style={{ color: palette.ink, ...type(15, { weight: "600" }) }}>{item.name}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, color: palette.soft, ...type(13) }}>{subtitle ? `${subtitle} · ` : ""}Updated {relativeTime(item.updatedAt)}</Text>
              </View>
            )
          })}
        </SurfaceCard>
      ) : !items.loading ? (
        <Text style={{ color: palette.soft, ...type(14) }}>{`No ${tab} yet.`}</Text>
      ) : null}
    </PageScroll>
  </ScreenFrame>
}
