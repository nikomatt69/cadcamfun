// src/lib/ai/aiCache.ts

/**
 * Interfaccia per gli elementi memorizzati nella cache
 */
interface CacheItem<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    hash: string;
  }
  
  /**
   * Opzioni di configurazione della cache
   */
  interface CacheOptions {
    ttl?: number; // Time to live in millisecondi
    maxSize?: number; // Numero massimo di elementi in cache
    storageKey?: string; // Chiave per localStorage (se persistenza abilitata)
    persistToDisk?: boolean; // Abilita persistenza su localStorage
  }
  
  /**
   * Servizio di caching per le risposte AI
   * Supporta memorizzazione in memoria e persistenza opzionale su localStorage
   */
  export class AICache {
    private cache: Map<string, CacheItem<any>> = new Map();
    private options: Required<CacheOptions>;
    
    constructor(options: CacheOptions = {}) {
      this.options = {
        ttl: options.ttl || 1000 * 60 * 30, // 30 minuti di default
        maxSize: options.maxSize || 100, // 100 elementi di default
        storageKey: options.storageKey || 'ai_cache',
        persistToDisk: options.persistToDisk || false
      };
      
      // Carica la cache dal localStorage se la persistenza è abilitata
      if (this.options.persistToDisk) {
        this.loadFromStorage();
      }
      
      // Configura pulizia periodica della cache
      if (typeof window !== 'undefined') {
        setInterval(() => this.clearExpired(), 1000 * 60 * 5); // Ogni 5 minuti
      }
    }
    
    /**
     * Genera una chiave di cache da un oggetto di richiesta
     */
    getKeyForRequest(requestObj: any): string {
      // Serializza e codifica l'oggetto per una chiave univoca
      const requestStr = JSON.stringify(requestObj);
      
      // Usa btoa per codifica base64 in browser o una versione personalizzata in Node.js
      if (typeof btoa === 'function') {
        return btoa(requestStr);
      } else {
        // Node.js fallback
        return Buffer.from(requestStr).toString('base64');
      }
    }
    
    /**
     * Recupera un elemento dalla cache se esiste e non è scaduto
     */
    get<T>(key: string): T | null {
      const item = this.cache.get(key);
      
      if (!item) return null;
      
      const now = Date.now();
      
      // Verifica se l'elemento è scaduto
      if (now > item.expiresAt) {
        this.cache.delete(key);
        return null;
      }
      
      return item.data;
    }
    
    /**
     * Memorizza un elemento nella cache
     */
    set<T>(key: string, data: T, customTtl?: number): void {
      const now = Date.now();
      const ttl = customTtl || this.options.ttl;
      
      // Assicura che non superi la dimensione massima
      if (this.cache.size >= this.options.maxSize) {
        // Elimina l'elemento più vecchio o scaduto
        this.removeOldestItem();
      }
      
      // Crea il nuovo elemento di cache
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: now,
        expiresAt: now + ttl,
        hash: key
      };
      
      // Memorizza l'elemento
      this.cache.set(key, cacheItem);
      
      // Salva la cache se la persistenza è abilitata
      if (this.options.persistToDisk) {
        this.saveToStorage();
      }
    }
    
    /**
     * Verifica se una chiave esiste e non è scaduta
     */
    has(key: string): boolean {
      const item = this.cache.get(key);
      
      if (!item) return false;
      
      // Verifica se l'elemento è scaduto
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return false;
      }
      
      return true;
    }
    
    /**
     * Cancella tutti gli elementi dalla cache
     */
    clear(): void {
      this.cache.clear();
      
      if (this.options.persistToDisk && typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.options.storageKey);
      }
    }
    
    /**
     * Cancella gli elementi scaduti dalla cache
     */
    clearExpired(): void {
      const now = Date.now();
      let expired = 0;
      
      this.cache.forEach((item, key) => {
        if (now > item.expiresAt) {
          this.cache.delete(key);
          expired++;
        }
      });
      
      // Salva se sono stati eliminati elementi e la persistenza è abilitata
      if (expired > 0 && this.options.persistToDisk) {
        this.saveToStorage();
      }
      
      return;
    }
    
    /**
     * Imposta il time-to-live predefinito
     */
    setTTL(ttl: number): void {
      this.options.ttl = ttl;
    }
    
    /**
     * Imposta la dimensione massima della cache
     */
    setMaxSize(maxSize: number): void {
      this.options.maxSize = maxSize;
      
      // Se la cache è già più grande della nuova dimensione, rimuovi gli elementi più vecchi
      while (this.cache.size > maxSize) {
        this.removeOldestItem();
      }
    }
    
    /**
     * Abilita/disabilita la persistenza su localStorage
     */
    setPersistence(enable: boolean): void {
      this.options.persistToDisk = enable;
      
      if (enable) {
        this.saveToStorage();
      }
    }
    
    /**
     * Ottieni statistiche sulla cache
     */
    getStats(): Record<string, any> {
      const now = Date.now();
      const total = this.cache.size;
      let expired = 0;
      let averageAge = 0;
      
      this.cache.forEach(item => {
        if (now > item.expiresAt) {
          expired++;
        }
        averageAge += (now - item.timestamp);
      });
      
      averageAge = total > 0 ? averageAge / total : 0;
      
      return {
        totalItems: total,
        expiredItems: expired,
        averageAge: averageAge / 1000, // in secondi
        maxSize: this.options.maxSize,
        ttl: this.options.ttl / 1000, // in secondi
        memoryUsage: this.estimateMemoryUsage()
      };
    }
    
    /**
     * Rimuove l'elemento più vecchio dalla cache
     */
    private removeOldestItem(): void {
      let oldestKey: string | null = null;
      let oldestTimestamp = Date.now();
      
      this.cache.forEach((item, key) => {
        if (item.timestamp < oldestTimestamp) {
          oldestTimestamp = item.timestamp;
          oldestKey = key;
        }
      });
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    /**
     * Stima l'utilizzo della memoria della cache
     */
    private estimateMemoryUsage(): number {
      let totalBytes = 0;
      
      this.cache.forEach((item) => {
        // Stima approssimativa della dimensione di ogni elemento
        // Overhead di base per l'oggetto
        let itemSize = 200; 
        
        // Aggiungi la dimensione dei dati
        const dataStr = JSON.stringify(item.data);
        itemSize += dataStr.length * 2; // UTF-16 = 2 byte per carattere
        
        totalBytes += itemSize;
      });
      
      return totalBytes;
    }
    
    /**
     * Salva la cache su localStorage
     */
    private saveToStorage(): void {
      if (typeof localStorage === 'undefined') {
        return;
      }
      
      try {
        // Filtra gli elementi non scaduti
        const now = Date.now();
        const serializable: Record<string, CacheItem<any>> = {};
        
        this.cache.forEach((item, key) => {
          if (now <= item.expiresAt) {
            serializable[key] = item;
          }
        });
        
        localStorage.setItem(this.options.storageKey, JSON.stringify(serializable));
      } catch (error) {
        console.error('Failed to save AI cache to localStorage:', error);
      }
    }
    
    /**
     * Carica la cache da localStorage
     */
    private loadFromStorage(): void {
      if (typeof localStorage === 'undefined') {
        return;
      }
      
      try {
        const cached = localStorage.getItem(this.options.storageKey);
        
        if (cached) {
          const items = JSON.parse(cached) as Record<string, CacheItem<any>>;
          const now = Date.now();
          
          Object.entries(items).forEach(([key, item]) => {
            // Carica solo gli elementi non scaduti
            if (now <= item.expiresAt) {
              this.cache.set(key, item);
            }
          });
        }
      } catch (error) {
        console.error('Failed to load AI cache from localStorage:', error);
      }
    }
  }
  
  // Esporta un'istanza singleton
  export const aiCache = new AICache({
    ttl: 1000 * 60 * 60, // 1 ora
    maxSize: 50,
    persistToDisk: true
  });