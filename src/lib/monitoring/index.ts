// src/lib/monitoring/index.ts
// Enterprise Monitoring and Observability System

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timing';

export interface Metric {
  name: string;
  value: number;
  type: MetricType;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
}

export interface PerformanceMetrics {
  fps: number;
  memoryUsage?: number;
  renderTime?: number;
  activeElements: number;
  selectedElements: number;
}

class MonitoringService {
  private metrics: Metric[] = [];
  private maxMetrics = 1000;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private currentFps = 0;
  private lastFpsUpdate = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startFrameTracking();
    }
  }

  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.recordMetric({ name, value, type: 'counter', timestamp: Date.now(), tags });
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({ name, value, type: 'gauge', timestamp: Date.now(), tags });
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({ name, value, type: 'histogram', timestamp: Date.now(), tags });
  }

  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordMetric({ name, value: Date.now() - start, type: 'timing', timestamp: Date.now() });
      return result;
    } catch (error) {
      this.increment(`${name}.error`);
      throw error;
    }
  }

  timeSync<T>(name: string, fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      this.recordMetric({ name, value: Date.now() - start, type: 'timing', timestamp: Date.now() });
      return result;
    } catch (error) {
      this.increment(`${name}.error`);
      throw error;
    }
  }

  private recordMetric(metric: Metric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.name, check);
  }

  async checkHealth(name: string): Promise<HealthCheck> {
    const check = this.healthChecks.get(name);
    return check || { name, status: 'unhealthy' };
  }

  async getAllHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    for (const [name] of this.healthChecks) {
      checks.push(await this.checkHealth(name));
    }
    return checks;
  }

  private startFrameTracking(): void {
    const trackFrame = (time: number) => {
      if (this.lastFrameTime > 0) {
        const delta = time - this.lastFrameTime;
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 60) this.frameTimes.shift();
      }
      this.lastFrameTime = time;
      if (time - this.lastFpsUpdate > 1000) {
        const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.currentFps = Math.round(1000 / avgFrameTime);
        this.lastFpsUpdate = time;
        this.gauge('app.fps', this.currentFps);
      }
      requestAnimationFrame(trackFrame);
    };
    requestAnimationFrame(trackFrame);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const memory = (performance as any).memory;
    return {
      fps: this.currentFps,
      memoryUsage: memory?.usedJSHeapSize,
      activeElements: 0,
      selectedElements: 0,
    };
  }

  getMetrics(options?: { name?: string; type?: MetricType; since?: number; limit?: number }): Metric[] {
    let filtered = [...this.metrics];
    if (options?.name) filtered = filtered.filter(m => m.name === options.name);
    if (options?.type) filtered = filtered.filter(m => m.type === options.type);
    if (options?.since) filtered = filtered.filter(m => m.timestamp >= options.since!);
    if (options?.limit) filtered = filtered.slice(-options.limit);
    return filtered;
  }

  destroy(): void {
    this.metrics = [];
    this.healthChecks.clear();
    this.frameTimes = [];
  }
}

export const monitoring = new MonitoringService();

export const metrics = {
  increment: (name: string, value?: number, tags?: Record<string, string>) => monitoring.increment(name, value, tags),
  gauge: (name: string, value: number, tags?: Record<string, string>) => monitoring.gauge(name, value, tags),
  histogram: (name: string, value: number, tags?: Record<string, string>) => monitoring.histogram(name, value, tags),
  time: <T>(name: string, fn: () => Promise<T>) => monitoring.time(name, fn),
  timeSync: <T>(name: string, fn: () => T) => monitoring.timeSync(name, fn),
};

export const health = {
  register: (check: HealthCheck) => monitoring.registerHealthCheck(check),
  check: (name: string) => monitoring.checkHealth(name),
  all: () => monitoring.getAllHealthChecks(),
};

export const performance = {
  getMetrics: () => monitoring.getPerformanceMetrics(),
};

export default monitoring;
