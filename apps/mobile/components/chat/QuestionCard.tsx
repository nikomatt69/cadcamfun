import { useRef, useState } from "react"
import { Pressable, Text, View } from "react-native"
import type { ChatRow } from "@/lib/chat-log"
import { useTheme } from "@/lib/theme"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"

export function QuestionCard({ row, onReply, onReject }: {
  row: Extract<ChatRow, { kind: "question" }>
  onReply: (requestId: string, answers: string[][]) => Promise<void>
  onReject: (requestId: string) => Promise<void>
}) {
  const { palette } = useTheme()
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const answers = row.questions.map((_, index) => [...(selected[index] ?? []), ...(custom[index]?.trim() ? [custom[index]!.trim()] : [])])
  const submit = async (reject: boolean) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      if (reject) await onReject(row.requestId)
      else await onReply(row.requestId, answers)
    } catch { /* The screen keeps the request open and reports the server error. */ }
    finally { submitting.current = false; setBusy(false) }
  }
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 6, padding: 14, gap: 12, borderRadius: 14, borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.panel }}>
      {row.questions.map((question, index) => (
        <View key={index} style={{ gap: 8 }}>
          <Text style={{ color: palette.ink, fontWeight: "600", fontSize: 15 }}>{question.header}</Text>
          <Text style={{ color: palette.soft, fontSize: 14 }}>{question.question}</Text>
          {!row.answered ? <>
            {question.options.map((option) => {
              const checked = selected[index]?.includes(option.label) ?? false
              return <Pressable key={option.label} disabled={busy} accessibilityRole={question.multiple ? "checkbox" : "radio"} accessibilityState={{ checked, disabled: busy }} onPress={() => {
                setSelected((previous) => ({ ...previous, [index]: question.multiple ? checked ? (previous[index] ?? []).filter((label) => label !== option.label) : [...(previous[index] ?? []), option.label] : [option.label] }))
                if (!question.multiple) setCustom((previous) => ({ ...previous, [index]: "" }))
              }} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: checked ? palette.accent : palette.border }}>
                <Text style={{ color: checked ? palette.accent : palette.ink, fontSize: 14, fontWeight: "600" }}>{option.label}</Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>{option.description}</Text>
              </Pressable>
            })}
            {question.custom !== false ? <TextField value={custom[index] ?? ""} editable={!busy} placeholder="Your answer" onChangeText={(text) => {
              setCustom((previous) => ({ ...previous, [index]: text }))
              if (!question.multiple) setSelected((previous) => ({ ...previous, [index]: [] }))
            }} /> : null}
          </> : null}
        </View>
      ))}
      {row.answered ? <Text style={{ color: palette.muted }}>Answered</Text> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <ActionButton label="Answer" small loading={busy} disabled={answers.some((answer) => answer.length === 0)} onPress={() => void submit(false)} />
        <ActionButton label="Skip" small variant="secondary" disabled={busy} onPress={() => void submit(true)} />
      </View>}
    </View>
  )
}
