// src/types/costs.ts
export interface ToolWearCost {
  id: string;
  toolId: string;
  wearRatePerMeter: number; // Tasso di usura in percentuale per metro di percorso
  replacementCost: number; // Costo di sostituzione dell'utensile in valuta
  replacementThreshold: number; // Soglia di usura (0-100%) quando l'utensile deve essere sostituito
  currencyCode: string; // Added currencyCode
  createdAt: string;
  updatedAt: string;
}

export interface MaterialCost {
  id: string;
  materialId: string;
  costPerUnit: number; // Costo per unità (mm³ o cm³)
  wasteFactor: number; // Fattore di scarto (percentuale)
  minimumCharge: number; // Importo minimo da addebitare
  currencyCode: string; // Codice valuta (EUR, USD, ecc.)
  createdAt: string;
  updatedAt: string;
}

export interface OperationCost {
  id: string;
  name: string;
  machineHourlyRate: number; // Tariffa oraria della macchina
  operatorHourlyRate: number; // Tariffa oraria dell'operatore
  setupTime: number; // Tempo di preparazione in minuti
  currencyCode: string; // Codice valuta
  createdAt: string;
  updatedAt: string;
}

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
    materialVolume?: number; // Changed to optional
    toolPathLength?: number; // Changed to optional
    toolWearPercentage?: number; // Changed to optional
    feedRate?: number; // Added optional based on service type
    toolId?: string; // Added optional based on service type
    materialId?: string; // Added optional based on service type
    operationCostId?: string; // Added optional based on service type
    [key: string]: any;
  };
  operationCostId?: string; // Added optional based on service type
  ownerId: string; // Added ownerId as it's in the service type and store expects it for creation
  organizationId?: string; // Added optional organizationId
  createdAt: string;
  updatedAt: string;
}

export interface CostSettings {
  defaultCurrencyCode: string;
  defaultMachineHourlyRate: number;
  defaultOperatorHourlyRate: number;
  defaultSetupTime: number;
  calculateAutomatically: boolean;
  [key: string]: any;
}
