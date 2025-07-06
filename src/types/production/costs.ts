// src/types/production/costs.ts

/**
 * Interfaccia per i costi di usura utensili
 */
export interface ToolWearCost {
  id: string;
  toolId: string;
  wearRatePerMeter: number; // Tasso di usura in percentuale per metro di percorso
  replacementCost: number; // Costo di sostituzione dell'utensile in valuta
  replacementThreshold: number; // Soglia di usura (0-100%) quando l'utensile deve essere sostituito
  currencyCode: string; // Codice valuta (EUR, USD, ecc.)
  createdAt: string;
  updatedAt: string;
  ownerId?: string | null;
  organizationId?: string | null;
}

/**
 * Interfaccia per i costi dei materiali
 */
export interface MaterialCost {
  id: string;
  materialId: string;
  costPerUnit: number; // Costo per unità (mm³ o cm³)
  wasteFactor: number; // Fattore di scarto (percentuale)
  minimumCharge: number; // Importo minimo da addebitare
  currencyCode: string; // Codice valuta (EUR, USD, ecc.)
  createdAt: string;
  updatedAt: string;
  ownerId?: string | null;
  organizationId?: string | null;
}

/**
 * Interfaccia per i costi delle operazioni di lavorazione
 */
export interface OperationCost {
  id: string;
  name: string;
  machineHourlyRate: number; // Tariffa oraria della macchina
  operatorHourlyRate: number; // Tariffa oraria dell'operatore
  setupTime: number; // Tempo di preparazione in minuti
  currencyCode: string; // Codice valuta
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  organizationId?: string | null;
}

/**
 * Interfaccia per le stime dei costi di produzione
 */
export interface ProductionCostEstimate {
  id: string;
  toolpathId: string;
  materialCost: number;
  toolWearCost: number;
  machineTime: number; // Tempo macchina in minuti
  machineTimeCost: number;
  operatorTime: number; // Tempo operatore in minuti
  operatorTimeCost: number;
  setupCost: number;
  totalCost: number;
  currencyCode: string;
  details: {
    materialVolume?: number;
    toolPathLength?: number;
    toolWearPercentage?: number;
    feedRate?: number;
    toolId?: string;
    materialId?: string;
    operationCostId?: string;
    [key: string]: any;
  };
  operationCostId?: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  organizationId?: string | null;
}

/**
 * Interfaccia per le impostazioni dei costi
 */
export interface CostSettings {
  id: string;
  defaultCurrencyCode: string;
  defaultMachineHourlyRate: number;
  defaultOperatorHourlyRate: number;
  defaultSetupTime: number;
  calculateAutomatically: boolean;
  additionalSettings?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  organizationId?: string | null;
}

/**
 * Tipo per una valuta supportata
 */
export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

/**
 * Lista delle valute supportate
 */
export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "Dollaro USA" },
  { code: "GBP", symbol: "£", name: "Sterlina britannica" },
  { code: "CHF", symbol: "Fr", name: "Franco svizzero" },
  { code: "CAD", symbol: "$", name: "Dollaro canadese" },
  { code: "JPY", symbol: "¥", name: "Yen giapponese" }
];

/**
 * Impostazioni di costo predefinite
 */
export const DEFAULT_COST_SETTINGS: Omit<
  CostSettings,
  "id" | "createdAt" | "updatedAt" | "ownerId" | "organizationId"
> = {
  defaultCurrencyCode: "EUR",
  defaultMachineHourlyRate: 50,
  defaultOperatorHourlyRate: 30,
  defaultSetupTime: 30,
  calculateAutomatically: true,
  additionalSettings: {}
};
