/**
 * What the pairing scanner shows for the camera permission. Pure so the three states (not asked yet,
 * refused but askable, refused for good) are tested without a device.
 */

/** The slice of expo-camera's `PermissionResponse` the scanner reads. */
export interface CameraPermissionLike {
  readonly granted: boolean
  readonly canAskAgain: boolean
}

export type CameraAccess =
  /** The permission is still loading. */
  | "pending"
  | "granted"
  /** Not granted yet and iOS will still show its prompt. */
  | "ask"
  /** Refused: iOS never asks twice, so the only way back is Settings. */
  | "blocked"

export const cameraAccess = (permission: CameraPermissionLike | null | undefined): CameraAccess => {
  if (!permission) return "pending"
  if (permission.granted) return "granted"
  return permission.canAskAgain ? "ask" : "blocked"
}

/**
 * A QR that is not a CADCAMFUN pairing code stays in front of the camera at 30 frames a second; without a
 * pause the same failure would be reported, and buzz, every frame.
 */
export const SCAN_RETRY_MS = 1600

/** The line under the viewfinder for each state of the scan. */
export const scannerHint = (state: { readonly busy: boolean; readonly failed: boolean; readonly desktop?: string }): string => {
  if (state.busy) return state.desktop ? `Connecting to ${state.desktop}…` : "Connecting to your desktop…"
  if (state.failed) return "That is not a CADCAMFUN pairing code. Scan the one on your Mac."
  return "Point the camera at the QR code on your Mac"
}
