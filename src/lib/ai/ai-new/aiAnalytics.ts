// src/lib/ai/aiAnalytics.ts
import { AIAnalyticsEvent, AIPerformanceMetrics, AIModelType } from "src/types/AITypes";
import { userAnalyticsService } from "./userAnalytics";
import { MODEL_COSTS } from "./aiConfigManager";

/**
 * Servizio di analytics per monitorare e tracciare le interazioni con i modelli AI
 */
export class AIAnalytics {
  private events: AIAnalyticsEvent[] = [];
  private metrics: AIPerformanceMetrics = {
    averageResponseTime: 0,
    successRate: 100,
    tokenUsage: 0,
    costEfficiency: 1,
    modelUsage: {} as Record<AIModelType, number>,
    errors: {
      count: 0,
      types: {}
    }
  };
  private isEnabled: boolean = true;
  private readonly MAX_EVENTS = 1000;

  constructor() {
    this.initializeMetrics();

    // Pulisci gli eventi vecchi periodicamente
    if (typeof window !== "undefined") {
      setInterval(() => this.pruneEvents(), 1000 * 60 * 10); // ogni 10 minuti
    }
  }

  /**
   * Inizializza le metriche di performance
   */
  private initializeMetrics(): void {
    this.metrics = {
      averageResponseTime: 0,
      successRate: 100,
      tokenUsage: 0,
      costEfficiency: 1,
      modelUsage: {} as Record<AIModelType, number>,
      errors: {
        count: 0,
        types: {}
      }
    };
  }

  /**
   * Traccia un nuovo evento AI
   */
  trackEvent(event: Omit<AIAnalyticsEvent, "timestamp">): void {
    if (!this.isEnabled) return;

    const fullEvent: AIAnalyticsEvent = {
      ...event,
      timestamp: Date.now()
    };

    this.events.push(fullEvent);

    // Aggiorna le metriche in tempo reale
    this.updateMetrics(fullEvent);

    // Limita la dimensione della storia degli eventi
    this.pruneEvents();

    // Invia l'evento al backend se configurato
    this.sendToAnalyticsBackend(fullEvent);
  }

  /**
   * Traccia l'inizio di una richiesta AI
   */
  trackRequestStart(name: string, model: string, metadata?: Record<string, any>): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    this.trackEvent({
      eventType: "request",
      eventName: name,
      model,
      metadata: {
        ...metadata,
        requestId
      }
    });

    return requestId;
  }

  /**
   * Traccia il completamento di una richiesta AI
   */
  trackRequestComplete(
    requestId: string,
    durationMs: number,
    success: boolean = true,
    promptTokens: number = 0,
    completionTokens: number = 0,
    userId?: string,
    model?: string,
    requestType?: string
  ): void {
    this.trackEvent({
      eventType: "response",
      eventName: "request_complete",
      duration: durationMs,
      success,
      promptTokens,
      completionTokens,
      metadata: { requestId, userId, model, requestType }
    });

    // Traccia anche nel servizio user analytics se abbiamo userId e modello
    if (userId && model && success && (promptTokens > 0 || completionTokens > 0)) {
      userAnalyticsService.trackUserUsage(
        userId,
        model as AIModelType,
        promptTokens,
        completionTokens,
        requestType,
        requestId
      );
    }
  }

  /**
   * Traccia il feedback dell'utente sui risultati AI
   */
  trackFeedback(requestId: string, rating: number, comment?: string): void {
    this.trackEvent({
      eventType: "feedback",
      eventName: "user_feedback",
      feedbackRating: rating,
      metadata: {
        requestId,
        comment,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Abilita o disabilita il tracciamento analytics
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Restituisce le metriche attuali
   */
  getMetrics(): AIPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Ottiene statistiche per il dashboard
   */
  getStats(): Record<string, any> {
    const totalRequests = this.events.filter(e => e.eventType === "request").length;
    const successfulRequests = this.events.filter(e => e.eventType === "response" && e.success).length;

    const avgDuration = this.calculateAverageResponseTime(this.getRecentEvents(3600)); // ultima ora

    return {
      totalRequests,
      successRate: totalRequests ? (successfulRequests / totalRequests) * 100 : 100,
      averageResponseTime: avgDuration,
      tokenUsage: this.metrics.tokenUsage,
      eventCount: this.events.length,
      errorRate: totalRequests ? (this.metrics.errors.count / totalRequests) * 100 : 0
    };
  }

  /**
   * Ottiene gli eventi recenti
   */
  getRecentEvents(seconds: number = 300): AIAnalyticsEvent[] {
    const cutoffTime = Date.now() - seconds * 1000;
    return this.events.filter(event => event.timestamp >= cutoffTime);
  }

  /**
   * Aggiorna le metriche basate su un nuovo evento
   */
  private updateMetrics(event: AIAnalyticsEvent): void {
    const recentEvents = this.getRecentEvents(1800); // ultimi 30 minuti

    // Aggiorna il tempo di risposta medio
    if (event.eventType === "response" && event.duration) {
      const responseTimes = recentEvents
        .filter(e => e.eventType === "response" && e.duration)
        .map(e => e.duration || 0);

      this.metrics.averageResponseTime =
        responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
    }

    // Aggiorna il success rate
    if (event.eventType === "response") {
      const responses = recentEvents.filter(e => e.eventType === "response");
      const successful = responses.filter(e => e.success).length;

      this.metrics.successRate = responses.length > 0 ? (successful / responses.length) * 100 : 100;
    }

    // Aggiorna l'utilizzo del modello
    if (event.eventType === "request" && event.model && this.isValidModel(event.model as AIModelType)) {
      const model = event.model as AIModelType;
      this.metrics.modelUsage[model] = (this.metrics.modelUsage[model] || 0) + 1;
    }

    // Aggiorna l'utilizzo dei token
    if (event.promptTokens || event.completionTokens) {
      const promptTokens = event.promptTokens || 0;
      const completionTokens = event.completionTokens || 0;

      this.metrics.tokenUsage += promptTokens + completionTokens;
    }

    // Aggiorna le statistiche sugli errori
    if (event.eventType === "error") {
      this.metrics.errors.count++;

      if (event.errorType) {
        this.metrics.errors.types[event.errorType] = (this.metrics.errors.types[event.errorType] || 0) + 1;
      }
    }

    // Calcola l'efficienza dei costi
    this.updateCostEfficiency(recentEvents);
  }

  /**
   * Calcola l'efficienza dei costi
   */
  private updateCostEfficiency(events: AIAnalyticsEvent[]): void {
    let totalCost = 0;
    let totalSuccessTokens = 0;

    events.forEach(event => {
      if (event.eventType === "response") {
        const model = event.model as AIModelType;
        const promptTokens = event.promptTokens || 0;
        const completionTokens = event.completionTokens || 0;
        
        // Ottieni i costi dal config manager (ora in $ per 1M tokens)
        const costs = MODEL_COSTS[model] || MODEL_COSTS["claude-3-7-sonnet-20250219"];
        
        // Calcola costo: (tokens / 1M) * prezzo per 1M tokens
        const inputCost = (promptTokens / 1000000) * costs.input;
        const outputCost = (completionTokens / 1000000) * costs.output;
        const cost = inputCost + outputCost;

        totalCost += cost;

        if (event.success) {
          totalSuccessTokens += promptTokens + completionTokens;
        }
      }
    });

    // Efficienza = token prodotti con successo per dollaro
    this.metrics.costEfficiency = totalCost > 0 ? totalSuccessTokens / totalCost : 1;
  }

  /**
   * Limita il numero di eventi memorizzati
   */
  private pruneEvents(): void {
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }
  }

  /**
   * Verifica se il modello è valido
   */
  private isValidModel(model: string): model is AIModelType {
    return [
      "claude-opus-4-20250514",
      "claude-3-7-sonnet-20250219",
      "claude-3-haiku-20240229",
      "claude-sonnet-4-20250514"
    ].includes(model);
  }

  /**
   * Calcola il tempo di risposta medio per un insieme di eventi
   */
  private calculateAverageResponseTime(events: AIAnalyticsEvent[]): number {
    const responseTimes = events
      .filter(event => event.eventType === "response" && event.duration !== undefined)
      .map(event => event.duration || 0);

    return responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
  }

  /**
   * Invia eventi al backend di analytics
   */
  private sendToAnalyticsBackend(event: AIAnalyticsEvent): void {
    if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_AI_ANALYTICS_ENDPOINT) {
      return;
    }

    try {
      navigator.sendBeacon(process.env.NEXT_PUBLIC_AI_ANALYTICS_ENDPOINT, JSON.stringify(event));
    } catch (e) {
      console.error("Failed to send analytics event:", e);
    }
  }
}

// Esporta un'istanza singleton
export const aiAnalytics = new AIAnalytics();
