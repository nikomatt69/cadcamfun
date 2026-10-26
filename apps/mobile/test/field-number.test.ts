import { expect, test } from "bun:test"
import { checkNumber, numberError } from "../lib/field-number"

test("decimal commas and points both read as the same number", () => {
  expect(checkNumber("7,85", "Density")).toEqual({ ok: true, value: 7.85 })
  expect(checkNumber(" 7.85 ", "Density")).toEqual({ ok: true, value: 7.85 })
  expect(checkNumber(".5", "Diameter")).toEqual({ ok: true, value: 0.5 })
  expect(checkNumber("12", "Diameter")).toEqual({ ok: true, value: 12 })
})

test("text, negatives and several separators are refused with a reason", () => {
  expect(checkNumber("abc", "Density").ok).toBe(false)
  expect(checkNumber("-3", "Density").ok).toBe(false)
  expect(checkNumber("1,2,3", "Density").ok).toBe(false)
  expect(checkNumber("1e5", "Density").ok).toBe(false)
  expect(numberError("abc", "Density")).toBe("Density must be a number, such as 7.85.")
})

test("empty fields are an error unless optional, and integer/positive rules apply", () => {
  expect(numberError("", "Diameter")).toBe("Enter diameter.")
  expect(checkNumber("", "Flutes", { optional: true })).toEqual({ ok: true, value: null })
  expect(numberError("2,5", "Flutes", { integer: true })).toBe("Flutes must be a whole number.")
  expect(numberError("0", "Diameter", { positive: true })).toBe("Diameter must be greater than zero.")
  expect(numberError("0", "Density")).toBeUndefined()
})
