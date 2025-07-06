
import { useMemo } from "react";
import { useSession } from "../lib/auth-client";

// Cache globale per la sessione (in-memory)
let sessionCache: {
  data: any;
  status: string;
  timestamp: number;
  ttl: number;
} | null = null;

const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minuti

/**
 * Hook ottimizzato per  che riduce le richieste ripetute
 * Usa un cache in-memory condiviso tra tutti i componenti
 */
export function useOptimizedSession() {
  const originalSession = useSession();

  // Memoizza il risultato per evitare re-renders non necessari
  const optimizedSession = useMemo(() => {
    const now = Date.now();

    // Se abbiamo un cache valido, usalo
    if (sessionCache && (now - sessionCache.timestamp) < sessionCache.ttl) {
      console.log("🎯 Session cache HIT");
      return {
        data: sessionCache.data,
        status: sessionCache.status,
      };
    }

    // Aggiorna il cache solo se la sessione è caricata
    if (!originalSession.isPending) {
      console.log("🔄 Session cache UPDATE");
      sessionCache = {
        data: originalSession.data,
        status: originalSession.isPending ? "loading" : "authenticated",
        timestamp: now,
        ttl: SESSION_CACHE_TTL
      };
    }

    return {
      data: originalSession.data,
      status: originalSession.isPending ? "loading" : "authenticated",
    };
  }, [originalSession.data, originalSession.isPending]);

  return optimizedSession;
}

/**
 * Pulisce il cache della sessione
 * Utile quando si fa logout o cambia utente
 */
export function clearSessionCache() {
  sessionCache = null;
  console.log("🧹 Session cache cleared");
} 