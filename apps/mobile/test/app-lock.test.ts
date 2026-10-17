import { expect, test } from "bun:test"
import { coverWhenInactive, lockAfterLabel, lockOnResume, lockWhenBackgrounded, unlockFailureMessage } from "../lib/app-lock"

const policy = { biometricsEnabled: true, lockOnBackground: true, lockAfterSeconds: 60 }

test("the lock respects the grace period and engages immediately without one", () => {
  expect(lockWhenBackgrounded(policy)).toBe(false)
  expect(lockWhenBackgrounded({ ...policy, lockAfterSeconds: 0 })).toBe(true)
  expect(lockOnResume(policy, 1_000, 1_000 + 59_999)).toBe(false)
  expect(lockOnResume(policy, 1_000, 1_000 + 60_000)).toBe(true)
  expect(lockOnResume({ ...policy, lockAfterSeconds: 0 }, 1_000, 1_001)).toBe(true)
})

test("disabled locks never engage, a backwards clock always locks", () => {
  expect(lockOnResume({ ...policy, biometricsEnabled: false }, 0, 10_000_000)).toBe(false)
  expect(lockOnResume({ ...policy, lockOnBackground: false }, 0, 10_000_000)).toBe(false)
  expect(lockOnResume(policy, undefined, 10_000_000)).toBe(false)
  expect(lockOnResume(policy, 5_000, 1_000)).toBe(true)
  expect(lockOnResume({ ...policy, lockAfterSeconds: Number.NaN }, 1_000, 1_001)).toBe(true)
})

test("unlock failures are actionable and cancellations are silent", () => {
  expect(unlockFailureMessage("user_cancel")).toBeUndefined()
  expect(unlockFailureMessage("passcode_not_set")).toContain("unpair")
  expect(unlockFailureMessage("lockout")).toContain("passcode")
  expect(lockAfterLabel(300)).toBe("After 5 minutes")
  expect(lockAfterLabel(1200)).toBe("After 20 minutes")
})

test("the app switcher snapshot is covered by the privacy cover or by an immediate lock", () => {
  expect(coverWhenInactive({ ...policy, privacyCover: true, biometricsEnabled: false })).toBe(true)
  expect(coverWhenInactive({ ...policy, privacyCover: false })).toBe(false)
  expect(coverWhenInactive({ ...policy, privacyCover: false, lockAfterSeconds: 0 })).toBe(true)
  expect(coverWhenInactive({ ...policy, privacyCover: false, lockAfterSeconds: 0, lockOnBackground: false })).toBe(false)
})
