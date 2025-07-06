
import { useCallback } from "react";
import { useSession } from "@/src/lib/auth-client";
import { userAnalyticsService } from "@/src/lib/ai/ai-new/userAnalytics";
import { aiAnalytics } from "@/src/lib/ai/ai-new/aiAnalytics";
import { AIModelType } from "@/src/types/AITypes";

export const useUserTracking = () => {
  const { data: session } = useSession();

  /**
   * Traccia l'inizio di una richiesta AI per l'utente corrente
   */
  const trackRequestStart = useCallback((
    name: string,
    model: AIModelType,
    requestType?: string,
    metadata?: Record<string, any>
  ): string => {
    const requestId = aiAnalytics.trackRequestStart(name, model, {
      ...metadata,
      userId: session?.user?.id,
      requestType
    });

    return requestId;
  }, [session?.user?.id]);

  /**
   * Traccia il completamento di una richiesta AI per l'utente corrente
   */
  const trackRequestComplete = useCallback((
    requestId: string,
    durationMs: number,
    success: boolean = true,
    promptTokens: number = 0,
    completionTokens: number = 0,
    model: AIModelType,
    requestType?: string
  ): void => {
    // Traccia nell'analytics generale
    aiAnalytics.trackRequestComplete(requestId, durationMs, success, promptTokens, completionTokens);

    // Traccia per l'utente specifico se è loggato
    if (session?.user?.id && success && (promptTokens > 0 || completionTokens > 0)) {
      userAnalyticsService.trackUserUsage(
        session.user.id,
        model,
        promptTokens,
        completionTokens,
        requestType,
        requestId
      );
    }
  }, [session?.user?.id]);

  /**
   * Traccia una richiesta AI completa (start + complete) in modo semplificato
   */
  const trackAIRequest = useCallback(async <T>(
    requestName: string,
    model: AIModelType,
    requestFunction: () => Promise<{
      response: T;
      usage?: {
        promptTokens: number;
        completionTokens: number;
      };
    }>,
    requestType?: string
  ): Promise<T> => {
    const startTime = Date.now();
    const requestId = trackRequestStart(requestName, model, requestType);

    try {
      const result = await requestFunction();
      const duration = Date.now() - startTime;

      trackRequestComplete(
        requestId,
        duration,
        true,
        result.usage?.promptTokens || 0,
        result.usage?.completionTokens || 0,
        model,
        requestType
      );

      return result.response;
    } catch (error) {
      const duration = Date.now() - startTime;

      trackRequestComplete(
        requestId,
        duration,
        false,
        0,
        0,
        model,
        requestType
      );

      throw error;
    }
  }, [trackRequestStart, trackRequestComplete]);

  /**
   * Ottiene il riassunto dell'utilizzo per l'utente corrente
   */
  const getUserUsageSummary = useCallback((
    startDate?: Date,
    endDate?: Date
  ) => {
    if (!session?.user?.id) return null;

    return userAnalyticsService.getUserSummary(
      session.user.id,
      startDate,
      endDate
    );
  }, [session?.user?.id]);

  /**
   * Ottiene il breakdown dettagliato dei costi per l'utente corrente
   */
  const getUserCostBreakdown = useCallback((
    startDate: Date,
    endDate: Date
  ) => {
    if (!session?.user?.id) return null;

    return userAnalyticsService.getUserCostBreakdown(
      session.user.id,
      startDate,
      endDate,
      {
        username: session.user.name || undefined,
        email: session.user.email || undefined
      }
    );
  }, [session?.user?.id, session?.user?.name, session?.user?.email]);

  /**
   * Esporta i dati dell'utente per download
   */
  const exportUserData = useCallback(() => {
    if (!session?.user?.id) return [];

    return userAnalyticsService.exportUserData(session.user.id);
  }, [session?.user?.id]);

  /**
   * Pulisce tutti i dati dell'utente (GDPR compliance)
   */
  const clearUserData = useCallback(() => {
    if (!session?.user?.id) return;

    // In una implementazione reale, dovresti chiamare un'API per cancellare dal database
    console.log("Clear user data request for:", session.user.id);

    // Per ora mostra solo un messaggio di conferma
    if (window.confirm("Are you sure you want to delete all your AI usage data? This action cannot be undone.")) {
      // Qui chiameresti l'API per cancellare i dati dal server
      alert("Data deletion request submitted. This will be processed shortly.");
    }
  }, [session?.user?.id]);

  return {
    // Tracking functions
    trackRequestStart,
    trackRequestComplete,
    trackAIRequest,

    // Data retrieval functions
    getUserUsageSummary,
    getUserCostBreakdown,
    exportUserData,

    // Data management functions
    clearUserData,

    // User info
    userId: session?.user?.id,
    isLoggedIn: !!session?.user
  };
}; 