// Global Analytics Coordinator
// Prevents multiple overlapping analytics requests

class AnalyticsCoordinator {
  private static instance: AnalyticsCoordinator;
  private activePollers: Set<string> = new Set();
  private globalInterval: NodeJS.Timeout | null = null;
  private callbacks: Map<string, () => void> = new Map();
  private isPolling: boolean = false;

  private constructor() {}

  static getInstance(): AnalyticsCoordinator {
    if (!AnalyticsCoordinator.instance) {
      AnalyticsCoordinator.instance = new AnalyticsCoordinator();
    }
    return AnalyticsCoordinator.instance;
  }

  registerPoller(id: string, callback: () => void): void {
    this.activePollers.add(id);
    this.callbacks.set(id, callback);
    this.startGlobalPolling();
  }

  unregisterPoller(id: string): void {
    this.activePollers.delete(id);
    this.callbacks.delete(id);
    
    if (this.activePollers.size === 0) {
      this.stopGlobalPolling();
    }
  }

  private startGlobalPolling(): void {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.globalInterval = setInterval(() => {
      // Execute all registered callbacks
      this.callbacks.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('Analytics polling error:', error);
        }
      });
    }, 5 * 60 * 1000); // 5 minutes
  }

  private stopGlobalPolling(): void {
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }
    this.isPolling = false;
  }

  // Force immediate refresh of all analytics
  forceRefresh(): void {
    this.callbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('Analytics force refresh error:', error);
      }
    });
  }
}

export const analyticsCoordinator = AnalyticsCoordinator.getInstance();