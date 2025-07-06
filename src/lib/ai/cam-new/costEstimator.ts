// src/lib/ai/cam-new/costEstimator.ts
import { v4 as uuidv4 } from "uuid";
import { Toolpath, Tool, Material, CostEstimation, ToolpathPoint, ToolpathSegmentType } from "../../../types/CAMTypes";
import { aiAnalytics } from "../ai-new/aiAnalytics";

/**
 * Classe per la stima dei costi di lavorazione
 */
export class CostEstimator {
  // Tariffe predefinite
  private defaultRates = {
    machine: 50, // Euro/ora per costi macchina
    labor: 30, // Euro/ora per costi manodopera
    overhead: 20 // Euro/ora per costi generali
  };

  // Tempi di setup predefiniti
  private defaultSetupTimes = {
    simple: 10, // minuti
    moderate: 20, // minuti
    complex: 45 // minuti
  };

  /**
   * Calcola una stima dei costi per un percorso utensile
   */
  async estimateCost(
    toolpath: Toolpath,
    tool: Tool,
    material?: Material,
    rates?: { machine: number; labor: number }
  ): Promise<CostEstimation> {
    // Traccia l'analisi per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_cost",
      eventName: "estimate_cost",
      metadata: {
        toolpathId: toolpath.id,
        toolpathName: toolpath.name,
        toolId: tool.id,
        materialId: material?.id
      }
    });

    const startTime = Date.now();

    try {
      // Usa tariffe predefinite se non specificate
      const costRates = {
        machine: rates?.machine || this.defaultRates.machine,
        labor: rates?.labor || this.defaultRates.labor,
        overhead: this.defaultRates.overhead
      };

      // Calcola il tempo di lavorazione
      const machiningTime = this.calculateMachiningTime(toolpath);

      // Calcola il tempo di setup
      const setupTime = this.estimateSetupTime(toolpath, tool);

      // Calcola il tempo totale
      const totalTime = machiningTime + setupTime;

      // Calcola i costi di macchina
      const machineCost = (machiningTime / 60) * costRates.machine;

      // Calcola i costi di manodopera (incluso setup)
      const laborCost = (totalTime / 60) * costRates.labor;

      // Calcola i costi generali
      const overheadCost = (totalTime / 60) * costRates.overhead;

      // Calcola i costi di utensile
      const toolCost = this.calculateToolCost(toolpath, tool);

      // Calcola i costi di materiale
      const materialCost = this.calculateMaterialCost(toolpath, material);

      // Calcola il costo di setup
      const setupCost = (setupTime / 60) * (costRates.labor + costRates.overhead);

      // Calcola l'utilizzo dell'utensile
      const toolUsage = this.calculateToolUsage(toolpath, tool);

      // Calcola il costo totale
      const totalCost = machineCost + laborCost + toolCost + materialCost + overheadCost;

      // Crea l'oggetto di stima dei costi
      const costEstimation: CostEstimation = {
        id: uuidv4(),
        toolpathId: toolpath.id,
        totalCost,
        breakdown: {
          machineCost,
          toolCost,
          materialCost,
          laborCost,
          setupCost,
          overheadCost
        },
        assumptions: {
          machineRate: costRates.machine,
          laborRate: costRates.labor,
          overheadRate: costRates.overhead,
          toolCostCalculation: "basedOnWear",
          materialCostCalculation: "estimatedVolume",
          currency: "EUR"
        },
        machineCostRate: costRates.machine,
        laborCostRate: costRates.labor,
        setupTime,
        machiningTime,
        totalTime,
        toolsUsed: [
          {
            toolId: tool.id,
            usageTime: machiningTime,
            wearPercentage: toolUsage.wearPercentage,
            cost: toolCost
          }
        ]
      };

      // Traccia il completamento della stima
      aiAnalytics.trackEvent({
        eventType: "cam_cost",
        eventName: "cost_estimation_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          toolpathId: toolpath.id,
          totalCost,
          machiningTime,
          setupTime
        }
      });

      return costEstimation;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "cost_estimation_error",
        success: false,
        metadata: {
          toolpathId: toolpath.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      throw error;
    }
  }

  /**
   * Calcola il tempo di lavorazione in minuti
   */
  private calculateMachiningTime(toolpath: Toolpath): number {
    // Se il tempo è già stimato nel percorso, usalo
    if (toolpath.estimatedTime) {
      return toolpath.estimatedTime / 60; // converti secondi in minuti
    }

    const points = toolpath.points;
    const defaultFeedRate = toolpath.operation.feedRate; // mm/min
    const defaultRapidRate = 5000; // mm/min (velocità rapida predefinita)

    let totalTime = 0; // in minuti

    // Calcola il tempo in base alle distanze e velocità
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Calcola la distanza tra i punti
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      // Determina la velocità da utilizzare
      let feedRate: number;

      if (p2.type === "rapid" || p1.type === "rapid") {
        feedRate = defaultRapidRate; // mm/min
      } else {
        feedRate = p2.feedRate || p1.feedRate || defaultFeedRate; // mm/min
      }

      // Calcola il tempo in minuti
      const segmentTime = distance / feedRate;
      totalTime += segmentTime;
    }

    // Aggiungi tempo aggiuntivo per accelerazioni, decelerazioni e altri fattori
    const realWorldFactor = 1.2; // 20% in più per tenere conto dei limiti della macchina reale
    return totalTime * realWorldFactor;
  }

  /**
   * Stima il tempo di setup in minuti
   */
  private estimateSetupTime(toolpath: Toolpath, tool: Tool): number {
    // Determina la complessità del setup
    let setupComplexity: "simple" | "moderate" | "complex" = "moderate";

    // Considera il tipo di operazione
    const operationType = toolpath.operation.type;
    if (operationType.includes("adaptive") || operationType.includes("waterline") || operationType === "3d_contour") {
      setupComplexity = "complex";
    } else if (operationType === "2d_contour" || operationType === "2d_pocket") {
      setupComplexity = "moderate";
    } else if (operationType === "drilling" || operationType === "facing") {
      setupComplexity = "simple";
    }

    // Considera la dimensione dell'utensile
    if (tool.diameter > 20) {
      // mm
      setupComplexity = setupComplexity === "simple" ? "moderate" : setupComplexity;
    }

    // Ottieni il tempo di setup in base alla complessità
    return this.defaultSetupTimes[setupComplexity];
  }

  /**
   * Calcola il costo dell'utensile basato sul suo utilizzo
   */
  private calculateToolCost(toolpath: Toolpath, tool: Tool): number {
    // Calcola l'utilizzo dell'utensile
    const toolUsage = this.calculateToolUsage(toolpath, tool);

    // Se il prezzo dell'utensile è specificato, usa quello
    if (tool.price) {
      // Calcola il costo basato sull'usura
      return (tool.price * toolUsage.wearPercentage) / 100;
    }

    // Stima del prezzo in base al tipo e diametro dell'utensile
    let estimatedPrice = 0;

    switch (tool.type) {
      case "end_mill":
        estimatedPrice = 30 + tool.diameter * 2; // Esempio: 30€ + 2€ per mm di diametro
        break;
      case "ball_mill":
        estimatedPrice = 35 + tool.diameter * 2.5;
        break;
      case "bull_nose_mill":
        estimatedPrice = 40 + tool.diameter * 2.2;
        break;
      case "face_mill":
        estimatedPrice = 50 + tool.diameter * 3;
        break;
      case "drill":
        estimatedPrice = 15 + tool.diameter * 1.5;
        break;
      default:
        estimatedPrice = 25 + tool.diameter * 2;
    }

    // Considera il materiale dell'utensile
    if (tool.material) {
      const material = tool.material.toLowerCase();
      if (material.includes("carburo") || material.includes("carbide")) {
        estimatedPrice *= 1.5;
      } else if (material.includes("diamante") || material.includes("diamond")) {
        estimatedPrice *= 5;
      }
    }

    // Considera il rivestimento
    if (tool.coating) {
      const coating = tool.coating.toLowerCase();
      if (coating.includes("altin") || coating.includes("tialn")) {
        estimatedPrice *= 1.4;
      } else if (coating.includes("diamond") || coating.includes("diamante")) {
        estimatedPrice *= 2;
      } else if (coating.includes("tin") || coating.includes("ticn")) {
        estimatedPrice *= 1.2;
      }
    }

    // Calcola il costo basato sull'usura
    return (estimatedPrice * toolUsage.wearPercentage) / 100;
  }

  /**
   * Calcola l'utilizzo dell'utensile (tempo e percentuale di usura)
   */
  private calculateToolUsage(toolpath: Toolpath, tool: Tool): { usageTime: number; wearPercentage: number } {
    const points = toolpath.points;
    let cuttingDistance = 0; // mm
    let plungeDistance = 0; // mm

    // Calcola le distanze di taglio e plunge
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Ignora movimenti rapidi
      if (p2.type === "rapid" || p1.type === "rapid") {
        continue;
      }

      // Calcola la distanza XY
      const distanceXY = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

      // Calcola la differenza di Z
      const dz = p2.z - p1.z;

      // Movimento di plunge (Z negativo significativo)
      if (dz < -0.5) {
        plungeDistance += Math.abs(dz);
      }

      // Aggiungi alla distanza di taglio
      cuttingDistance += distanceXY;
    }

    // Stima vita utensile in mm di taglio (basata su tipo e diametro)
    let estimatedToolLife = 0;

    switch (tool.type) {
      case "end_mill":
        estimatedToolLife = 300 * tool.diameter; // Esempio: 300 mm di taglio per mm di diametro
        break;
      case "ball_mill":
        estimatedToolLife = 250 * tool.diameter;
        break;
      case "bull_nose_mill":
        estimatedToolLife = 280 * tool.diameter;
        break;
      case "face_mill":
        estimatedToolLife = 400 * tool.diameter;
        break;
      case "drill":
        estimatedToolLife = 150 * tool.diameter;
        break;
      default:
        estimatedToolLife = 200 * tool.diameter;
    }

    // Considera il materiale dell'utensile
    if (tool.material) {
      const material = tool.material.toLowerCase();
      if (material.includes("carburo") || material.includes("carbide")) {
        estimatedToolLife *= 1.5;
      } else if (material.includes("diamante") || material.includes("diamond")) {
        estimatedToolLife *= 3;
      } else if (material.includes("hss")) {
        estimatedToolLife *= 0.7;
      }
    }

    // Considera il rivestimento
    if (tool.coating) {
      const coating = tool.coating.toLowerCase();
      if (coating.includes("altin") || coating.includes("tialn")) {
        estimatedToolLife *= 1.8;
      } else if (coating.includes("diamond") || coating.includes("diamante")) {
        estimatedToolLife *= 2.5;
      } else if (coating.includes("tin") || coating.includes("ticn")) {
        estimatedToolLife *= 1.5;
      }
    }

    // Se la vita utensile è specificata nell'utensile, usala
    if (tool.lifespan) {
      estimatedToolLife = tool.lifespan * 60; // converti minuti in secondi
    }

    // Calcola la percentuale di usura
    const wearPercentage = Math.min(100, ((cuttingDistance + plungeDistance * 2) / estimatedToolLife) * 100);

    // Calcola il tempo di utilizzo (tempo di lavorazione)
    const usageTime = this.calculateMachiningTime(toolpath);

    return {
      usageTime,
      wearPercentage
    };
  }

  /**
   * Calcola il costo del materiale
   */
  private calculateMaterialCost(toolpath: Toolpath, material?: Material): number {
    if (!material || !material.price) {
      // Se il materiale o il prezzo non sono specificati, usa una stima base
      return 10; // Costo base di 10€ per il materiale
    }

    // Stima il volume del materiale in base al percorso utensile
    const volumeEstimate = this.estimateMaterialVolume(toolpath);

    // Calcola il costo in base al prezzo del materiale e al volume
    return material.price * volumeEstimate;
  }

  /**
   * Stima il volume del materiale utilizzato in cm³
   */
  private estimateMaterialVolume(toolpath: Toolpath): number {
    const points = toolpath.points;

    // Trova le dimensioni complessive del percorso
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    }

    // Calcola le dimensioni in mm
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;

    // Calcola il volume del grezzo in cm³
    const stockVolume = (sizeX * sizeY * sizeZ) / 1000; // converti mm³ in cm³

    // Stima il volume del materiale rimosso in base al tipo di operazione
    let materialRemovalRatio = 0.3; // 30% del volume del grezzo di default

    switch (toolpath.operation.type) {
      case "2d_pocket":
      case "3d_adaptive":
        materialRemovalRatio = 0.6; // 60% del volume del grezzo
        break;
      case "2d_contour":
      case "3d_contour":
        materialRemovalRatio = 0.2; // 20% del volume del grezzo
        break;
      case "drilling":
        materialRemovalRatio = 0.05; // 5% del volume del grezzo
        break;
      case "facing":
        materialRemovalRatio = 0.1; // 10% del volume del grezzo
        break;
    }

    // Calcola il volume rimosso
    const removedVolume = stockVolume * materialRemovalRatio;

    // Aggiungi un margine per gli sprechi
    const wasteMargin = 1.2; // 20% in più per gli sprechi

    return removedVolume * wasteMargin;
  }

  /**
   * Aggiorna la stima dei costi in base a nuovi parametri o dati reali
   */
  async updateCostEstimation(
    originalEstimation: CostEstimation,
    actualMachiningTime?: number,
    actualToolWear?: number,
    updatedRates?: { machine?: number; labor?: number; overhead?: number }
  ): Promise<CostEstimation> {
    // Crea una copia dell'estimazione originale
    const updatedEstimation: CostEstimation = {
      ...originalEstimation,
      id: uuidv4(), // Genera un nuovo ID per l'estimazione aggiornata
      totalCost: originalEstimation.totalCost, // Sarà aggiornato in seguito
      breakdown: { ...originalEstimation.breakdown },
      assumptions: { ...originalEstimation.assumptions }
    };

    // Aggiorna il tempo di lavorazione se specificato
    if (actualMachiningTime !== undefined) {
      const timeDifference = actualMachiningTime - originalEstimation.machiningTime;
      updatedEstimation.machiningTime = actualMachiningTime;
      updatedEstimation.totalTime = originalEstimation.setupTime + actualMachiningTime;

      // Aggiorna i costi correlati al tempo
      const machineRate = updatedRates?.machine || originalEstimation.machineCostRate;
      const laborRate = updatedRates?.labor || originalEstimation.laborCostRate;
      const overheadRate =
        updatedRates?.overhead || (originalEstimation.assumptions.overheadRate as number) || this.defaultRates.overhead;

      // Aggiorna i tassi se specificati
      if (updatedRates?.machine) {
        updatedEstimation.machineCostRate = updatedRates.machine;
      }

      if (updatedRates?.labor) {
        updatedEstimation.laborCostRate = updatedRates.labor;
      }

      // Aggiorna i costi di macchina
      updatedEstimation.breakdown.machineCost = (actualMachiningTime / 60) * machineRate;

      // Aggiorna i costi di manodopera
      updatedEstimation.breakdown.laborCost = (updatedEstimation.totalTime / 60) * laborRate;

      // Aggiorna i costi generali
      updatedEstimation.breakdown.overheadCost = (updatedEstimation.totalTime / 60) * overheadRate;
    }

    // Aggiorna l'usura utensile se specificata
    if (actualToolWear !== undefined && updatedEstimation.toolsUsed.length > 0) {
      const wearDifference = actualToolWear - updatedEstimation.toolsUsed[0].wearPercentage;
      updatedEstimation.toolsUsed[0].wearPercentage = actualToolWear;

      // Aggiorna il costo dell'utensile in proporzione
      const originalToolCost = updatedEstimation.toolsUsed[0].cost;
      updatedEstimation.toolsUsed[0].cost =
        originalToolCost * (actualToolWear / updatedEstimation.toolsUsed[0].wearPercentage);

      // Aggiorna il costo dell'utensile nel breakdown
      updatedEstimation.breakdown.toolCost = updatedEstimation.toolsUsed[0].cost;
    }

    // Aggiorna il costo totale
    updatedEstimation.totalCost =
      updatedEstimation.breakdown.machineCost +
      updatedEstimation.breakdown.laborCost +
      updatedEstimation.breakdown.toolCost +
      updatedEstimation.breakdown.materialCost +
      updatedEstimation.breakdown.overheadCost;

    // Aggiorna le assunzioni con i nuovi dati
    updatedEstimation.assumptions = {
      ...updatedEstimation.assumptions,
      machineRate: updatedEstimation.machineCostRate,
      laborRate: updatedEstimation.laborCostRate,
      overheadRate: updatedRates?.overhead || updatedEstimation.assumptions.overheadRate,
      updatedAt: new Date().toISOString()
    };

    return updatedEstimation;
  }

  /**
   * Confronta diverse strategie di lavorazione per ottimizzare i costi
   */
  async compareStrategies(
    toolpaths: Toolpath[],
    tool: Tool,
    material?: Material,
    rates?: { machine: number; labor: number }
  ): Promise<any> {
    // Esegui la stima dei costi per ogni percorso
    const estimations: CostEstimation[] = [];

    for (const toolpath of toolpaths) {
      const estimation = await this.estimateCost(toolpath, tool, material, rates);
      estimations.push(estimation);
    }

    // Ordina le stime per costo totale
    estimations.sort((a, b) => a.totalCost - b.totalCost);

    // Crea il confronto
    const comparison = {
      id: uuidv4(),
      bestOption: {
        toolpathId: estimations[0].toolpathId,
        totalCost: estimations[0].totalCost,
        machiningTime: estimations[0].machiningTime,
        toolWear: estimations[0].toolsUsed[0].wearPercentage
      },
      allOptions: estimations.map(est => ({
        toolpathId: est.toolpathId,
        toolpathName: toolpaths.find(tp => tp.id === est.toolpathId)?.name || "",
        totalCost: est.totalCost,
        machiningTime: est.machiningTime,
        setupTime: est.setupTime,
        toolWear: est.toolsUsed[0].wearPercentage,
        breakdown: est.breakdown
      })),
      savings: {
        costSavings: estimations[estimations.length - 1].totalCost - estimations[0].totalCost,
        timeSavings: estimations[estimations.length - 1].machiningTime - estimations[0].machiningTime,
        percentageSavings:
          ((estimations[estimations.length - 1].totalCost - estimations[0].totalCost) /
            estimations[estimations.length - 1].totalCost) *
          100
      },
      assumptions: estimations[0].assumptions
    };

    return comparison;
  }
}

// Esporta un'istanza singleton
export const costEstimator = new CostEstimator();
