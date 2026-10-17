import type { ChatRow } from "./chat-log"

type Question = Extract<ChatRow, { kind: "question" }>["questions"][number]
export type QuestionForm = Readonly<Record<number, { readonly choices: readonly string[]; readonly custom: string }>>
export type QuestionEdit =
  | { type: "option"; index: number; label: string }
  | { type: "custom"; index: number; text: string }

/** Single-choice options and custom text are exclusive. Multiple-choice questions allow both. */
export function editQuestion(questions: readonly Question[], form: QuestionForm, edit: QuestionEdit): QuestionForm {
  const question = questions[edit.index]
  if (!question) return form
  const current = form[edit.index] ?? { choices: [], custom: "" }
  if (edit.type === "custom") {
    if (question.custom === false) return form
    return { ...form, [edit.index]: { choices: question.multiple ? current.choices : [], custom: edit.text } }
  }
  if (!question.options.some((option) => option.label === edit.label)) return form
  const choices = question.multiple
    ? current.choices.includes(edit.label) ? current.choices.filter((label) => label !== edit.label) : [...current.choices, edit.label]
    : [edit.label]
  return { ...form, [edit.index]: { choices, custom: question.multiple ? current.custom : "" } }
}

/** Serialize only answers supported by the current question; retries retain the user's draft. */
export function questionAnswers(questions: readonly Question[], form: QuestionForm): string[][] {
  return questions.map((question, index) => {
    const current = form[index]
    const custom = question.custom !== false ? current?.custom.trim() : undefined
    if (custom && !question.multiple) return [custom]
    const choices = (current?.choices ?? []).filter((choice) => question.options.some((option) => option.label === choice))
    const answers = [...new Set([...choices, ...(custom ? [custom] : [])])]
    return question.multiple ? answers : answers.slice(0, 1)
  })
}
