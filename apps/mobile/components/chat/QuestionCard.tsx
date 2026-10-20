import { memo, useReducer, useRef, useState } from "react"
import { Text, View } from "react-native"
import { CheckCircle2, Circle, MessageSquare, Square, SquareCheck } from "lucide-react-native"
import type { ChatRow } from "@/lib/chat-log"
import { editQuestion, questionAnswers, type QuestionEdit, type QuestionForm } from "@/lib/question-form"
import { hexToRgba, useTheme } from "@/lib/theme"
import { layout } from "@/lib/layout"
import { STATUS_FILL_ALPHA } from "@/lib/palette"
import { haptic } from "@/lib/haptics"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { PressableScale } from "@/components/ui/PressableScale"

export const QuestionCard = memo(function QuestionCard({ row, onReply, onReject }: {
  row: Extract<ChatRow, { kind: "question" }>
  onReply: (requestId: string, answers: string[][]) => Promise<void>
  onReject: (requestId: string) => Promise<void>
}) {
  const { palette } = useTheme()
  const [form, dispatch] = useReducer((state: QuestionForm, edit: QuestionEdit) => editQuestion(row.questions, state, edit), {})
  const [busy, setBusy] = useState<"answer" | "skip" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const answers = questionAnswers(row.questions, form)
  const submit = async (action: "answer" | "skip") => {
    if (submitting.current || row.answered || (action === "answer" && answers.some((answer) => !answer.length))) return
    submitting.current = true
    setBusy(action)
    setError(null)
    try {
      if (action === "skip") await onReject(row.requestId)
      else await onReply(row.requestId, answers)
      haptic("success")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your response. Try again.")
      haptic("error")
    } finally { submitting.current = false; setBusy(null) }
  }

  return <SurfaceCard style={{ marginHorizontal: 16, marginVertical: 8 }}>
    <View style={{ gap: layout.gap }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {row.answered ? <CheckCircle2 size={19} color={palette.success} style={{ flexShrink: 0 }} /> : <MessageSquare size={19} color={palette.accent} style={{ flexShrink: 0 }} />}
        <Text style={{ flex: 1, minWidth: 0, color: palette.soft, fontSize: 12, lineHeight: 18, fontWeight: "600" }}>{row.answered ? "Response recorded" : "Your input is needed"}</Text>
      </View>
      {row.questions.map((question, index) => <View key={index} style={{ gap: 10 }}>
        {question.header ? <Text accessibilityRole="header" style={{ color: palette.ink, fontWeight: "600", fontSize: 17, lineHeight: 24 }}>{question.header}</Text> : null}
        <Text selectable style={{ color: palette.soft, fontSize: 15, lineHeight: 22 }}>{question.question}</Text>
        {row.answered ? (answers[index]?.length ? <Text selectable style={{ color: palette.muted, fontSize: 14, lineHeight: 21 }}>{answers[index]!.join(", ")}</Text> : null) : <>
          {question.options.length ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{question.multiple ? "Select all that apply" : "Choose one option"}</Text> : null}
          {question.options.map((option) => {
            const checked = form[index]?.choices.includes(option.label) ?? false
            const Indicator = question.multiple ? checked ? SquareCheck : Square : checked ? CheckCircle2 : Circle
            return <PressableScale key={option.label} disabled={busy !== null} subtle tint
              accessibilityRole={question.multiple ? "checkbox" : "radio"}
              accessibilityLabel={[option.label, option.description].filter(Boolean).join(". ")}
              accessibilityState={{ checked, disabled: busy !== null }}
              onPress={() => { haptic("selection"); dispatch({ type: "option", index, label: option.label }) }}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: layout.touchTarget, padding: 14, borderRadius: layout.controlRadius, borderCurve: "continuous", borderWidth: 1, borderColor: checked ? palette.accent : palette.border, backgroundColor: checked ? hexToRgba(palette.accent, STATUS_FILL_ALPHA) : palette.surface }}>
              <Indicator size={20} color={checked ? palette.accent : palette.muted} style={{ marginTop: 1, flexShrink: 0 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" }}>{option.label}</Text>
                {option.description ? <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 20 }}>{option.description}</Text> : null}
              </View>
            </PressableScale>
          })}
          {question.custom !== false ? <TextField label="Your answer" accessibilityLabel={`${question.header || question.question}. Your answer`}
            multiline value={form[index]?.custom ?? ""} editable={busy === null} placeholder={question.options.length ? "Or write your own answer…" : "Write your answer…"}
            onChangeText={(text) => dispatch({ type: "custom", index, text })} /> : null}
        </>}
      </View>)}
      {!row.answered ? <>
        {error ? <ErrorBanner message={error} /> : null}
        <View style={{ gap: 8 }}>
          <ActionButton label="Send response" loading={busy === "answer"} disabled={busy !== null || !answers.length || answers.some((answer) => !answer.length)} onPress={() => void submit("answer")} />
          <ActionButton label="Skip this question" variant="secondary" loading={busy === "skip"} disabled={busy !== null} onPress={() => void submit("skip")} />
        </View>
      </> : null}
    </View>
  </SurfaceCard>
})
