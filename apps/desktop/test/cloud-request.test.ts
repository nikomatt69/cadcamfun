/** The account token rides only on cloud calls, and a phone token is read only from a cloud pairing link. */
import { expect, test } from "bun:test"
import { deviceTokenFromLink, isCloudRequestPath } from "../src/app/cloud-request.ts"

const TOKEN = "phone-token-value-16"

test("cloud routes are the only ones that carry the account token", () => {
  expect(isCloudRequestPath("/api/cloud/connection")).toBe(true)
  expect(isCloudRequestPath("/api/cloud/enroll")).toBe(true)
  expect(isCloudRequestPath("http://127.0.0.1:9/api/cloud/pair")).toBe(true)
  expect(isCloudRequestPath("/api/projects/abc/cloud/publish")).toBe(true)
  expect(isCloudRequestPath("/api/projects/abc/cloud/status")).toBe(true)
  expect(isCloudRequestPath("/api/projects/abc/cloud/fetch")).toBe(true)
  expect(isCloudRequestPath("/api/projects/abc/cloud/apply")).toBe(true)
  expect(isCloudRequestPath("/api/companion")).toBe(false)
  expect(isCloudRequestPath("/api/projects")).toBe(false)
  expect(isCloudRequestPath("/api/projects/abc")).toBe(false)
})

test("a phone token is taken only from a private cloud pairing link", () => {
  const link = `cadcamfun://pair?mode=cloud&workspace=mine&host=https://personal.example&token=${TOKEN}&name=iPhone`
  expect(deviceTokenFromLink(link)).toBe(TOKEN)
  expect(deviceTokenFromLink("cadcamfun://pair?host=https://mac.local&token=abcdefghijklmnopqrstuvwxyz&fp=ab&name=iPhone")).toBeUndefined()
  expect(deviceTokenFromLink("https://example.com")).toBeUndefined()
  expect(deviceTokenFromLink("not a link")).toBeUndefined()
})
