import { expect, test } from "bun:test"
import { acceptAttachments, attachmentProblem, base64Bytes, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, photoName } from "../lib/attachments"

const photo = (bytes: number, name = "photo.jpg") => ({ name, mime: "image/jpeg", data: "A".repeat(Math.ceil((bytes * 4) / 3)) })

test("the bytes of a base64 payload are read from its length", () => {
  expect(base64Bytes("")).toBe(0)
  expect(base64Bytes("AAAA")).toBe(3)
  expect(base64Bytes("AAA=")).toBe(2)
})

test("a photo the desktop would refuse is refused on the phone too", () => {
  expect(attachmentProblem(photo(1024))).toBeUndefined()
  expect(attachmentProblem(photo(MAX_IMAGE_BYTES))).toBeUndefined()
  expect(attachmentProblem(photo(MAX_IMAGE_BYTES + 1))).toContain("5 MB")
  expect(attachmentProblem({ name: "photo.jpg", data: "" })).toContain("could not be read")
})

test("attachments that fit are accepted and the ones that do not are named", () => {
  const { accepted, refused } = acceptAttachments([], [photo(1024), photo(MAX_IMAGE_BYTES + 1, "big.jpg")])
  expect(accepted).toHaveLength(1)
  expect(refused).toEqual([{ name: "big.jpg", reason: expect.stringContaining("5 MB") }])
})

test("the desktop takes five attachments per message", () => {
  const many = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, index) => photo(1024, `photo-${index}.jpg`))
  const { accepted, refused } = acceptAttachments([], many)
  expect(accepted).toHaveLength(MAX_ATTACHMENTS)
  expect(refused).toHaveLength(2)
  expect(refused[0]!.reason).toContain("5 attachments")
})

test("a photo gets a name of its own", () => {
  expect(photoName(Date.UTC(2026, 9, 17, 9, 5, 3))).toBe("photo-2026-10-17T09-05-03-000Z.jpg")
})
