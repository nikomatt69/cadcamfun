import { useCallback, useEffect, useRef, useState } from "react"
import { Text, View } from "react-native"
import { CloudUpload, Monitor } from "lucide-react-native"
import type { CloudProjectStatus } from "@cadcamfun/api"
import type { CompanionClient } from "@/lib/client"
import { cloudCopy } from "@/lib/cloud-delivery"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useResource } from "@/lib/use-resource"
import { usePoll } from "@/lib/use-poll"
import { errorMessage } from "@/lib/throttle"
import { haptic } from "@/lib/haptics"
import { type } from "@/lib/typography"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { toast } from "@/components/ui/ToastHost"

/** Mounted only for a cloud pairing; delivery progress follows the server's receipt. */
export function CloudDeliveryPanel({ client, projectId, refreshKey }: { client: CompanionClient; projectId: string; refreshKey: number }) {
  const { palette } = useTheme()
  const { connectivity } = useServer()
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [latest, setLatest] = useState<CloudProjectStatus | undefined>()
  const active = useRef(true)
  const inFlight = useRef(false)
  const revision = useRef(0)
  const scope = useRef({ client, projectId })
  scope.current = { client, projectId }
  useEffect(() => { setLatest(undefined); setSendError(null); revision.current += 1 }, [client, projectId])
  const status = useResource(useCallback(async (signal) => {
    const at = revision.current
    return { value: await client.cloudStatus(projectId, signal), at }
  }, [client, projectId]), `cloud-delivery:${projectId}:${refreshKey}`)
  useEffect(() => { if (status.data && status.data.at === revision.current) setLatest(status.data.value) }, [status.data])
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  usePoll(() => void status.reload(), 20_000, connectivity === "online")
  const reported = latest ? cloudCopy.states[latest.state] : undefined

  const send = async () => {
    if (inFlight.current || connectivity !== "online") return
    inFlight.current = true
    revision.current += 1
    setSending(true)
    setSendError(null)
    const current = () => active.current && scope.current.client === client && scope.current.projectId === projectId
    try {
      const result = await client.sendToDesktop(projectId)
      if (!current()) return
      revision.current += 1
      setLatest(result)
      haptic("success")
      toast(cloudCopy.sent, "success")
      void status.reload()
    } catch (error) {
      if (!current()) return
      setSendError(errorMessage(error, cloudCopy.failed))
      haptic("error")
    } finally {
      inFlight.current = false
      if (current()) setSending(false)
    }
  }

  return <SurfaceCard>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <Monitor size={19} color={palette.accent} />
      <Text accessibilityRole="header" style={{ flex: 1, color: palette.ink, ...type(16, { weight: "600" }) }}>{cloudCopy.title}</Text>
    </View>
    {reported ? <View accessibilityLiveRegion="polite" style={{ gap: 5, marginVertical: 12 }}>
      <Text style={{ color: palette.ink, ...type(15, { weight: "600" }) }}>{reported.title}</Text>
      <Text style={{ color: palette.soft, ...type(13) }}>{reported.detail}</Text>
      {latest?.dirty ? <Text style={{ color: palette.warning, ...type(13) }}>{cloudCopy.dirty}</Text> : null}
    </View> : <Text style={{ color: palette.muted, marginVertical: 12, ...type(13) }}>{status.loading ? "Checking delivery status…" : "Delivery status unavailable"}</Text>}
    {status.error ? <ErrorBanner message={status.error} actionLabel={cloudCopy.retry} onAction={() => void status.reload()} /> : null}
    {sendError ? <ErrorBanner message={sendError} /> : null}
    {connectivity !== "online" ? <Text style={{ color: palette.muted, marginVertical: 8, ...type(13) }}>{cloudCopy.offline}</Text> : null}
    <ActionButton label={cloudCopy.send} loadingLabel={cloudCopy.sending} icon={<CloudUpload size={18} color={palette.onAccent} />} disabled={connectivity !== "online" || status.loading && !latest} loading={sending} onPress={() => void send()} accessibilityHint="Saves a version in the cloud for the desktop to download. Your PC can be off." />
  </SurfaceCard>
}
