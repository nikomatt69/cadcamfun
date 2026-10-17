/**
 * When the Face ID lock engages (nikcli: AppLockOverlay + security settings).
 * Pure so the policy is tested without a device; AppLockCoordinator owns the AppState wiring.
 */

export interface LockPolicy {
  readonly biometricsEnabled: boolean
  readonly lockOnBackground: boolean
  /** 0 locks as soon as the app leaves the foreground. */
  readonly lockAfterSeconds: number
}

/** "Require unlock" choices, as iOS offers for its own passcode. */
export const LOCK_AFTER_OPTIONS: readonly { readonly seconds: number; readonly label: string }[] = [
  { seconds: 0, label: "Immediately" },
  { seconds: 60, label: "After 1 minute" },
  { seconds: 300, label: "After 5 minutes" },
  { seconds: 900, label: "After 15 minutes" },
]

export const lockAfterLabel = (seconds: number): string =>
  LOCK_AFTER_OPTIONS.find((option) => option.seconds === seconds)?.label ?? `After ${Math.round(seconds / 60)} minutes`

const graceOf = (policy: LockPolicy): number => Number.isFinite(policy.lockAfterSeconds) && policy.lockAfterSeconds > 0 ? policy.lockAfterSeconds : 0

/** Lock at once when the app goes to the background, so the app switcher snapshot is the lock screen. */
export const lockWhenBackgrounded = (policy: LockPolicy): boolean =>
  policy.biometricsEnabled && policy.lockOnBackground && graceOf(policy) === 0

/**
 * Lock on return when the app spent at least the grace period in the background.
 * A clock that went backwards (time zone or manual change) locks: the elapsed time is unknown.
 */
export const lockOnResume = (policy: LockPolicy, backgroundedAt: number | undefined, now: number): boolean => {
  if (!policy.biometricsEnabled || !policy.lockOnBackground || backgroundedAt === undefined) return false
  const elapsed = now - backgroundedAt
  if (!Number.isFinite(elapsed) || elapsed < 0) return true
  return elapsed >= graceOf(policy) * 1000
}

/** Why an unlock attempt failed, in words the user can act on. `undefined` means the user cancelled. */
export const unlockFailureMessage = (error: string | undefined): string | undefined => {
  switch (error) {
    case undefined:
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
      return undefined
    case "not_enrolled":
    case "passcode_not_set":
      return "Face ID and the device passcode are off. Turn one on in iOS Settings, or unpair this phone to reset the lock."
    case "lockout":
      return "Too many attempts. Unlock the iPhone with its passcode, then try again."
    case "not_available":
      return "Authentication is unavailable right now. Try again in a moment."
    default:
      return "Could not unlock. Try again."
  }
}
