import { useCallback, useMemo, useState } from "react"
import { Alert, RefreshControl, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { GitMerge, MessageSquare } from "lucide-react-native"
import type { ReviewRow } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { relativeTime } from "@/lib/format"
import { toast } from "@/components/ui/ToastHost"
import { DiffView } from "@/components/DiffView"
import { Pill, type PillTone } from "@/components/ui/Pill"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { PageScroll } from "@/components/layout/page-scroll"
import { ScreenFrame } from "@/components/project/ScreenFrame"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { conflictSummary, conflictsOf, type VcsConflict } from "@/lib/vcs-conflicts"
import { errorMessage } from "@/lib/throttle"
import { Divider } from "@/components/ui/SectionHeader"
import { caps, mono, type } from "@/lib/typography"

const STATE_TONE: Record<string, PillTone> = { open: "accent", merged: "success", closed: "neutral" }
const STATE_LABEL: Record<string, string> = { open: "Open", merged: "Merged", closed: "Closed" }

const VERDICT_LABEL: Record<ReviewRow["verdict"], string> = {
  approve: "Approved",
  "request-changes": "Requested changes",
  comment: "Commented",
}

const VERDICT_TONE: Record<ReviewRow["verdict"], PillTone> = {
  approve: "success",
  "request-changes": "danger",
  comment: "neutral",
}

/**
 * The pull request review, in a native form sheet. The person is the gate: read the CAD-aware
 * diff, see the reviews (including any request-changes that blocks the merge), then approve,
 * request changes or merge. AI-authored PRs carry the same flow — the AI proposes, a person merges.
 */
export default function PullRequestScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>()
  const { client } = useServer()
  const { palette } = useTheme()
  const { fontScale, width, onLayout } = useContentLayout()
  const stacked = fontScale > 1.2 || width < 375

  const [busy, setBusy] = useState<string | null>(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentBody, setCommentBody] = useState("")
  const [commentVerdict, setCommentVerdict] = useState<ReviewRow["verdict"]>("comment")
  /** The files a failed merge disagreed on: the user needs to know which ones to settle. */
  const [conflicts, setConflicts] = useState<readonly VcsConflict[]>([])

  const pull = useResource(
    useCallback(
      (signal) => (client ? client.pullRequest(id, Number(number), signal) : Promise.reject(new Error("Not connected"))),
      [client, id, number],
    ),
    `pull:${id}:${number}`,
  )

  const blocked = useMemo(() => {
    const latest = new Map<string, ReviewRow>()
    for (const review of pull.data?.reviews ?? []) {
      const previous = latest.get(review.reviewerId)
      if (!previous || review.createdAt >= previous.createdAt) latest.set(review.reviewerId, review)
    }
    return [...latest.values()].some((review) => review.verdict === "request-changes")
  }, [pull.data])

  const mergable = pull.data?.pullRequest.state === "open"

  const act = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(label)
    try {
      await action()
      haptic("success")
      setConflicts([])
      await pull.reload()
    } catch (error) {
      haptic("error")
      // A merge that cannot be applied cleanly names the files: show them instead of a bare failure.
      const found = conflictsOf(error)
      setConflicts(found)
      toast(found.length > 0 ? conflictSummary(found) : errorMessage(error, `${label} failed`), "error")
    } finally {
      setBusy(null)
    }
  }

  /** Merging lands the branch on its base and closing ends the review: both say exactly what happens first. */
  const confirmMerge = () => {
    const pr = pull.data?.pullRequest
    if (!pr || !client) return
    haptic("selection")
    Alert.alert(`Merge into ${pr.base}?`, `${pr.head} lands on ${pr.base} on your desktop. The branch history is kept.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Merge", onPress: () => void act("Merge", () => client.merge(id, Number(number))) },
    ])
  }
  const confirmClose = () => {
    const pr = pull.data?.pullRequest
    if (!pr || !client) return
    haptic("selection")
    Alert.alert("Close without merging?", `${pr.head} stays on the desktop and nothing changes on ${pr.base}.`, [
      { text: "Keep open", style: "cancel" },
      { text: "Close pull request", style: "destructive", onPress: () => void act("Close", () => client.close(id, Number(number))) },
    ])
  }

  if (!client) return null

  const pullRequest = pull.data?.pullRequest
  const stateTone: PillTone = pullRequest ? (STATE_TONE[pullRequest.state] ?? "neutral") : "neutral"

  return (
    <ScreenFrame title={`Pull request #${number}`} {...(pullRequest ? { subtitle: `${pullRequest.head} → ${pullRequest.base}` } : {})} sheet onLayout={onLayout}>

      <PageScroll contentInsetAdjustmentBehavior="never" refreshControl={<RefreshControl refreshing={pull.loading && Boolean(pull.data)} onRefresh={() => void pull.reload()} tintColor={palette.accent} />}>
          {pull.error && pull.data ? <ErrorBanner message={pull.error} actionLabel="Retry" onAction={() => void pull.reload()} /> : null}
          {pull.loading && !pull.data ? (
            <Skeleton style={{ height: 220 }} />
          ) : pull.error && !pull.data ? (
            <ErrorBanner message={pull.error} actionLabel="Retry" onAction={() => void pull.reload()} />
          ) : pullRequest ? (
            <>
              {/* Header */}
              <SurfaceCard inset={false}>
                <View style={{ padding: 18, gap: 10 }}>
                  <View style={{ flexDirection: stacked ? "column" : "row", alignItems: stacked ? "flex-start" : "center", gap: 10 }}>
                    <Text selectable accessibilityRole="header" style={{ color: palette.ink, flexShrink: 1, minWidth: 0, ...type(22, { weight: "700" }) }}>
                      {pullRequest.title}
                    </Text>
                    <Pill tone={stateTone}>{STATE_LABEL[pullRequest.state] ?? pullRequest.state}</Pill>
                  </View>
                  <Text selectable style={{ color: palette.soft, ...mono(13) }}>
                    {pullRequest.head} → {pullRequest.base}
                  </Text>
                  <Text style={{ color: palette.muted, ...type(13) }}>
                    {pullRequest.authorKind === "ai" ? "Proposed by the AI" : "Opened by you"} · {relativeTime(pullRequest.createdAt)}
                  </Text>
                  {pullRequest.body ? (
                    <Text selectable style={{ color: palette.ink, paddingTop: 4, ...type(14) }}>{pullRequest.body}</Text>
                  ) : null}
                </View>
              </SurfaceCard>

              {/* The files a merge could not apply: the person has to settle them on the desktop. */}
              {conflicts.length > 0 ? (
                <SurfaceCard inset={false}>
                  <View style={{ padding: 16, gap: 10 }}>
                    <Text accessibilityRole="header" style={{ color: palette.danger, ...caps(12, { weight: "700" }) }}>
                      Merge conflicts
                    </Text>
                    <Text style={{ color: palette.soft, ...type(14) }}>
                      These files changed on both sides. Settle them on the desktop, then merge again.
                    </Text>
                    {conflicts.map((conflict) => (
                      <View key={conflict.path} style={{ gap: 3 }}>
                        <Text selectable style={{ color: palette.ink, ...mono(13) }}>{conflict.path}</Text>
                        {conflict.pointers.length > 0 ? (
                          <Text selectable style={{ color: palette.muted, ...mono(12) }}>{conflict.pointers.join("  ")}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </SurfaceCard>
              ) : null}

              {/* Reviews */}
              {(pull.data?.reviews ?? []).length > 0 ? (
                <SurfaceCard inset={false}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
                    <Text accessibilityRole="header" style={{ color: palette.muted, ...caps(12) }}>
                      Reviews
                    </Text>
                  </View>
                  {pull.data?.reviews.map((review, index) => (
                    <View key={review.id}>
                      {index > 0 ? <Divider inset={16} /> : null}
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
                        <Pill tone={VERDICT_TONE[review.verdict]}>{VERDICT_LABEL[review.verdict]}</Pill>
                        {review.body ? <Text selectable style={{ color: palette.soft, ...type(14) }}>{review.body}</Text> : null}
                        <Text style={{ color: palette.muted, ...type(12) }}>{relativeTime(review.createdAt)}</Text>
                      </View>
                    </View>
                  ))}
                </SurfaceCard>
              ) : null}

              {/* Review actions — only while open */}
              {mergable ? (
                <View style={{ gap: 10 }}>
                  <ActionButton label="Approve" fullWidth
                    loading={busy === "Approve"}
                    disabled={busy !== null}
                    onPress={() => void act("Approve", () => client.review(id, Number(number), "approve"))} />
                  <View style={{ flexDirection: stacked ? "column" : "row", gap: 10 }}>
                    <View style={{ flex: stacked ? undefined : 1 }}>
                      <ActionButton label="Comment" fullWidth
                        variant="secondary"
                        loading={busy === "Comment"}
                        disabled={busy !== null}
                        onPress={() => {
                          haptic("selection")
                          setCommentVerdict("comment")
                          setCommentBody("")
                          setCommentOpen(true)
                        }} />
                    </View>
                    <View style={{ flex: stacked ? undefined : 1 }}>
                      <ActionButton label="Request changes" fullWidth
                        variant="danger"
                        loading={busy === "Request changes"}
                        disabled={busy !== null}
                        onPress={() => {
                          haptic("selection")
                          setCommentVerdict("request-changes")
                          setCommentBody("")
                          setCommentOpen(true)
                        }} />
                    </View>
                  </View>
                  <ActionButton label="Merge" icon={<GitMerge size={17} color={blocked ? palette.accent : palette.onAccent} />} fullWidth
                    variant={blocked ? "secondary" : "primary"}
                    loading={busy === "Merge"}
                    disabled={busy !== null || blocked}
                    onPress={confirmMerge} />
                  {blocked ? (
                    <Text accessibilityRole="alert" style={{ color: palette.danger, textAlign: "center", ...type(13) }}>
                      A review requested changes — the merge stays blocked until a new review approves.
                    </Text>
                  ) : null}
                  <ActionButton label="Close pull request" fullWidth variant="ghost" loading={busy === "Close"} disabled={busy !== null} onPress={confirmClose} />
                </View>
              ) : null}

              {/* Changes */}
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="header" style={{ color: palette.muted, paddingHorizontal: 4, ...caps(12) }}>
                  Changes
                </Text>
                {pull.data && pull.data.changes.length > 0 ? (
                  <DiffView changes={pull.data.changes} />
                ) : (
                  <Text style={{ color: palette.muted, textAlign: "center", paddingVertical: 16, ...type(14) }}>No content changes</Text>
                )}
              </View>
            </>
          ) : null}
      </PageScroll>

      {/* Comment / request-changes sheet */}
      <BottomSheet open={commentOpen} onClose={() => setCommentOpen(false)} title={commentVerdict === "request-changes" ? "Request changes" : "Comment"}>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MessageSquare size={15} color={palette.muted} />
            <Text style={{ flex: 1, color: palette.soft, ...type(13) }}>Shown to everyone who can review this pull request</Text>
          </View>
          <TextField
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder={commentVerdict === "request-changes" ? "What should change?" : "Leave a comment…"}
            autoFocus
            multiline
            style={{ minHeight: 80, alignItems: "flex-start" }}
          />
          <ActionButton label="Submit" fullWidth disabled={commentBody.trim().length === 0 || busy !== null}
            variant={commentVerdict === "request-changes" ? "danger" : "primary"}
            loading={busy === (commentVerdict === "request-changes" ? "Request changes" : "Comment")}
            onPress={() => {
              void act(commentVerdict === "request-changes" ? "Request changes" : "Comment", async () => {
                await client.review(id, Number(number), commentVerdict, commentBody.trim())
                setCommentOpen(false)
              })
            }} />
        </View>
      </BottomSheet>
    </ScreenFrame>
  )
}
