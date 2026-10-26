import { expect, test } from "bun:test"
import { MAX_IMAGE_BYTES } from "../lib/attachments"
import { formatBytes, reviewPhoto } from "../lib/photo-review"

const photo = (data: string) => ({ name: "photo.jpg", mime: "image/jpeg", data })

test("byte counts read as KB or MB", () => {
  expect([0, 1, 1536, 1024 * 1024, 2.5 * 1024 * 1024, Number.NaN].map(formatBytes)).toEqual(["0 KB", "1 KB", "2 KB", "1.0 MB", "2.5 MB", "0 KB"])
})

test("a photo within the desktop's limit is sendable and shows its size against the cap", () => {
  const review = reviewPhoto(photo("A".repeat(4 * 1024)))
  expect(review.sendable).toBe(true)
  expect(review.problem).toBeUndefined()
  expect(review.size).toBe("3 KB of 5.0 MB")
})

test("a photo over five megabytes or without data is refused before it is sent", () => {
  const big = reviewPhoto(photo("A".repeat(Math.ceil(((MAX_IMAGE_BYTES + 4096) * 4) / 3))))
  expect(big.sendable).toBe(false)
  expect(big.problem).toContain("accepts up to 5 MB")
  const empty = reviewPhoto(photo(""))
  expect(empty.sendable).toBe(false)
  expect(empty.problem).toContain("could not be read")
})
