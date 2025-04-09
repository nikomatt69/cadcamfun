import type { AIModelType, AIPerformanceMetrics } from 'src/types/ai'

export class AIAnalytics {
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
  private events: any[] = [];
  private readonly MAX_EVENTS = 1000;

  constructor() {
    this.initializeMetrics();
  }

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

  trackRequestStart(type: string, model: AIModelType, metadata: Record<string, any> = {}) {
    const requestId = this.generateRequestId();
    this.events.push({
      id: requestId,
      type,
      model,
      startTime: Date.now(),
      metadata
    });
    return requestId;
  }

  trackRequestComplete(requestId: string, duration: number, success: boolean = true) {
    const event = this.events.find(e => e.id === requestId);
    if (event) {
      event.duration = duration;
      event.success = success;
      this.updateMetrics(event);
    }
    this.pruneEvents();
  }

  trackError(type: string, details: any) {
    this.metrics.errors.count++;
    this.metrics.errors.types[type] = (this.metrics.errors.types[type] || 0) + 1;
    
    this.events.push({
      type: 'error',
      errorType: type,
      timestamp: Date.now(),
      details
    });
    
    this.pruneEvents();
  }

  getMetrics(): AIPerformanceMetrics {
    return { ...this.metrics };
  }

  getRecentEvents(seconds: number = 300): any[] {
    const cutoff = Date.now() - (seconds * 1000);
    return this.events.filter(event => event.startTime >= cutoff);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMetrics(event: any): void {
    // Update average response time
    const recentEvents = this.getRecentEvents();
    this.metrics.averageResponseTime = recentEvents.reduce(
      (acc, e) => acc + (e.duration || 0), 
      0
    ) / recentEvents.length;

    // Update success rate
    const successfulEvents = recentEvents.filter(e => e.success).length;
    this.metrics.successRate = (successfulEvents / recentEvents.length) * 100;
    // Update model usage
    if (event.model && this.isValidModel(event.model)) {
      const model = event.model as AIModelType;
      this.metrics.modelUsage[model] = (this.metrics.modelUsage[model] || 0) + 1;
    }

    // Update cost efficiency 
    this.updateCostEfficiency();
  }

  private updateCostEfficiency(): void {
    const recentEvents = this.getRecentEvents();
    const totalCost = recentEvents.reduce((acc, event) => {
      const modelCost = this.getModelCost(event.model);
      return acc + (event.duration * modelCost);
    }, 0);

    const successfulEvents = recentEvents.filter(e => e.success).length;
    this.metrics.costEfficiency = successfulEvents / (totalCost || 1);
  }

  private getModelCost(model: AIModelType): number {
    const costs: Record<AIModelType, number> = {
      'claude-3-opus-20240229': 0.15,
      'claude-3-5-sonnet-20240229': 0.08,
      'claude-3-haiku-20240229': 0.03,
      'claude-3-7-sonnet-20250219': 0.08  // Added missing model with same cost as current sonnet
    };
    return costs[model] || 0.08;
  }

  private pruneEvents(): void {
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }
  }

  private isValidModel(model: any): model is AIModelType {
    return ['claude-3-opus-20240229', 'claude-3-5-sonnet-20240229', 'claude-3-haiku-20240229','claude-3-7-sonnet-20250219'].includes(model);
  }
}

export const aiAnalytics = new AIAnalytics();