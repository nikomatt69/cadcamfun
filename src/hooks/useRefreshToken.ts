// src/hooks/useRefreshToken.ts

import { useEffect, useRef } from "react";
import { useSession } from "../lib/auth-client";

export default function useRefreshToken() {
  const { data: session, isPending } = useSession();
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPending && session?.user) {
      // Better Auth with JWT doesn't need refresh tokens like NextAuth
      // But we can still validate the session periodically
      const validateSession = async () => {
        try {
          const res = await fetch("/api/auth/get-session");
          if (!res.ok) {
            console.warn("Session validation failed");
          }
        } catch (error) {
          console.error("Error validating session:", error);
        }
      };

      // Validate session every 15 minutes
      refreshInterval.current = setInterval(validateSession, 15 * 60 * 1000);
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    };
  }, [session, isPending]);

}
