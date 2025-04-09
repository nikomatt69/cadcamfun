// src/lib/ai/aiAnalytics.ts
export interface AIAnalyticsEvent {
  eventType: 'request' | 'response' | 'error' | 'feedback';
  eventName: string;
  timestamp: number;
  duration?: number; // milliseconds
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  success?: boolean;
  errorType?: string;
  feedbackRating?: number; // 1-5
  metadata?: Record<string, any>;
}

export class AIAnalytics {
  private events: AIAnalyticsEvent[] = [];
  private isEnabled: boolean = true;
  
  // Track a new AI event
  trackEvent(event: Omit<AIAnalyticsEvent, 'timestamp'>): void {
    if (!this.isEnabled) return;
    
    const fullEvent: AIAnalyticsEvent = {
      ...event,
      timestamp: Date.now()
    };
    
    this.events.push(fullEvent);
    
    // Optionally send to analytics service immediately
    this.sendToAnalyticsService(fullEvent);
    
    // Keep event history manageable
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }
  
  // Track the start of an AI request
  trackRequestStart(name: string, model: string, metadata?: Record<string, any>): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    this.trackEvent({
      eventType: 'request',
      eventName: name,
      model,
      metadata: {
        ...metadata,
        requestId
      }
    });
    
    return requestId;
  }
  
  // Track the completion of an AI request
  trackRequestComplete(
    requestId: string, 
    durationMs: number, 
    success: boolean, 
    promptTokens?: number, 
    completionTokens?: number
  ): void {
    this.trackEvent({
      eventType: 'response',
      eventName: 'request_complete',
      duration: durationMs,
      success,
      promptTokens,
      completionTokens,
      metadata: { requestId }
    });
  }
  
  // Track user feedback on AI results
  trackFeedback(requestId: string, rating: number, comment?: string): void {
    this.trackEvent({
      eventType: 'feedback',
      eventName: 'user_feedback',
      feedbackRating: rating,
      metadata: { requestId, comment }
    });
  }
  
  // Toggle analytics tracking
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }
  
  // Get event statistics
  getStats(): Record<string, any> {
    // Calculate usage statistics
    const totalRequests = this.events.filter(e => e.eventType === 'request').length;
    const successfulRequests = this.events.filter(
      e => e.eventType === 'response' && e.success
    ).length;
    const averageDuration = this.events
      .filter(e => e.duration !== undefined)
      .reduce((sum, e) => sum + (e.duration || 0), 0) / totalRequests || 0;
    
    return {
      totalRequests,
      successRate: totalRequests ? (successfulRequests / totalRequests) : 0,
      averageDuration,
      eventCount: this.events.length
    };
  }

  getRecentEvents(seconds: number = 300): AIAnalyticsEvent[] {
    const cutoffTime = Date.now() - (seconds * 1000);
    return this.events.filter(event => event.timestamp >= cutoffTime);
  }
  
  // Optional: send to an analytics service
  private sendToAnalyticsService(event: AIAnalyticsEvent): void {
    // Implementation would depend on your analytics service
    // Example: using a custom endpoint
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_AI_ANALYTICS_ENDPOINT) {
      try {
        navigator.sendBeacon(
          process.env.NEXT_PUBLIC_AI_ANALYTICS_ENDPOINT,
          JSON.stringify(event)
        );
      } catch (e) {
        console.error('Failed to send AI analytics event', e);
      }
    }
  }
}

// Export a singleton instance
export const aiAnalytics = new AIAnalytics();