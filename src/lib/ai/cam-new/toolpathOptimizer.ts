// src/lib/ai/cam-new/toolpathOptimizer.ts
import { v4 as uuidv4 } from "uuid";
import { Toolpath, Tool, Material, ToolpathPoint, ToolpathSegmentType } from "../../../types/CAMTypes";
import { aiAnalytics } from "../ai-new/aiAnalytics";
import { camAnalyzer } from "./camAnalyzer";

/**
 * Classe responsabile dell'ottimizzazione dei percorsi utensile
 */
export class ToolpathOptimizer {
  /**
   * Ottimizza un percorso utensile in base a obiettivi specifici
   */
  async optimizeToolpath(
    toolpath: Toolpath,
    goals: ("time" | "quality" | "tool_life" | "cost")[],
    tool?: Tool,
    material?: Material
  ): Promise<Toolpath> {
    // Traccia l'ottimizzazione per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_optimizer",
      eventName: "optimize_toolpath",
      metadata: {
        toolpathId: toolpath.id,
        toolpathName: toolpath.name,
        pointCount: toolpath.points.length,
        goals: goals.join(",")
      }
    });

    // Inizia l'ottimizzazione del percorso utensile
    const startTime = Date.now();

    try {
      // Prima analizza il percorso per identificare i problemi
      const analysis = await camAnalyzer.analyzeToolpath(toolpath, tool, material);

      // Crea una copia del percorso originale per l'ottimizzazione
      const optimizedToolpath: Toolpath = {
        ...toolpath,
        id: uuidv4(),
        name: `${toolpath.name} (Ottimizzato)`,
        points: [...toolpath.points],
        metadata: {
          ...toolpath.metadata,
          originalToolpathId: toolpath.id,
          optimizationGoals: goals,
          optimizedAt: new Date().toISOString()
        }
      };

      // Prioritizza le ottimizzazioni in base agli obiettivi
      const prioritizedOptimizations: ((
        toolpath: Toolpath,
        analysis: any,
        tool?: Tool,
        material?: Material
      ) => Promise<Toolpath>)[] = [];

      for (const goal of goals) {
        switch (goal) {
          case "time":
            prioritizedOptimizations.push(this.optimizeForTime.bind(this));
            break;
          case "quality":
            prioritizedOptimizations.push(this.optimizeForQuality.bind(this));
            break;
          case "tool_life":
            prioritizedOptimizations.push(this.optimizeForToolLife.bind(this));
            break;
          case "cost":
            prioritizedOptimizations.push(this.optimizeForCost.bind(this));
            break;
        }
      }

      // Applica le ottimizzazioni in ordine
      let result = optimizedToolpath;
      for (const optimize of prioritizedOptimizations) {
        result = await optimize(result, analysis, tool, material);
      }

      // Aggiungi statistiche di miglioramento ai metadati
      const beforePoints = toolpath.points.length;
      const afterPoints = result.points.length;
      const pointsReduction = beforePoints - afterPoints;
      const pointsReductionPercent = (pointsReduction / beforePoints) * 100;

      result.metadata = {
        ...result.metadata,
        optimization: {
          pointsReduction,
          pointsReductionPercent: pointsReductionPercent.toFixed(2),
          issues: {
            before: analysis.issues.length,
            after: 0 // Dovremmo rianalizzare per avere questo valore preciso
          }
        }
      };

      // Traccia il completamento dell'ottimizzazione
      aiAnalytics.trackEvent({
        eventType: "cam_optimizer",
        eventName: "toolpath_optimization_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          toolpathId: result.id,
          originalId: toolpath.id,
          pointsBefore: beforePoints,
          pointsAfter: afterPoints,
          reductionPercent: pointsReductionPercent.toFixed(2)
        }
      });

      return result;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "toolpath_optimization_error",
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
   * Ottimizza per velocità di esecuzione
   */
  private async optimizeForTime(
    toolpath: Toolpath,
    analysis: any,
    tool?: Tool,
    material?: Material
  ): Promise<Toolpath> {
    // Crea una copia del percorso
    const optimized = {
      ...toolpath,
      points: [...toolpath.points]
    };

    // 1. Ottimizza la velocità di avanzamento dove possibile
    optimized.points = this.optimizeFeedRates(optimized.points, tool, material);

    // 2. Converti tagli aerei in rapidi
    optimized.points = this.convertAirCutsToRapid(optimized.points);

    // 3. Rimuovi movimenti ridondanti
    optimized.points = this.removeRedundantMoves(optimized.points);

    // 4. Ottimizza altezze di ritiro
    optimized.points = this.optimizeRetractHeights(optimized.points);

    // 5. Ottimizza movimenti rapidi
    optimized.points = this.optimizeRapidMoves(optimized.points);

    return optimized;
  }

  /**
   * Ottimizza per qualità di lavorazione
   */
  private async optimizeForQuality(
    toolpath: Toolpath,
    analysis: any,
    tool?: Tool,
    material?: Material
  ): Promise<Toolpath> {
    // Crea una copia del percorso
    const optimized = {
      ...toolpath,
      points: [...toolpath.points]
    };

    // 1. Riduci la velocità di avanzamento per le operazioni di finitura
    optimized.points = this.optimizeFeedRatesForQuality(optimized.points, tool, material);

    // 2. Aggiungi punti per smoothing nelle curve
    optimized.points = this.addSmoothingPoints(optimized.points);

    // 3. Ottimizza profondità di taglio
    optimized.points = this.optimizeCuttingDepth(optimized.points, tool, material);

    // 4. Migliora entrate e uscite
    optimized.points = this.improveEntryExit(optimized.points);

    return optimized;
  }

  /**
   * Ottimizza per durata utensile
   */
  private async optimizeForToolLife(
    toolpath: Toolpath,
    analysis: any,
    tool?: Tool,
    material?: Material
  ): Promise<Toolpath> {
    // Crea una copia del percorso
    const optimized = {
      ...toolpath,
      points: [...toolpath.points]
    };

    // 1. Riduci la velocità di avanzamento nelle aree critiche
    optimized.points = this.reduceFeedRatesInCriticalAreas(optimized.points, tool, material);

    // 2. Ottimizza profondità di taglio per ridurre lo stress sull'utensile
    optimized.points = this.optimizeCuttingDepthForToolLife(optimized.points, tool, material);

    // 3. Migliora entrate e uscite per ridurre lo stress sull'utensile
    optimized.points = this.improveEntryExitForToolLife(optimized.points);

    return optimized;
  }

  /**
   * Ottimizza per costo di lavorazione
   */
  private async optimizeForCost(
    toolpath: Toolpath,
    analysis: any,
    tool?: Tool,
    material?: Material
  ): Promise<Toolpath> {
    // Crea una copia del percorso
    const optimized = {
      ...toolpath,
      points: [...toolpath.points]
    };

    // 1. Ottimizza la velocità di avanzamento per bilanciare tempo e durata utensile
    optimized.points = this.optimizeFeedRatesForCost(optimized.points, tool, material);

    // 2. Rimuovi movimenti non necessari
    optimized.points = this.removeUnnecessaryMoves(optimized.points);

    // 3. Ottimizza altezze di ritiro
    optimized.points = this.optimizeRetractHeights(optimized.points);

    return optimized;
  }

  /**
   * Ottimizza le velocità di avanzamento
   */
  private optimizeFeedRates(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    const optimized = [...points];

    // Determina la velocità ottimale per il materiale e l'utensile
    let optimalFeedRate = tool?.maxFeedRate || 3000; // mm/min

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        optimalFeedRate = optimalFeedRate * 0.8;
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        optimalFeedRate = optimalFeedRate * 0.4;
      } else if (material.type === "steel") {
        optimalFeedRate = optimalFeedRate * 0.6;
      } else if (material.type === "plastic" || material.type === "wood") {
        optimalFeedRate = optimalFeedRate * 1.2;
      }

      // Adatta ulteriormente in base alla machinability
      if (material.machinability) {
        optimalFeedRate = optimalFeedRate * (material.machinability / 100);
      }
    }

    // Imposta velocità ottimali per i movimenti di taglio
    for (let i = 0; i < optimized.length; i++) {
      const point = optimized[i];

      if (point.type !== "rapid" && point.type !== "retract") {
        // Adatta il feed rate in base al tipo di movimento
        if (point.type === "plunge") {
          point.feedRate = optimalFeedRate * 0.3; // Più lento per i plunge
        } else if (point.type === "lead-in" || point.type === "lead-out") {
          point.feedRate = optimalFeedRate * 0.7; // Più lento per entry/exit
        } else {
          point.feedRate = optimalFeedRate;
        }
      }
    }

    return optimized;
  }

  /**
   * Converte tagli aerei in movimenti rapidi
   */
  private convertAirCutsToRapid(points: ToolpathPoint[]): ToolpathPoint[] {
    const optimized = [...points];
    const safeZ = 0.0; // Assumiamo che Z=0 sia la superficie del materiale

    for (let i = 1; i < optimized.length; i++) {
      const p1 = optimized[i - 1];
      const p2 = optimized[i];

      // Se entrambi i punti sono sopra la superficie e non sono già rapidi
      if (p1.z > safeZ && p2.z > safeZ && p1.type !== "rapid" && p2.type !== "rapid") {
        // Calcola la distanza XY
        const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

        // Converti in rapido solo se la distanza è significativa
        if (distance > 3.0) {
          p2.type = "rapid";
          p2.feedRate = undefined; // Rimuovi il feed rate per i rapidi
        }
      }
    }

    return optimized;
  }

  /**
   * Rimuove movimenti ridondanti
   */
  private removeRedundantMoves(points: ToolpathPoint[]): ToolpathPoint[] {
    if (points.length < 3) return points;

    const result: ToolpathPoint[] = [points[0]];
    const threshold = 0.01; // mm, soglia per considerare i punti come coincidenti

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      // Verifica se il punto corrente è ridondante
      const isRedundant = this.isPointRedundant(prev, curr, next, threshold);

      if (!isRedundant) {
        result.push(curr);
      }
    }

    // Aggiungi sempre l'ultimo punto
    result.push(points[points.length - 1]);

    return result;
  }

  /**
   * Verifica se un punto è ridondante (può essere rimosso senza alterare significativamente il percorso)
   */
  private isPointRedundant(prev: ToolpathPoint, curr: ToolpathPoint, next: ToolpathPoint, threshold: number): boolean {
    // Se i tipi di movimento sono diversi, il punto non è ridondante
    if (curr.type !== prev.type || curr.type !== next.type) {
      return false;
    }

    // Se i feed rate sono significativamente diversi, il punto non è ridondante
    if (
      curr.feedRate &&
      prev.feedRate &&
      next.feedRate &&
      (Math.abs(curr.feedRate - prev.feedRate) > 0.1 * prev.feedRate ||
        Math.abs(curr.feedRate - next.feedRate) > 0.1 * next.feedRate)
    ) {
      return false;
    }

    // Calcola se il punto è collineare con i punti adiacenti
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dz1 = curr.z - prev.z;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1 + dz1 * dz1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const dz2 = next.z - curr.z;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);

    // Se uno dei segmenti è molto corto, considera il punto ridondante
    if (len1 < threshold || len2 < threshold) {
      return true;
    }

    // Normalizza i vettori direzionali
    const nx1 = dx1 / len1;
    const ny1 = dy1 / len1;
    const nz1 = dz1 / len1;

    const nx2 = dx2 / len2;
    const ny2 = dy2 / len2;
    const nz2 = dz2 / len2;

    // Calcola il prodotto scalare per verificare la collinearità
    const dotProduct = nx1 * nx2 + ny1 * ny2 + nz1 * nz2;

    // Se i vettori sono quasi paralleli (dot product vicino a 1), il punto è ridondante
    return dotProduct > 0.999;
  }

  /**
   * Ottimizza altezze di ritiro
   */
  private optimizeRetractHeights(points: ToolpathPoint[]): ToolpathPoint[] {
    const optimized = [...points];
    const safeHeight = 5.0; // mm, altezza di sicurezza ottimale

    for (let i = 0; i < optimized.length; i++) {
      const point = optimized[i];

      if (point.type === "retract" && point.z > safeHeight * 2) {
        point.z = safeHeight;
      }
    }

    return optimized;
  }

  /**
   * Ottimizza movimenti rapidi
   */
  private optimizeRapidMoves(points: ToolpathPoint[]): ToolpathPoint[] {
    if (points.length < 3) return points;

    const result: ToolpathPoint[] = [];
    let inRapidSequence = false;
    let rapidStart: ToolpathPoint | null = null;
    let rapidEnd: ToolpathPoint | null = null;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (point.type === "rapid") {
        if (!inRapidSequence) {
          // Inizio di una nuova sequenza rapida
          inRapidSequence = true;
          rapidStart = i > 0 ? points[i - 1] : point;
          result.push(rapidStart);
        }
        rapidEnd = point;
      } else {
        if (inRapidSequence && rapidEnd) {
          // Fine di una sequenza rapida
          inRapidSequence = false;
          // Aggiungi solo il punto finale della sequenza rapida
          result.push(rapidEnd);
        }
        // Aggiungi il punto non rapido
        result.push(point);
      }
    }

    // Se terminiamo con una sequenza rapida, aggiungi il punto finale
    if (inRapidSequence && rapidEnd && result[result.length - 1] !== rapidEnd) {
      result.push(rapidEnd);
    }

    return result;
  }

  /**
   * Ottimizza feed rate per qualità
   */
  private optimizeFeedRatesForQuality(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    const optimized = [...points];

    // Determina la velocità ottimale per qualità
    let qualityFeedRate = tool?.maxFeedRate ? tool.maxFeedRate * 0.6 : 1800; // mm/min

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        qualityFeedRate = qualityFeedRate * 0.7;
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        qualityFeedRate = qualityFeedRate * 0.5;
      } else if (material.type === "plastic" || material.type === "wood") {
        qualityFeedRate = qualityFeedRate * 0.9;
      }
    }

    // Applica feed rate ottimizzati per qualità
    for (let i = 0; i < optimized.length; i++) {
      const point = optimized[i];

      if (point.type !== "rapid" && point.type !== "retract") {
        // Riduci il feed rate per tutti i movimenti di taglio
        if (point.type === "plunge") {
          point.feedRate = qualityFeedRate * 0.3;
        } else if (point.type === "lead-in" || point.type === "lead-out") {
          point.feedRate = qualityFeedRate * 0.6;
        } else {
          point.feedRate = qualityFeedRate;
        }
      }
    }

    return optimized;
  }

  /**
   * Aggiunge punti per smoothing nelle curve
   */
  private addSmoothingPoints(points: ToolpathPoint[]): ToolpathPoint[] {
    if (points.length < 3) return points;

    const result: ToolpathPoint[] = [points[0]];
    const angleThreshold = 30; // gradi, soglia per considerare un cambio di direzione significativo

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      // Aggiungi il punto corrente
      result.push(curr);

      // Verifica se c'è un cambio di direzione significativo
      if (curr.type !== "rapid" && next.type !== "rapid") {
        const angle = this.calculateAngle(prev, curr, next);

        if (angle > angleThreshold) {
          // Aggiungi punti intermedi per smoothing
          const smoothingPoints = this.generateSmoothingPoints(curr, next, 3);
          result.push(...smoothingPoints);
        }
      }
    }

    // Aggiungi l'ultimo punto
    result.push(points[points.length - 1]);

    return result;
  }

  /**
   * Calcola l'angolo tra tre punti
   */
  private calculateAngle(p1: ToolpathPoint, p2: ToolpathPoint, p3: ToolpathPoint): number {
    const v1x = p1.x - p2.x;
    const v1y = p1.y - p2.y;
    const v1z = p1.z - p2.z;

    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;
    const v2z = p3.z - p2.z;

    const len1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

    const dotProduct = v1x * v2x + v1y * v2y + v1z * v2z;
    const cosAngle = dotProduct / (len1 * len2);

    // Converto in gradi
    return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
  }

  /**
   * Genera punti intermedi per smoothing
   */
  private generateSmoothingPoints(start: ToolpathPoint, end: ToolpathPoint, count: number): ToolpathPoint[] {
    const result: ToolpathPoint[] = [];

    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);

      result.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
        feedRate: start.feedRate,
        type: start.type
      });
    }

    return result;
  }

  /**
   * Ottimizza profondità di taglio
   */
  private optimizeCuttingDepth(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    const optimized = [...points];

    // Determina la profondità massima sicura
    let maxSafeDepth = tool?.maxCuttingDepth || (tool?.diameter ? tool.diameter * 0.5 : 3.0);

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        maxSafeDepth = maxSafeDepth * 1.2;
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        maxSafeDepth = maxSafeDepth * 0.6;
      }
    }

    // Analizza e ottimizza le profondità di taglio
    for (let i = 1; i < optimized.length; i++) {
      const p1 = optimized[i - 1];
      const p2 = optimized[i];

      // Ignora movimenti rapidi
      if (p2.type === "rapid" || p1.type === "rapid") {
        continue;
      }

      // Calcola la differenza di Z (profondità)
      const depthChange = p1.z - p2.z;

      // Se la profondità di taglio è eccessiva, correggi
      if (depthChange > maxSafeDepth) {
        // Divide il movimento in più passate
        const passeCount = Math.ceil(depthChange / maxSafeDepth);
        const depthPerPass = depthChange / passeCount;

        // Crea punti intermedi per le passate
        const intermediatePoints: ToolpathPoint[] = [];

        for (let j = 1; j < passeCount; j++) {
          intermediatePoints.push({
            x: p1.x + (p2.x - p1.x) * (j / passeCount),
            y: p1.y + (p2.y - p1.y) * (j / passeCount),
            z: p1.z - depthPerPass * j,
            feedRate: p2.feedRate ? p2.feedRate * 0.8 : undefined, // Riduci feed rate per passate profonde
            type: "plunge"
          });
        }

        // Inserisci i punti intermedi
        optimized.splice(i, 0, ...intermediatePoints);
        i += intermediatePoints.length;
      }
    }

    return optimized;
  }

  /**
   * Migliora entrate e uscite
   */
  private improveEntryExit(points: ToolpathPoint[]): ToolpathPoint[] {
    if (points.length < 2) return points;

    const result: ToolpathPoint[] = [];

    // Migliora l'entrata (inizio del percorso)
    const firstPoint = points[0];
    const secondPoint = points[1];

    // Se il percorso non inizia con un approccio appropriato, aggiungilo
    if (
      firstPoint.type !== "rapid" &&
      firstPoint.type !== "approach" &&
      secondPoint.type !== "rapid" &&
      secondPoint.type !== "approach"
    ) {
      // Aggiungi un punto di approccio
      const approachPoint: ToolpathPoint = {
        x: firstPoint.x - (secondPoint.x - firstPoint.x) * 0.3,
        y: firstPoint.y - (secondPoint.y - firstPoint.y) * 0.3,
        z: firstPoint.z + 2.0, // Leggermente sopra il punto di partenza
        type: "approach",
        feedRate: firstPoint.feedRate ? firstPoint.feedRate * 0.7 : undefined
      };

      result.push(approachPoint);
    }

    // Aggiungi tutti i punti originali
    result.push(...points);

    // Migliora l'uscita (fine del percorso)
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2];

    // Se il percorso non termina con un'uscita appropriata, aggiungila
    if (
      lastPoint.type !== "rapid" &&
      lastPoint.type !== "lead-out" &&
      lastPoint.type !== "retract" &&
      secondLastPoint.type !== "rapid" &&
      secondLastPoint.type !== "lead-out"
    ) {
      // Aggiungi un punto di uscita
      const exitPoint: ToolpathPoint = {
        x: lastPoint.x + (lastPoint.x - secondLastPoint.x) * 0.3,
        y: lastPoint.y + (lastPoint.y - secondLastPoint.y) * 0.3,
        z: lastPoint.z + 2.0, // Leggermente sopra il punto finale
        type: "lead-out",
        feedRate: lastPoint.feedRate ? lastPoint.feedRate * 0.7 : undefined
      };

      result.push(exitPoint);

      // Aggiungi un ritiro completo
      const retractPoint: ToolpathPoint = {
        x: exitPoint.x,
        y: exitPoint.y,
        z: exitPoint.z + 5.0, // Altezza di sicurezza
        type: "retract"
      };

      result.push(retractPoint);
    }

    return result;
  }

  /**
   * Riduce feed rate in aree critiche per aumentare la durata dell'utensile
   */
  private reduceFeedRatesInCriticalAreas(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    const optimized = [...points];

    // Determina un feed rate sicuro per la durata dell'utensile
    let toolLifeFeedRate = tool?.maxFeedRate ? tool.maxFeedRate * 0.7 : 2000; // mm/min

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        toolLifeFeedRate = toolLifeFeedRate * 0.8;
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        toolLifeFeedRate = toolLifeFeedRate * 0.5;
      }
    }

    // Identifica aree critiche (cambi di direzione, profondità elevate)
    for (let i = 1; i < optimized.length - 1; i++) {
      const prev = optimized[i - 1];
      const curr = optimized[i];
      const next = optimized[i + 1];

      // Ignora movimenti rapidi
      if (curr.type === "rapid" || curr.type === "retract") {
        continue;
      }

      // Verifica cambi di direzione
      const angle = this.calculateAngle(prev, curr, next);

      // Se c'è un cambio di direzione significativo, riduci il feed rate
      if (angle > 30 && curr.feedRate) {
        curr.feedRate = Math.min(curr.feedRate, toolLifeFeedRate * 0.8);
      }

      // Verifica profondità elevate
      if (prev.z - curr.z > 2.0 && curr.feedRate) {
        curr.feedRate = Math.min(curr.feedRate, toolLifeFeedRate * 0.6);
      }
    }

    return optimized;
  }

  /**
   * Ottimizza profondità di taglio per durata utensile
   */
  private optimizeCuttingDepthForToolLife(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    // Simile a optimizeCuttingDepth ma con valori più conservativi
    const optimized = [...points];

    // Determina la profondità massima sicura per la durata dell'utensile
    let maxSafeDepth = tool?.maxCuttingDepth ? tool.maxCuttingDepth * 0.7 : tool?.diameter ? tool.diameter * 0.3 : 2.0;

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        maxSafeDepth = maxSafeDepth * 1.0; // Non modificare per l'alluminio
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        maxSafeDepth = maxSafeDepth * 0.5; // Molto più conservativo per materiali duri
      }
    }

    // Analizza e ottimizza le profondità di taglio
    for (let i = 1; i < optimized.length; i++) {
      const p1 = optimized[i - 1];
      const p2 = optimized[i];

      // Ignora movimenti rapidi
      if (p2.type === "rapid" || p1.type === "rapid") {
        continue;
      }

      // Calcola la differenza di Z (profondità)
      const depthChange = p1.z - p2.z;

      // Se la profondità di taglio è eccessiva, correggi
      if (depthChange > maxSafeDepth) {
        // Divide il movimento in più passate
        const passeCount = Math.ceil(depthChange / maxSafeDepth);
        const depthPerPass = depthChange / passeCount;

        // Crea punti intermedi per le passate
        const intermediatePoints: ToolpathPoint[] = [];

        for (let j = 1; j < passeCount; j++) {
          intermediatePoints.push({
            x: p1.x + (p2.x - p1.x) * (j / passeCount),
            y: p1.y + (p2.y - p1.y) * (j / passeCount),
            z: p1.z - depthPerPass * j,
            feedRate: p2.feedRate ? p2.feedRate * 0.7 : undefined, // Riduce ulteriormente il feed rate
            type: "plunge"
          });
        }

        // Inserisci i punti intermedi
        optimized.splice(i, 0, ...intermediatePoints);
        i += intermediatePoints.length;
      }
    }

    return optimized;
  }

  /**
   * Migliora entrate e uscite per durata utensile
   */
  private improveEntryExitForToolLife(points: ToolpathPoint[]): ToolpathPoint[] {
    // Simile a improveEntryExit ma con approcci più graduali e conservativi
    if (points.length < 2) return points;

    const result: ToolpathPoint[] = [];

    // Migliora l'entrata (inizio del percorso)
    const firstPoint = points[0];
    const secondPoint = points[1];

    // Se il percorso non inizia con un approccio appropriato, aggiungilo
    if (
      firstPoint.type !== "rapid" &&
      firstPoint.type !== "approach" &&
      secondPoint.type !== "rapid" &&
      secondPoint.type !== "approach"
    ) {
      // Aggiungi una serie di punti di approccio per un'entrata più graduale
      const approachPoints: ToolpathPoint[] = [];

      // Punto di approccio 1 - iniziale
      approachPoints.push({
        x: firstPoint.x - (secondPoint.x - firstPoint.x) * 0.6,
        y: firstPoint.y - (secondPoint.y - firstPoint.y) * 0.6,
        z: firstPoint.z + 4.0,
        type: "approach",
        feedRate: firstPoint.feedRate ? firstPoint.feedRate * 0.5 : undefined
      });

      // Punto di approccio 2 - intermedio
      approachPoints.push({
        x: firstPoint.x - (secondPoint.x - firstPoint.x) * 0.3,
        y: firstPoint.y - (secondPoint.y - firstPoint.y) * 0.3,
        z: firstPoint.z + 2.0,
        type: "approach",
        feedRate: firstPoint.feedRate ? firstPoint.feedRate * 0.6 : undefined
      });

      result.push(...approachPoints);
    }

    // Aggiungi tutti i punti originali
    result.push(...points);

    // Migliora l'uscita (fine del percorso)
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2];

    // Se il percorso non termina con un'uscita appropriata, aggiungila
    if (
      lastPoint.type !== "rapid" &&
      lastPoint.type !== "lead-out" &&
      lastPoint.type !== "retract" &&
      secondLastPoint.type !== "rapid" &&
      secondLastPoint.type !== "lead-out"
    ) {
      // Aggiungi una serie di punti di uscita per un'uscita più graduale
      const exitPoints: ToolpathPoint[] = [];

      // Punto di uscita 1 - iniziale
      exitPoints.push({
        x: lastPoint.x + (lastPoint.x - secondLastPoint.x) * 0.3,
        y: lastPoint.y + (lastPoint.y - secondLastPoint.y) * 0.3,
        z: lastPoint.z + 1.0,
        type: "lead-out",
        feedRate: lastPoint.feedRate ? lastPoint.feedRate * 0.6 : undefined
      });

      // Punto di uscita 2 - intermedio
      exitPoints.push({
        x: lastPoint.x + (lastPoint.x - secondLastPoint.x) * 0.6,
        y: lastPoint.y + (lastPoint.y - secondLastPoint.y) * 0.6,
        z: lastPoint.z + 3.0,
        type: "lead-out",
        feedRate: lastPoint.feedRate ? lastPoint.feedRate * 0.5 : undefined
      });

      // Punto di ritiro
      exitPoints.push({
        x: exitPoints[1].x,
        y: exitPoints[1].y,
        z: exitPoints[1].z + 5.0,
        type: "retract"
      });

      result.push(...exitPoints);
    }

    return result;
  }

  /**
   * Ottimizza feed rate per bilanciare costo (tempo vs. durata utensile)
   */
  private optimizeFeedRatesForCost(points: ToolpathPoint[], tool?: Tool, material?: Material): ToolpathPoint[] {
    const optimized = [...points];

    // Determina la velocità ottimale bilanciando tempo e durata utensile
    let costOptimalFeedRate = tool?.maxFeedRate ? tool.maxFeedRate * 0.8 : 2500; // mm/min

    // Adatta in base al materiale
    if (material) {
      if (material.type === "aluminum") {
        costOptimalFeedRate = costOptimalFeedRate * 0.9;
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        costOptimalFeedRate = costOptimalFeedRate * 0.6;
      } else if (material.type === "plastic" || material.type === "wood") {
        costOptimalFeedRate = costOptimalFeedRate * 1.1;
      }
    }

    // Applica feed rate ottimizzati per costo
    for (let i = 0; i < optimized.length; i++) {
      const point = optimized[i];

      if (point.type !== "rapid" && point.type !== "retract") {
        // Adatta il feed rate in base al tipo di movimento
        if (point.type === "plunge") {
          point.feedRate = costOptimalFeedRate * 0.4;
        } else if (point.type === "lead-in" || point.type === "lead-out") {
          point.feedRate = costOptimalFeedRate * 0.7;
        } else if (point.type === "approach") {
          point.feedRate = costOptimalFeedRate * 0.6;
        } else {
          point.feedRate = costOptimalFeedRate;
        }
      }
    }

    return optimized;
  }

  /**
   * Rimuove movimenti non necessari
   */
  private removeUnnecessaryMoves(points: ToolpathPoint[]): ToolpathPoint[] {
    return this.removeRedundantMoves(points);
  }
}

// Esporta un'istanza singleton
export const toolpathOptimizer = new ToolpathOptimizer();
