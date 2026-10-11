import * as LocalAuthentication from "expo-local-authentication"

/**
 * Biometric capability + one-shot authentication (nikcli: lib/biometrics.ts).
 * AppLockCoordinator owns the overlay; this module owns the system query so the
 * settings screen and the lock share one contract.
 */

export type BiometricLabel = "Face ID" | "Touch ID" | "biometrics"

export interface BiometricCapability {
  readonly available: boolean
  readonly enrolled: boolean
  readonly types: readonly LocalAuthentication.AuthenticationType[]
}

const UNAVAILABLE: BiometricCapability = { available: false, enrolled: false, types: [] }

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ])
    return { available, enrolled, types }
  } catch {
    return UNAVAILABLE
  }
}

export function biometricLabel(types: readonly LocalAuthentication.AuthenticationType[] = []): BiometricLabel {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Face ID"
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Touch ID"
  return "biometrics"
}

export async function authenticate(prompt: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      disableDeviceFallback: false,
      fallbackLabel: "Use passcode",
    })
    return result.success === true
  } catch {
    return false
  }
}
