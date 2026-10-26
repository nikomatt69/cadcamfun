import { expect, test } from "bun:test"
import { enqueueToast, MAX_TOASTS, removeToast, toastAnnouncement, toastDwellMs, type ToastEntry } from "../lib/toast-queue"

test("the same toast raised again refreshes in place instead of stacking", () => {
  let queue: readonly ToastEntry[] = []
  queue = enqueueToast(queue, { id: 1, kind: "error", message: "The desktop refused the change" })
  queue = enqueueToast(queue, { id: 2, kind: "error", message: "The desktop refused the change" })
  expect(queue).toHaveLength(1)
  expect(queue[0]).toMatchObject({ id: 1, stamp: 1 })
  // Same words but another kind is another toast.
  queue = enqueueToast(queue, { id: 3, kind: "info", message: "The desktop refused the change" })
  expect(queue).toHaveLength(2)
})

test("only the newest toasts stay, and removing is by id", () => {
  let queue: readonly ToastEntry[] = []
  for (let id = 1; id <= MAX_TOASTS + 2; id++) queue = enqueueToast(queue, { id, kind: "info", message: `Toast ${id}` })
  expect(queue.map((entry) => entry.id)).toEqual([3, 4, 5])
  expect(removeToast(queue, 4).map((entry) => entry.id)).toEqual([3, 5])
  expect(removeToast(queue, 99)).toBe(queue)
})

test("dwell grows with the words, errors stay longer, and errors are announced as errors", () => {
  expect(toastDwellMs("Saved", "success")).toBe(3500)
  expect(toastDwellMs("Saved", "error")).toBe(5000)
  expect(toastDwellMs(Array.from({ length: 60 }, () => "word").join(" "), "info")).toBe(10000)
  expect(toastAnnouncement("error", "Commit failed")).toBe("Error. Commit failed")
  expect(toastAnnouncement("success", "Committed")).toBe("Committed")
})
