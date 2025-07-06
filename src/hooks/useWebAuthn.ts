import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/src/lib/auth-client";

interface WebAuthnSupport {
  available: boolean;
  platformAuthenticator: boolean;
  crossPlatformAuthenticator: boolean;
  conditionalMediation: boolean;
  userVerifying: boolean;
  residentKey: boolean;
}

interface PasskeyData {
  id: string;
  credentialID: string;
  transports: string[];
  counter: number;
}

export const useWebAuthn = () => {
  const { data: session } = useSession();

  const [support, setSupport] = useState<WebAuthnSupport>({
    available: false,
    platformAuthenticator: false,
    crossPlatformAuthenticator: false,
    conditionalMediation: false,
    userVerifying: false,
    residentKey: false,
  });
  const [passkeys, setPasskeys] = useState<PasskeyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check WebAuthn support on mount
  useEffect(() => {
    checkWebAuthnSupport();
  }, []);

  // Load user's passkeys when session is available
  useEffect(() => {
    if (session?.user) {
      loadPasskeys();
    }
  }, [session]);

  const checkWebAuthnSupport = async () => {
    try {
      const available = !!(
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential === "function"
      );

      if (!available) {
        setSupport((prev) => ({ ...prev, available: false }));
        return;
      }

      const [platformAuthenticator, conditionalMediation] = await Promise.all([
        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ||
        Promise.resolve(false),
        window.PublicKeyCredential.isConditionalMediationAvailable?.() ||
        Promise.resolve(false),
      ]);

      // Cross-platform support detection (manual check)
      const crossPlatformAuthenticator = available;

      setSupport({
        available: true,
        platformAuthenticator,
        crossPlatformAuthenticator,
        conditionalMediation,
        userVerifying: platformAuthenticator,
        residentKey: conditionalMediation,
      });
    } catch (error) {
      console.error("Error checking WebAuthn support:", error);
      setSupport((prev) => ({ ...prev, available: false }));
    }
  };

  const loadPasskeys = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/auth/passkey/list");
      if (response.ok) {
        const data = await response.json();
        setPasskeys(data.passkeys || []);
      }
    } catch (error) {
      console.error("Error loading passkeys:", error);
      setError("Failed to load passkeys");
    } finally {
      setLoading(false);
    }
  };

  const registerPasskey = useCallback(
    async (deviceName?: string) => {
      if (!support.available) {
        throw new Error("WebAuthn not supported");
      }

      if (!session?.user) {
        throw new Error("User not authenticated");
      }

      try {
        setLoading(true);
        setError(null);

        // Get registration options from server
        const optionsResponse = await fetch("/api/auth/passkey/register");
        if (!optionsResponse.ok) {
          throw new Error("Failed to get registration options");
        }

        const options = await optionsResponse.json();

        // Convert base64url to Uint8Array for WebAuthn
        const credentialCreationOptions = {
          ...options,
          user: {
            ...options.user,
            id: new Uint8Array(Buffer.from(options.user.id, "base64")),
          },
          challenge: new Uint8Array(
            Buffer.from(options.challenge, "base64url")
          ),
          excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
            ...cred,
            id: new Uint8Array(Buffer.from(cred.id, "base64")),
          })),
        };

        // Create credential
        const credential = (await navigator.credentials.create({
          publicKey: credentialCreationOptions,
        })) as PublicKeyCredential;

        if (!credential) {
          throw new Error("Failed to create credential");
        }

        // Prepare response for server
        const response =
          credential.response as AuthenticatorAttestationResponse;
        const attestationResponse = {
          id: credential.id,
          rawId: Array.from(new Uint8Array(credential.rawId)),
          response: {
            attestationObject: Array.from(
              new Uint8Array(response.attestationObject)
            ),
            clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)),
            transports: response.getTransports?.() || [],
          },
          type: credential.type,
          clientExtensionResults: credential.getClientExtensionResults(),
          authenticatorAttachment: (credential as any).authenticatorAttachment,
        };

        // Send to server for verification
        const verifyResponse = await fetch("/api/auth/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: attestationResponse,
            challengeId: options.challengeId,
            deviceName,
          }),
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json();
          throw new Error(errorData.error || "Registration failed");
        }

        // Reload passkeys list
        await loadPasskeys();

        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Registration failed";
        setError(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [support.available, session?.user]
  );

  const authenticateWithPasskey = useCallback(
    async (email?: string) => {
      if (!support.available) {
        throw new Error("WebAuthn not supported");
      }

      try {
        setLoading(true);
        setError(null);

        // Get authentication options from server
        const optionsResponse = await fetch(
          `/api/auth/passkey/authenticate${email ? `?email=${email}` : ""}`
        );
        if (!optionsResponse.ok) {
          throw new Error("Failed to get authentication options");
        }

        const options = await optionsResponse.json();

        // Convert base64url to Uint8Array for WebAuthn
        const credentialRequestOptions = {
          ...options,
          challenge: new Uint8Array(
            Buffer.from(options.challenge, "base64url")
          ),
          allowCredentials: options.allowCredentials?.map((cred: any) => ({
            ...cred,
            id: new Uint8Array(Buffer.from(cred.id, "base64")),
          })),
        };

        // Get credential
        const credential = (await navigator.credentials.get({
          publicKey: credentialRequestOptions,
        })) as PublicKeyCredential;

        if (!credential) {
          throw new Error("Failed to get credential");
        }

        // Prepare response for server
        const response = credential.response as AuthenticatorAssertionResponse;
        const assertionResponse = {
          id: credential.id,
          rawId: Array.from(new Uint8Array(credential.rawId)),
          response: {
            authenticatorData: Array.from(
              new Uint8Array(response.authenticatorData)
            ),
            clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)),
            signature: Array.from(new Uint8Array(response.signature)),
            userHandle: response.userHandle
              ? Array.from(new Uint8Array(response.userHandle))
              : null,
          },
          type: credential.type,
          clientExtensionResults: credential.getClientExtensionResults(),
        };

        // Send to server for verification
        const verifyResponse = await fetch("/api/auth/passkey/authenticate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: assertionResponse,
            challengeId: options.challengeId,
          }),
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json();
          throw new Error(errorData.error || "Authentication failed");
        }

        const result = await verifyResponse.json();
        return result.user;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Authentication failed";
        setError(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [support.available]
  );

  const deletePasskey = useCallback(async (passkeyId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/auth/passkey/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkeyId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete passkey");
      }

      // Reload passkeys list
      await loadPasskeys();

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete passkey";
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    support,
    passkeys,
    loading,
    error,
    registerPasskey,
    authenticateWithPasskey,
    deletePasskey,
    loadPasskeys,
    clearError: () => setError(null),
  };
};
