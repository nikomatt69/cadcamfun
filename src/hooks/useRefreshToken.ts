// src/hooks/useRefreshToken.ts
import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';

export default function useRefreshToken() {
  const { data: session, status } = useSession();
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (status === 'authenticated' && session) {
      // Calcola il tempo prima della scadenza del token (20 minuti è tipico)
      const expiresAt = session.expires ? new Date(session.expires).getTime() : 0;
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      
      // Se il token è già scaduto o scadrà entro 5 minuti, aggiorna subito
      if (timeUntilExpiry <= 5 * 60 * 1000) {
        refreshSession();
      }
      
      // Imposta il refresh periodico (ogni 14 minuti se il token dura 20 minuti)
      refreshInterval.current = setInterval(refreshSession, 14 * 60 * 1000);
    }
    
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    };
  }, [status, session]);
  
  // Funzione per rinnovare la sessione
  const refreshSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        // Questo trigger un update della sessione in next-auth
        console.log('Token refreshed successfully');
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  };
}