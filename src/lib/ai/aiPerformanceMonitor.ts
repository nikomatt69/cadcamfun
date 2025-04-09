import { aiAnalytics } from './aiAnalytics';
import { AIModelType } from '../../types/ai';

interface PerformanceMetrics {
  averageResponseTime: number;
  successRate: number;
  tokenUsage: number;
  costEfficiency: number;
  modelUsage: Record<AIModelType, number>;
}

interface AIStateInput {
  currentModel: AIModelType;
  settings: {
    [key: string]: any;
  };
  performance: {
    averageResponseTime: number;
    successRate: number;
    tokenUsage: number;
    [key: string]: any;
  };
  [key: string]: any;
}

export function optimizeAISettings(state: AIStateInput) {
  const monitor = AIPerformanceMonitor.getInstance();
  const metrics = monitor.getMetrics();
  
  return {
    maxTokens: metrics.averageResponseTime > 2000 ? 2000 : 4000, // Return number instead of boolean
    autoModelSelection: metrics.costEfficiency < 0.7,
    cacheEnabled: metrics.averageResponseTime > 1500,
    analyticsEnabled: true
  };
}

export class AIPerformanceMonitor {
  private static instance: AIPerformanceMonitor;
  private metrics: PerformanceMetrics = {
    averageResponseTime: 0,
    successRate: 100,
    tokenUsage: 0,
    costEfficiency: 1,
    modelUsage: {} as Record<AIModelType, number>,
  };

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): AIPerformanceMonitor {
    if (!AIPerformanceMonitor.instance) {
      AIPerformanceMonitor.instance = new AIPerformanceMonitor();
    }
    return AIPerformanceMonitor.instance;
  }

  private startMonitoring() {
    setInterval(() => this.updateMetrics(), 60000); // Every minute
  }

  private async updateMetrics() {
    const recentEvents = await aiAnalytics.getRecentEvents(300); // Last 5 minutes
    
    this.metrics = {
      averageResponseTime: this.calculateAverageResponseTime(recentEvents),
      successRate: this.calculateSuccessRate(recentEvents),
      tokenUsage: this.calculateTokenUsage(recentEvents),
      costEfficiency: this.calculateCostEfficiency(recentEvents),
      modelUsage: this.calculateModelUsage(recentEvents),
    };

    this.optimizeIfNeeded();
  }

  private optimizeIfNeeded() {
    if (this.metrics.successRate < 95 || this.metrics.averageResponseTime > 3000) {
      this.triggerOptimization();
    }
  }

  private triggerOptimization() {
    // Implement optimization logic
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public recordRequest(requestData: any) {
    // Record request metrics
  }

  public recordResponse(responseData: any) {
    // Record response metrics
  }

  private calculateAverageResponseTime(events: any[]): number {
    if (events.length === 0) return 0;
    
    const responseTimes = events
      .filter(event => event.duration !== undefined)
      .map(event => event.duration);
    
    return responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;
  }

  private calculateSuccessRate(events: any[]): number {
    if (events.length === 0) return 100;
    
    const successfulEvents = events.filter(event => event.success === true).length;
    return (successfulEvents / events.length) * 100;
  }

  private calculateTokenUsage(events: any[]): number {
    if (events.length === 0) return 0;
    
    return events.reduce((total, event) => {
      const promptTokens = event.promptTokens || 0;
      const completionTokens = event.completionTokens || 0;
      return total + promptTokens + completionTokens;
    }, 0);
  }

  private calculateCostEfficiency(events: any[]): number {
    if (events.length === 0) return 1;
    
    const totalCost = events.reduce((acc, event) => {
      const modelCost = this.getModelCost(event.model);
      return acc + (event.duration || 0) * modelCost;
    }, 0);

    const successfulEvents = events.filter(event => event.success === true).length;
    return totalCost > 0 ? successfulEvents / totalCost : 1;
  }

  private getModelCost(model: AIModelType): number {
    const costs: Record<AIModelType, number> = {
      'claude-3-opus-20240229': 0.15,
      'claude-3-5-sonnet-20240229': 0.08,
      'claude-3-haiku-20240229': 0.03,
      'claude-3-7-sonnet-20250219': 0.08  // Added missing model with same cost as current sonnet
    };
    return costs[model] || 0.08; // Default to sonnet cost if model not found
  }

  private calculateModelUsage(events: any[]): Record<AIModelType, number> {
    const usage: Record<AIModelType, number> = {
      'claude-3-opus-20240229': 0,
      'claude-3-5-sonnet-20240229': 0,
      'claude-3-haiku-20240229': 0,
      'claude-3-7-sonnet-20250219': 0  // Added missing model
    };
    
    events.forEach(event => {
      if (event.model && usage.hasOwnProperty(event.model)) {
        usage[event.model as AIModelType]++;
      }
    });
    
    return usage;
  }
}

export const aiPerformanceMonitor = AIPerformanceMonitor.getInstance();