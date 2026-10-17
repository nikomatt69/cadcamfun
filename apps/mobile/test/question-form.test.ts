import { describe, expect, test } from "bun:test"
import { editQuestion, questionAnswers, type QuestionForm } from "../lib/question-form"

const single = { header: "Material", question: "Which material?", options: [{ label: "Aluminum", description: "" }, { label: "Steel", description: "" }] }
const multiple = { ...single, multiple: true }

describe("assistant question form", () => {
  test("single-choice custom input replaces the selected option and vice versa", () => {
    const selected = editQuestion([single], {}, { type: "option", index: 0, label: "Aluminum" })
    const custom = editQuestion([single], selected, { type: "custom", index: 0, text: "  Brass  " })
    expect(questionAnswers([single], custom)).toEqual([["Brass"]])
    const reselected = editQuestion([single], custom, { type: "option", index: 0, label: "Steel" })
    expect(questionAnswers([single], reselected)).toEqual([["Steel"]])
    expect(reselected[0]?.custom).toBe("")
  })
  test("multi-choice toggles individual options while preserving a custom answer", () => {
    let form: QuestionForm = {}
    for (const label of ["Aluminum", "Steel"]) form = editQuestion([multiple], form, { type: "option", index: 0, label })
    form = editQuestion([multiple], form, { type: "custom", index: 0, text: "Brass" })
    form = editQuestion([multiple], form, { type: "option", index: 0, label: "Aluminum" })
    expect(questionAnswers([multiple], form)).toEqual([["Steel", "Brass"]])
  })
  test("a question that forbids custom input cannot acquire or serialize a custom answer", () => {
    const question = { ...single, custom: false }
    const initial = editQuestion([question], {}, { type: "option", index: 0, label: "Steel" })
    expect(editQuestion([question], initial, { type: "custom", index: 0, text: "Brass" })).toBe(initial)
    expect(questionAnswers([question], { 0: { choices: [], custom: "Brass" } })).toEqual([[]])
  })
  test("answers stay in question order and an unanswered question remains visibly incomplete", () => {
    const questions = [single, { ...single, header: "Finish" }]
    const form = editQuestion(questions, {}, { type: "option", index: 1, label: "Steel" })
    expect(questionAnswers(questions, form)).toEqual([[], ["Steel"]])
    expect(questionAnswers(questions, form).some((answers) => answers.length === 0)).toBe(true)
  })
  test("unknown options and stale selections cannot leak into a new question contract", () => {
    const initial: QuestionForm = { 0: { choices: ["Steel", "Removed option"], custom: "" } }
    expect(editQuestion([single], initial, { type: "option", index: 0, label: "Removed option" })).toBe(initial)
    expect(editQuestion([single], initial, { type: "option", index: 9, label: "Steel" })).toBe(initial)
    expect(questionAnswers([single], initial)).toEqual([["Steel"]])
  })
  test("a multi-choice custom answer that matches an option is sent once", () => {
    expect(questionAnswers([multiple], { 0: { choices: ["Steel", "Steel"], custom: " Steel " } })).toEqual([["Steel"]])
  })
  test("whitespace does not satisfy a required freeform response", () => {
    expect(questionAnswers([{ ...single, options: [] }], { 0: { choices: [], custom: " \n " } })).toEqual([[]])
  })
})
