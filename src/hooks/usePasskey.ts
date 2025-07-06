import { useState } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

export function usePasskey() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get registration options from server
      const response = await fetch("/api/auth/passkey/register");
      const options = await response.json();

      if (!response.ok) {
        throw new Error(options.error || "Failed to get registration options");
      }

      // Start WebAuthn registration
      const registrationResponse = await startRegistration(options);

      // Send response to server for verification
      const verificationResponse = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ response: registrationResponse }),
      });

      const result = await verificationResponse.json();

      if (!verificationResponse.ok) {
        throw new Error(result.error || "Failed to register passkey");
      }

      return { success: true, message: "Passkey registered successfully!" };
    } catch (err: any) {
      const errorMsg = err.message || "Failed to register passkey";
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const authenticateWithPasskey = async (email?: string) => {
    setLoading(true);
    setError(null);

    try {
      // Get authentication options from server
      const url = email
        ? `/api/auth/passkey/authenticate?email=${email}`
        : "/api/auth/passkey/authenticate";
      const response = await fetch(url);
      const options = await response.json();

      if (!response.ok) {
        throw new Error(
          options.error || "Failed to get authentication options"
        );
      }

      // Start WebAuthn authentication
      const authenticationResponse = await startAuthentication(options);

      // Send response to server for verification
      const verificationResponse = await fetch(
        "/api/auth/passkey/authenticate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            response: authenticationResponse,
            challengeId: options.challengeId, // Use challengeId instead of challenge
          }),
        }
      );

      const result = await verificationResponse.json();

      if (!verificationResponse.ok) {
        throw new Error(result.error || "Failed to authenticate with passkey");
      }

      return result.user;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to authenticate with passkey";
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const isPasskeySupported = () => {
    return (
      typeof window !== "undefined" &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable === "function"
    );
  };

  return {
    registerPasskey,
    authenticateWithPasskey,
    isPasskeySupported,
    loading,
    error,
  };
}
