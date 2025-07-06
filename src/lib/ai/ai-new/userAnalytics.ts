import { AIModelType } from "src/types/AITypes";
import { MODEL_COSTS } from "./aiConfigManager";

export interface UserTokenUsage {
  userId: string;
  date: string; // YYYY-MM-DD format
  model: AIModelType;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  sessionId?: string;
  requestType?: string;
}

export interface UserAnalyticsSummary {
  userId: string;
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  averageTokensPerRequest: number;
  modelUsage: Record<AIModelType, {
    tokens: number;
    cost: number;
    requests: number;
  }>;
  dailyUsage: Array<{
    date: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
  mostUsedModel: AIModelType;
  costEfficiencyScore: number; // 0-100, basato su successo richieste vs costo
}

export interface UserCostBreakdown {
  userId: string;
  username?: string;
  email?: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: UserAnalyticsSummary;
  trends: {
    tokensGrowth: number; // % change vs previous period
    costGrowth: number; // % change vs previous period
    requestsGrowth: number; // % change vs previous period
  };
  topExpensiveRequests: Array<{
    timestamp: Date;
    model: AIModelType;
    tokens: number;
    cost: number;
    requestType: string;
  }>;
}

/**
 * Servizio per tracciare e analizzare l'uso di AI per singolo utente
 */
export class UserAnalyticsService {
  private static instance: UserAnalyticsService;
  private userUsage: Map<string, UserTokenUsage[]> = new Map();
  private readonly STORAGE_KEY = "user_ai_analytics";
  private readonly MAX_ENTRIES_PER_USER = 1000;

  private constructor() {
    this.loadPersistedData();
    
    // Cleanup periodico ogni ora
    if (typeof window !== "undefined") {
      setInterval(() => this.cleanupOldEntries(), 1000 * 60 * 60);
    }
  }

  static getInstance(): UserAnalyticsService {
    if (!UserAnalyticsService.instance) {
      UserAnalyticsService.instance = new UserAnalyticsService();
    }
    return UserAnalyticsService.instance;
  }

  /**
   * Traccia l'utilizzo di token per un utente
   */
  trackUserUsage(
    userId: string,
    model: AIModelType,
    promptTokens: number,
    completionTokens: number,
    requestType?: string,
    sessionId?: string
  ): void {
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = this.calculateCost(model, promptTokens, completionTokens);
    const today = new Date().toISOString().split('T')[0];

    const usage: UserTokenUsage = {
      userId,
      date: today,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      requestCount: 1,
      sessionId,
      requestType
    };

    // Ottieni o crea array per l'utente
    const userEntries = this.userUsage.get(userId) || [];
    
    // Cerca se esiste già un'entry per oggi con lo stesso modello
    const existingEntry = userEntries.find(
      entry => entry.date === today && entry.model === model
    );

    if (existingEntry) {
      // Aggiorna entry esistente
      existingEntry.promptTokens += promptTokens;
      existingEntry.completionTokens += completionTokens;
      existingEntry.totalTokens += totalTokens;
      existingEntry.estimatedCost += estimatedCost;
      existingEntry.requestCount += 1;
    } else {
      // Aggiungi nuova entry
      userEntries.push(usage);
    }

    // Limita il numero di entries per utente
    if (userEntries.length > this.MAX_ENTRIES_PER_USER) {
      userEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      userEntries.splice(this.MAX_ENTRIES_PER_USER);
    }

    this.userUsage.set(userId, userEntries);
    this.persistData();
  }

  /**
   * Ottiene il riassunto analytics per un utente
   */
  getUserSummary(
    userId: string, 
    startDate?: Date, 
    endDate?: Date
  ): UserAnalyticsSummary | null {
    const userEntries = this.userUsage.get(userId);
    if (!userEntries) return null;

    // Filtra per date se specificate
    let filteredEntries = userEntries;
    if (startDate || endDate) {
      filteredEntries = userEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }

    if (filteredEntries.length === 0) return null;

    // Calcola totali
    const totalTokens = filteredEntries.reduce((sum, entry) => sum + entry.totalTokens, 0);
    const totalCost = filteredEntries.reduce((sum, entry) => sum + entry.estimatedCost, 0);
    const totalRequests = filteredEntries.reduce((sum, entry) => sum + entry.requestCount, 0);

    // Calcola usage per modello
    const modelUsage: Record<string, any> = {};
    filteredEntries.forEach(entry => {
      if (!modelUsage[entry.model]) {
        modelUsage[entry.model] = { tokens: 0, cost: 0, requests: 0 };
      }
      modelUsage[entry.model].tokens += entry.totalTokens;
      modelUsage[entry.model].cost += entry.estimatedCost;
      modelUsage[entry.model].requests += entry.requestCount;
    });

    // Trova il modello più usato
    const mostUsedModel = Object.entries(modelUsage)
      .sort(([,a], [,b]) => (b as any).tokens - (a as any).tokens)[0]?.[0] as AIModelType;

    // Calcola usage giornaliero
    const dailyUsageMap = new Map<string, { tokens: number; cost: number; requests: number }>();
    filteredEntries.forEach(entry => {
      const existing = dailyUsageMap.get(entry.date) || { tokens: 0, cost: 0, requests: 0 };
      existing.tokens += entry.totalTokens;
      existing.cost += entry.estimatedCost;
      existing.requests += entry.requestCount;
      dailyUsageMap.set(entry.date, existing);
    });

    const dailyUsage = Array.from(dailyUsageMap.entries())
      .map(([date, usage]) => ({ date, ...usage }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calcola score di efficienza dei costi (richieste riuscite vs costo)
    const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
    const costEfficiencyScore = Math.max(0, Math.min(100, 100 - (avgCostPerRequest * 1000))); // Score empirico

    return {
      userId,
      totalTokens,
      totalCost,
      totalRequests,
      averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
      modelUsage: modelUsage as any,
      dailyUsage,
      mostUsedModel,
      costEfficiencyScore
    };
  }

  /**
   * Ottiene breakdown dettagliato dei costi per un utente
   */
  getUserCostBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date,
    userInfo?: { username?: string; email?: string }
  ): UserCostBreakdown | null {
    const summary = this.getUserSummary(userId, startDate, endDate);
    if (!summary) return null;

    // Calcola trend (confronto con periodo precedente)
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousSummary = this.getUserSummary(userId, previousStartDate, startDate);

    const trends = {
      tokensGrowth: this.calculateGrowth(summary.totalTokens, previousSummary?.totalTokens || 0),
      costGrowth: this.calculateGrowth(summary.totalCost, previousSummary?.totalCost || 0),
      requestsGrowth: this.calculateGrowth(summary.totalRequests, previousSummary?.totalRequests || 0)
    };

    // Trova le richieste più costose
    const userEntries = this.userUsage.get(userId) || [];
    const topExpensiveRequests = userEntries
      .filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= startDate && entryDate <= endDate;
      })
      .sort((a, b) => b.estimatedCost - a.estimatedCost)
      .slice(0, 10)
      .map(entry => ({
        timestamp: new Date(entry.date),
        model: entry.model,
        tokens: entry.totalTokens,
        cost: entry.estimatedCost,
        requestType: entry.requestType || 'unknown'
      }));

    return {
      userId,
      username: userInfo?.username,
      email: userInfo?.email,
      period: { startDate, endDate },
      summary,
      trends,
      topExpensiveRequests
    };
  }

  /**
   * Ottiene tutti gli utenti con il loro utilizzo
   */
  getAllUsersUsage(startDate?: Date, endDate?: Date): Array<{
    userId: string;
    summary: UserAnalyticsSummary;
  }> {
    const results: Array<{ userId: string; summary: UserAnalyticsSummary }> = [];

    this.userUsage.forEach((entries, userId) => {
      const summary = this.getUserSummary(userId, startDate, endDate);
      if (summary) {
        results.push({ userId, summary });
      }
    });

    // Ordina per costo totale decrescente
    results.sort((a, b) => b.summary.totalCost - a.summary.totalCost);

    return results;
  }

  /**
   * Ottiene statistiche aggregate del sistema
   */
  getSystemStats(startDate?: Date, endDate?: Date): {
    totalUsers: number;
    totalTokens: number;
    totalCost: number;
    totalRequests: number;
    averageCostPerUser: number;
    topSpendingUsers: Array<{ userId: string; cost: number }>;
    modelDistribution: Record<AIModelType, number>;
  } {
    const allUsersUsage = this.getAllUsersUsage(startDate, endDate);
    
    const totalUsers = allUsersUsage.length;
    const totalTokens = allUsersUsage.reduce((sum, user) => sum + user.summary.totalTokens, 0);
    const totalCost = allUsersUsage.reduce((sum, user) => sum + user.summary.totalCost, 0);
    const totalRequests = allUsersUsage.reduce((sum, user) => sum + user.summary.totalRequests, 0);
    
    const topSpendingUsers = allUsersUsage
      .slice(0, 10)
      .map(user => ({ userId: user.userId, cost: user.summary.totalCost }));

    // Calcola distribuzione modelli
    const modelDistribution: Record<string, number> = {};
    allUsersUsage.forEach(user => {
      Object.entries(user.summary.modelUsage).forEach(([model, usage]) => {
        modelDistribution[model] = (modelDistribution[model] || 0) + (usage as any).tokens;
      });
    });

    return {
      totalUsers,
      totalTokens,
      totalCost,
      totalRequests,
      averageCostPerUser: totalUsers > 0 ? totalCost / totalUsers : 0,
      topSpendingUsers,
      modelDistribution: modelDistribution as any
    };
  }

  /**
   * Calcola il costo basato sui token e modello utilizzati
   */
  private calculateCost(model: AIModelType, promptTokens: number, completionTokens: number): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS["claude-3-7-sonnet-20250219"];
    
    // MODEL_COSTS ora contiene prezzi per 1M token
    const inputCost = (promptTokens / 1000000) * costs.input;
    const outputCost = (completionTokens / 1000000) * costs.output;
    
    return inputCost + outputCost;
  }

  /**
   * Calcola la crescita percentuale
   */
  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Pulizia delle entries vecchie
   */
  private cleanupOldEntries(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // Mantieni 90 giorni
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    this.userUsage.forEach((entries, userId) => {
      const filtered = entries.filter(entry => entry.date >= cutoffDateStr);
      if (filtered.length !== entries.length) {
        this.userUsage.set(userId, filtered);
      }
    });

    this.persistData();
  }

  /**
   * Persiste i dati su localStorage
   */
  private persistData(): void {
    if (typeof window === "undefined") return;

    try {
      const data = Array.from(this.userUsage.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Failed to persist user analytics data:", error);
    }
  }

  /**
   * Carica i dati da localStorage
   */
  private loadPersistedData(): void {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        this.userUsage = new Map(data);
      }
    } catch (error) {
      console.warn("Failed to load persisted user analytics data:", error);
    }
  }

  /**
   * Cancella tutti i dati (per testing)
   */
  clearAllData(): void {
    this.userUsage.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Esporta dati per un utente specifico
   */
  exportUserData(userId: string): UserTokenUsage[] {
    return this.userUsage.get(userId) || [];
  }
}

// Export singleton instance
export const userAnalyticsService = UserAnalyticsService.getInstance(); 