/**
 * Production Costs API Service
 *
 * Questo servizio fornisce interfacce per interagire con le API del sistema di gestione dei costi di produzione.
 * Include metodi per gestire i costi di utensili, materiali, operazioni e stime dei costi.
 */

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// Tipi per le interfacce dei costi
export interface ToolWearCost {
  id: string;
  toolId: string;
  wearRatePerMeter: number;
  replacementCost: number;
  replacementThreshold: number;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  organizationId?: string;
}

export interface MaterialCost {
  id: string;
  materialId: string;
  costPerUnit: number;
  wasteFactor: number;
  minimumCharge: number;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  organizationId?: string;
}

export interface OperationCost {
  id: string;
  name: string;
  machineHourlyRate: number;
  operatorHourlyRate: number;
  setupTime: number;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  organizationId?: string;
}

export interface ProductionCostEstimate {
  id: string;
  toolpathId: string;
  materialCost: number;
  toolWearCost: number;
  machineTime: number;
  machineTimeCost: number;
  operatorTime: number;
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
  operationCostId?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  organizationId?: string;
}

export interface CostSettings {
  id: string;
  defaultCurrencyCode: string;
  defaultMachineHourlyRate: number;
  defaultOperatorHourlyRate: number;
  defaultSetupTime: number;
  calculateAutomatically: boolean;
  additionalSettings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  organizationId?: string;
}

// Classe base per le operazioni API
class BaseApiService {
  protected apiBaseUrl: string;

  constructor(endpointPath: string) {
    this.apiBaseUrl = `/api/production-costs/${endpointPath}`;
  }

  protected async get<T>(path: string = ""): Promise<T> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}${path}`);
      return response.data;
    } catch (error: any) {
      this.handleApiError(error, "fetch");
      throw error;
    }
  }

  protected async post<T, R>(data: T, path: string = ""): Promise<R> {
    try {
      const response = await axios.post(`${this.apiBaseUrl}${path}`, data);
      return response.data;
    } catch (error: any) {
      this.handleApiError(error, "create");
      throw error;
    }
  }

  protected async put<T, R>(id: string, data: T): Promise<R> {
    try {
      const response = await axios.put(`${this.apiBaseUrl}/${id}`, data);
      return response.data;
    } catch (error: any) {
      this.handleApiError(error, "update");
      throw error;
    }
  }

  protected async delete(id: string): Promise<void> {
    try {
      await axios.delete(`${this.apiBaseUrl}/${id}`);
    } catch (error: any) {
      this.handleApiError(error, "delete");
      throw error;
    }
  }

  protected handleApiError(error: any, operation: string): void {
    const errorMessage = error.response?.data?.error || error.message || "Unknown error";
    console.error(`API ${operation} operation failed: ${errorMessage}`, error);
  }
}

// Servizio per i costi di usura degli utensili
export class ToolWearCostService extends BaseApiService {
  constructor() {
    super("tool-wear");
  }

  async getAll(): Promise<ToolWearCost[]> {
    return this.get<ToolWearCost[]>();
  }

  async getById(id: string): Promise<ToolWearCost> {
    return this.get<ToolWearCost>(`/${id}`);
  }

  async getByToolId(toolId: string): Promise<ToolWearCost | null> {
    try {
      const result = await this.get<ToolWearCost[]>(`?toolId=${toolId}`);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get tool wear cost by tool ID:", error);
      return null;
    }
  }

  async create(data: Omit<ToolWearCost, "id" | "createdAt" | "updatedAt">): Promise<ToolWearCost> {
    return this.post<typeof data, ToolWearCost>(data);
  }

  async update(id: string, data: Partial<Omit<ToolWearCost, "id" | "createdAt" | "updatedAt">>): Promise<ToolWearCost> {
    return this.put<typeof data, ToolWearCost>(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.delete(id);
  }
}

// Servizio per i costi dei materiali
export class MaterialCostService extends BaseApiService {
  constructor() {
    super("material-costs");
  }

  async getAll(): Promise<MaterialCost[]> {
    return this.get<MaterialCost[]>();
  }

  async getById(id: string): Promise<MaterialCost> {
    return this.get<MaterialCost>(`/${id}`);
  }

  async getByMaterialId(materialId: string): Promise<MaterialCost | null> {
    try {
      const result = await this.get<MaterialCost[]>(`?materialId=${materialId}`);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get material cost by material ID:", error);
      return null;
    }
  }

  async create(data: Omit<MaterialCost, "id" | "createdAt" | "updatedAt">): Promise<MaterialCost> {
    return this.post<typeof data, MaterialCost>(data);
  }

  async update(id: string, data: Partial<Omit<MaterialCost, "id" | "createdAt" | "updatedAt">>): Promise<MaterialCost> {
    return this.put<typeof data, MaterialCost>(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.delete(id);
  }
}

// Servizio per i costi delle operazioni
export class OperationCostService extends BaseApiService {
  constructor() {
    super("operation-costs");
  }

  async getAll(): Promise<OperationCost[]> {
    return this.get<OperationCost[]>();
  }

  async getById(id: string): Promise<OperationCost> {
    return this.get<OperationCost>(`/${id}`);
  }

  async create(data: Omit<OperationCost, "id" | "createdAt" | "updatedAt">): Promise<OperationCost> {
    return this.post<typeof data, OperationCost>(data);
  }

  async update(
    id: string,
    data: Partial<Omit<OperationCost, "id" | "createdAt" | "updatedAt">>
  ): Promise<OperationCost> {
    return this.put<typeof data, OperationCost>(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.delete(id);
  }
}

// Servizio per le stime dei costi di produzione
export class ProductionCostEstimateService extends BaseApiService {
  constructor() {
    super("estimates");
  }

  async getAll(): Promise<ProductionCostEstimate[]> {
    return this.get<ProductionCostEstimate[]>();
  }

  async getById(id: string): Promise<ProductionCostEstimate> {
    return this.get<ProductionCostEstimate>(`/${id}`);
  }

  async getByToolpathId(toolpathId: string): Promise<ProductionCostEstimate[]> {
    return this.get<ProductionCostEstimate[]>(`?toolpathId=${toolpathId}`);
  }

  async create(data: Omit<ProductionCostEstimate, "id" | "createdAt" | "updatedAt">): Promise<ProductionCostEstimate> {
    return this.post<typeof data, ProductionCostEstimate>(data);
  }

  async update(
    id: string,
    data: Partial<Omit<ProductionCostEstimate, "id" | "createdAt" | "updatedAt">>
  ): Promise<ProductionCostEstimate> {
    return this.put<typeof data, ProductionCostEstimate>(id, data);
  }

  async delete(id: string): Promise<void> {
    return this.delete(id);
  }

  async calculate(toolpathId: string, options?: any): Promise<ProductionCostEstimate> {
    return this.post<{ toolpathId: string; options?: any }, ProductionCostEstimate>(
      { toolpathId, options },
      "/calculate"
    );
  }
}

// Servizio per le impostazioni dei costi
export class CostSettingsService extends BaseApiService {
  constructor() {
    super("settings");
  }

  async getUserSettings(): Promise<CostSettings> {
    return this.get<CostSettings>("/user");
  }

  async getOrganizationSettings(organizationId: string): Promise<CostSettings> {
    return this.get<CostSettings>(`/organization/${organizationId}`);
  }

  async updateUserSettings(
    data: Partial<Omit<CostSettings, "id" | "ownerId" | "organizationId" | "createdAt" | "updatedAt">>
  ): Promise<CostSettings> {
    return this.put<typeof data, CostSettings>("user", data);
  }

  async updateOrganizationSettings(
    organizationId: string,
    data: Partial<Omit<CostSettings, "id" | "ownerId" | "organizationId" | "createdAt" | "updatedAt">>
  ): Promise<CostSettings> {
    return this.put<typeof data, CostSettings>(`organization/${organizationId}`, data);
  }
}

// Implementazione delle funzioni helper per i calcoli dei costi
export function calculatePathLength(points: { x: number; y: number; z: number }[]): number {
  let totalLength = 0;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    totalLength += distance;
  }

  return totalLength;
}

export function calculateMaterialVolume(
  dimensions: { width: number; height: number; depth: number },
  wasteFactor: number = 0
): number {
  const baseVolume = dimensions.width * dimensions.height * dimensions.depth;
  return baseVolume * (1 + wasteFactor / 100);
}

export function calculateToolWearCost(
  pathLength: number,
  wearRatePerMeter: number
): { cost: number; wearPercentage: number } {
  // Converti mm in metri per il calcolo dell'usura
  const pathLengthInMeters = pathLength / 1000;

  // Calcola la percentuale di usura
  const wearPercentage = wearRatePerMeter * pathLengthInMeters;

  // Calcola il costo dell'usura
  const cost = (wearPercentage / 100) * wearRatePerMeter;

  return { cost, wearPercentage };
}

export function formatCurrency(value: number, currencyCode: string = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currencyCode
  }).format(value);
}

export function formatPercentage(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  return `${mins}m`;
}

export function formatVolume(value: number): string {
  // Per volumi grandi, converti in cm³
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} cm³`;
  }

  return `${value.toFixed(2)} mm³`;
}

export function formatDimension(value: number): string {
  return `${value.toFixed(2)} mm`;
}

// Funzione per generare un report testuale dei costi
export function generateCostReport(estimate: ProductionCostEstimate, includeDetails: boolean = false): string {
  let report = `--- Cost Report ---
Toolpath ID: ${estimate.toolpathId}
Total Cost: ${formatCurrency(estimate.totalCost, estimate.currencyCode)}
Date: ${new Date(estimate.updatedAt).toLocaleString("it-IT")}

Breakdown:
- Material Cost: ${formatCurrency(estimate.materialCost, estimate.currencyCode)}
- Tool Wear Cost: ${formatCurrency(estimate.toolWearCost, estimate.currencyCode)}
- Machine Time: ${formatTime(estimate.machineTime)}
- Machine Time Cost: ${formatCurrency(estimate.machineTimeCost, estimate.currencyCode)}
- Operator Time Cost: ${formatCurrency(estimate.operatorTimeCost, estimate.currencyCode)}
- Setup Cost: ${formatCurrency(estimate.setupCost, estimate.currencyCode)}
`;

  if (includeDetails && estimate.details) {
    report += "\nDetails:\n";
    if (estimate.details.materialId) report += `- Material ID: ${estimate.details.materialId}\n`; // Consider fetching name
    if (estimate.details.toolId) report += `- Tool ID: ${estimate.details.toolId}\n`; // Consider fetching name
    if (estimate.details.materialVolume)
      report += `- Material Volume: ${formatVolume(estimate.details.materialVolume)}\n`;
    if (estimate.details.toolPathLength)
      report += `- Toolpath Length: ${formatDimension(estimate.details.toolPathLength)}\n`;
    if (estimate.details.toolWearPercentage)
      report += `- Tool Wear: ${formatPercentage(estimate.details.toolWearPercentage)}\n`;
    if (estimate.details.feedRate) report += `- Feed Rate: ${estimate.details.feedRate} mm/min\n`;
  }

  report += "--- End of Report ---";
  return report;
}

// Esporta un'istanza di ogni servizio
export const toolWearCostService = new ToolWearCostService();
export const materialCostService = new MaterialCostService();
export const operationCostService = new OperationCostService();
export const productionCostEstimateService = new ProductionCostEstimateService();
export const costSettingsService = new CostSettingsService();

// Esporta tutti i servizi come oggetto unico
export const ProductionCostsAPI = {
  ToolWearCost: toolWearCostService,
  MaterialCost: materialCostService,
  OperationCost: operationCostService,
  Estimate: productionCostEstimateService,
  Settings: costSettingsService,
  Utils: {
    calculatePathLength,
    calculateMaterialVolume,
    calculateToolWearCost,
    formatCurrency,
    formatPercentage,
    formatTime,
    formatVolume,
    formatDimension,
    generateCostReport
  }
};

export default ProductionCostsAPI;
