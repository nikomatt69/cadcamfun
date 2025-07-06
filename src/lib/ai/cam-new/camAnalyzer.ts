// src/lib/ai/cam-new/camAnalyzer.ts
import { v4 as uuidv4 } from "uuid";
import {
  Toolpath,
  Tool,
  Material,
  MachiningOperation,
  ToolpathAnalysis,
  ToolpathIssue,
  ToolpathRecommendation,
  ToolpathSegmentType
} from "../../../types/CAMTypes";
import { aiAnalytics } from "../ai-new/aiAnalytics";

/**
 * Classe responsabile dell'analisi dei percorsi utensile e delle strategie di lavorazione
 */
export class CAMAnalyzer {
  /**
   * Analizza un percorso utensile per identificare potenziali problemi e miglioramenti
   */
  async analyzeToolpath(toolpath: Toolpath, tool?: Tool, material?: Material): Promise<ToolpathAnalysis> {
    // Traccia l'analisi per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_analyzer",
      eventName: "analyze_toolpath",
      metadata: {
        toolpathId: toolpath.id,
        toolpathName: toolpath.name,
        pointCount: toolpath.points.length
      }
    });

    // Inizia l'analisi del percorso utensile
    const startTime = Date.now();

    try {
      // Estrae lo strumento dal percorso utensile o usa quello fornito
      const activeTool = tool || ({ id: toolpath.toolId } as Tool);

      // Calcola le statistiche di base del percorso
      const stats = this.calculateToolpathStats(toolpath);

      // Identifica problemi nel percorso utensile
      const issues = this.identifyToolpathIssues(toolpath, activeTool, material);

      // Genera raccomandazioni per migliorare il percorso
      const recommendations = this.generateToolpathRecommendations(toolpath, activeTool, issues, material);

      // Calcola metriche di efficienza e qualità
      const efficiency = this.calculateEfficiency(toolpath, issues);
      const quality = this.calculateQuality(toolpath, activeTool, issues, material);

      // Assembla e restituisci l'analisi completa
      const analysis: ToolpathAnalysis = {
        id: uuidv4(),
        toolpathId: toolpath.id,
        ...stats,
        issues,
        recommendations,
        efficiency,
        quality
      };

      // Traccia il completamento dell'analisi
      aiAnalytics.trackEvent({
        eventType: "cam_analyzer",
        eventName: "toolpath_analysis_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          toolpathId: toolpath.id,
          issuesFound: issues.length,
          recommendationsCount: recommendations.length,
          efficiency,
          quality
        }
      });

      return analysis;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "toolpath_analysis_error",
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
   * Calcola statistiche di base per un percorso utensile
   */
  private calculateToolpathStats(toolpath: Toolpath) {
    // Inizializza contatori
    let rapidMoves = 0;
    let cuttingMoves = 0;
    let totalDistance = 0;
    let cuttingDistance = 0;
    let rapidDistance = 0;
    let feedRates: number[] = [];
    let maxDepthPerPass = 0;
    let maxStepover = 0;

    // Analizza ogni segmento del percorso
    for (let i = 1; i < toolpath.points.length; i++) {
      const p1 = toolpath.points[i - 1];
      const p2 = toolpath.points[i];

      // Calcola la distanza tra i punti
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      // Aggiungi la distanza al totale
      totalDistance += distance;

      // Determina il tipo di movimento
      const moveType = p2.type || this.inferMoveType(p1, p2);

      if (moveType === "rapid") {
        rapidMoves++;
        rapidDistance += distance;
      } else {
        cuttingMoves++;
        cuttingDistance += distance;

        // Raccoglie i feed rate per le statistiche
        if (p2.feedRate) {
          feedRates.push(p2.feedRate);
        }
      }

      // Calcola la differenza di Z per determinare la profondità di taglio
      const depthOfCut = Math.abs(p2.z - p1.z);
      if (depthOfCut > maxDepthPerPass && moveType !== "rapid") {
        maxDepthPerPass = depthOfCut;
      }
    }

    // Calcola statistiche sui feed rate
    const minFeedRate = feedRates.length > 0 ? Math.min(...feedRates) : toolpath.operation.feedRate;
    const maxFeedRate = feedRates.length > 0 ? Math.max(...feedRates) : toolpath.operation.feedRate;
    const avgFeedRate =
      feedRates.length > 0
        ? feedRates.reduce((sum, rate) => sum + rate, 0) / feedRates.length
        : toolpath.operation.feedRate;

    // Estrai il stepover dall'operazione se disponibile
    if (typeof toolpath.operation.stepover === "number") {
      maxStepover = toolpath.operation.stepover;
    }

    // Estrae il tempo stimato dal percorso utensile o lo calcola
    const machiningTime =
      toolpath.estimatedTime ||
      this.estimateMachiningTime(
        toolpath.points,
        toolpath.operation.feedRate,
        5000 // Rapid feed rate predefinito (mm/min)
      );

    return {
      machiningTime,
      rapidMoves,
      cuttingMoves,
      totalDistance,
      cuttingDistance,
      rapidDistance,
      minFeedRate,
      maxFeedRate,
      avgFeedRate,
      maxDepthPerPass,
      maxStepover
    };
  }

  /**
   * Inferisce il tipo di movimento basato sulle caratteristiche dei punti
   */
  private inferMoveType(p1: any, p2: any): ToolpathSegmentType {
    // Se il punto ha già un tipo definito, usalo
    if (p2.type) {
      return p2.type;
    }

    // Se c'è un grande movimento in Z positivo, probabilmente è un retract
    if (p2.z - p1.z > 0.5) {
      return "retract";
    }

    // Se c'è un grande movimento in Z negativo, probabilmente è un plunge
    if (p1.z - p2.z > 0.5) {
      return "plunge";
    }

    // Se la distanza XY è grande, probabilmente è un rapido
    const xyDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (xyDistance > 10) {
      return "rapid";
    }

    // Altrimenti è probabilmente un movimento di taglio
    return "cutting";
  }

  /**
   * Stima il tempo di lavorazione basato sul percorso utensile
   */
  private estimateMachiningTime(points: Toolpath["points"], defaultFeedRate: number, rapidFeedRate: number): number {
    let totalTime = 0; // in secondi

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Calcola la distanza tra i punti
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      // Determina il feed rate da utilizzare
      let feedRate: number;

      if (p2.type === "rapid" || p1.type === "rapid") {
        feedRate = rapidFeedRate; // mm/min
      } else {
        feedRate = p2.feedRate || p1.feedRate || defaultFeedRate; // mm/min
      }

      // Calcola il tempo in minuti e converti in secondi
      const timeMinutes = distance / feedRate;
      totalTime += timeMinutes * 60;
    }

    return totalTime;
  }

  /**
   * Identifica problemi nel percorso utensile
   */
  private identifyToolpathIssues(toolpath: Toolpath, tool: Tool, material?: Material): ToolpathIssue[] {
    const issues: ToolpathIssue[] = [];
    const points = toolpath.points;
    const operation = toolpath.operation;

    // Verifica movimenti inefficienti
    this.checkForInefficientMovements(toolpath, issues);

    // Verifica problemi di feed rate
    this.checkFeedRateIssues(toolpath, tool, issues, material);

    // Verifica problemi di profondità di taglio e stepover
    this.checkCutParameterIssues(toolpath, tool, issues, material);

    // Verifica approcci e ritiri non ottimizzati
    this.checkApproachAndRetractIssues(toolpath, issues);

    // Verifica entry/exit sicuri
    this.checkEntryExitIssues(toolpath, issues);

    // Verifica tagli aerei
    this.checkAirCuttingIssues(toolpath, issues);

    return issues;
  }

  /**
   * Verifica se ci sono movimenti inefficienti nel percorso
   */
  private checkForInefficientMovements(toolpath: Toolpath, issues: ToolpathIssue[]): void {
    const points = toolpath.points;
    const threshold = 2.0; // mm, soglia per considerare un movimento come ridondante

    // Verifica movimenti troppo corti
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];

      // Calcola distanze
      const d1 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      const d2 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2) + Math.pow(p3.z - p2.z, 2));

      // Se entrambe le distanze sono molto piccole, potrebbe essere un movimento ridondante
      if (d1 < threshold && d2 < threshold && p2.type !== "rapid" && p3.type !== "rapid") {
        issues.push({
          id: uuidv4(),
          type: "inefficient_movement",
          severity: "low",
          description: `Movimento potenzialmente ridondante rilevato ai punti ${i - 1}-${i + 1}`,
          location: {
            startIndex: i - 1,
            endIndex: i + 1
          },
          suggestedFix: "Considera di rimuovere il punto intermedio per semplificare il percorso."
        });
      }
    }

    // Verifica movimenti rapidi non necessari (rapido seguito immediatamente da un altro rapido)
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];

      if (
        (p1.type === "rapid" || p1.type === "retract") &&
        (p2.type === "rapid" || p2.type === "retract") &&
        (p3.type === "rapid" || p3.type === "retract")
      ) {
        issues.push({
          id: uuidv4(),
          type: "inefficient_movement",
          severity: "medium",
          description: `Sequenza di movimenti rapidi possibilmente inefficiente rilevata ai punti ${i - 1}-${i + 1}`,
          location: {
            startIndex: i - 1,
            endIndex: i + 1
          },
          suggestedFix: "Considera di ottimizzare questa sequenza di movimenti rapidi."
        });
      }
    }
  }

  /**
   * Verifica problemi con i feed rate
   */
  private checkFeedRateIssues(toolpath: Toolpath, tool: Tool, issues: ToolpathIssue[], material?: Material): void {
    const points = toolpath.points;
    const operation = toolpath.operation;

    // Feed rate di sicurezza basati sul tipo di utensile e materiale
    let maxSafeFeedRate = tool.maxFeedRate || 5000; // mm/min
    let minEfficientFeedRate = operation.feedRate * 0.5; // 50% del feed rate configurato

    // Adatta in base al materiale se disponibile
    if (material) {
      // Adatta in base alla machinability del materiale
      if (material.machinability) {
        maxSafeFeedRate = maxSafeFeedRate * (material.machinability / 100);
      }

      // Riduci ulteriormente per materiali duri
      if (material.type === "stainless_steel" || material.type === "titanium") {
        maxSafeFeedRate = maxSafeFeedRate * 0.7;
      }
    }

    // Verifica feed rate troppo alti
    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (point.type !== "rapid" && point.feedRate && point.feedRate > maxSafeFeedRate) {
        issues.push({
          id: uuidv4(),
          type: "feed_rate_issue",
          severity: "high",
          description: `Feed rate eccessivo (${point.feedRate} mm/min) rilevato al punto ${i}`,
          location: {
            startIndex: i,
            endIndex: i
          },
          suggestedFix: `Riduci il feed rate a un massimo di ${Math.round(maxSafeFeedRate)} mm/min per questo utensile e materiale.`
        });
      }
    }

    // Verifica feed rate troppo bassi (inefficienti)
    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (point.type !== "rapid" && point.feedRate && point.feedRate < minEfficientFeedRate) {
        issues.push({
          id: uuidv4(),
          type: "feed_rate_issue",
          severity: "low",
          description: `Feed rate potenzialmente inefficiente (${point.feedRate} mm/min) rilevato al punto ${i}`,
          location: {
            startIndex: i,
            endIndex: i
          },
          suggestedFix: `Considera di aumentare il feed rate ad almeno ${Math.round(minEfficientFeedRate)} mm/min per migliorare l'efficienza.`
        });
      }
    }

    // Verifica variazioni brusche di feed rate
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      if (
        p1.feedRate &&
        p2.feedRate &&
        p1.type !== "rapid" &&
        p2.type !== "rapid" &&
        Math.abs(p1.feedRate - p2.feedRate) > p1.feedRate * 0.5
      ) {
        issues.push({
          id: uuidv4(),
          type: "feed_rate_issue",
          severity: "medium",
          description: `Variazione brusca di feed rate (da ${p1.feedRate} a ${p2.feedRate} mm/min) rilevata tra i punti ${i - 1} e ${i}`,
          location: {
            startIndex: i - 1,
            endIndex: i
          },
          suggestedFix: "Considera di introdurre una transizione più graduale dei feed rate."
        });
      }
    }
  }

  /**
   * Verifica problemi con profondità di taglio e stepover
   */
  private checkCutParameterIssues(toolpath: Toolpath, tool: Tool, issues: ToolpathIssue[], material?: Material): void {
    const points = toolpath.points;
    const operation = toolpath.operation;

    // Limiti di sicurezza basati sul tipo di utensile
    let maxSafeDepth = tool.maxCuttingDepth || tool.diameter * 0.5;
    let maxSafeStepover = tool.maxStepover || tool.diameter * 0.4; // 40% del diametro

    // Adatta in base al materiale se disponibile
    if (material) {
      if (material.type === "aluminum") {
        maxSafeDepth = maxSafeDepth * 1.2; // L'alluminio permette profondità maggiori
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        maxSafeDepth = maxSafeDepth * 0.6; // Materiali duri richiedono profondità minori
        maxSafeStepover = maxSafeStepover * 0.7; // E stepover più conservativi
      }
    }

    // Verifica profondità di taglio eccessive
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Ignora movimenti rapidi
      if (p2.type === "rapid" || p1.type === "rapid") {
        continue;
      }

      // Calcola la differenza di Z (profondità)
      const depthChange = Math.abs(p2.z - p1.z);

      if (depthChange > maxSafeDepth) {
        issues.push({
          id: uuidv4(),
          type: "excessive_depth",
          severity: "high",
          description: `Profondità di taglio eccessiva (${depthChange.toFixed(2)} mm) rilevata tra i punti ${i - 1} e ${i}`,
          location: {
            startIndex: i - 1,
            endIndex: i
          },
          suggestedFix: `Riduci la profondità di taglio a un massimo di ${maxSafeDepth.toFixed(2)} mm per questo utensile e materiale.`
        });
      }
    }

    // Verifica stepover eccessivo se definito nell'operazione
    if (operation.stepover && operation.stepover > maxSafeStepover) {
      issues.push({
        id: uuidv4(),
        type: "excessive_stepover",
        severity: "medium",
        description: `Stepover eccessivo (${operation.stepover} mm o ${((operation.stepover / tool.diameter) * 100).toFixed(1)}% del diametro) configurato per questa operazione`,
        suggestedFix: `Riduci lo stepover a un massimo di ${maxSafeStepover.toFixed(2)} mm (${((maxSafeStepover / tool.diameter) * 100).toFixed(1)}% del diametro) per questo utensile e materiale.`
      });
    }
  }

  /**
   * Verifica problemi negli approcci e ritiri
   */
  private checkApproachAndRetractIssues(toolpath: Toolpath, issues: ToolpathIssue[]): void {
    const points = toolpath.points;

    // Verifica ritiri inefficienti (troppo alti)
    const safeHeight = 5.0; // mm, altezza di sicurezza tipica
    const excessiveHeight = 20.0; // mm, altezza considerata eccessiva

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (point.type === "retract" && point.z > excessiveHeight) {
        issues.push({
          id: uuidv4(),
          type: "unoptimized_retract",
          severity: "low",
          description: `Ritiro potenzialmente eccessivo (Z=${point.z.toFixed(2)} mm) rilevato al punto ${i}`,
          location: {
            startIndex: i,
            endIndex: i
          },
          suggestedFix: `Considera di ridurre l'altezza di ritiro a circa ${safeHeight.toFixed(1)} mm per migliorare l'efficienza.`
        });
      }
    }

    // Verifica approcci diretti (potenzialmente pericolosi)
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Cerca situazioni in cui un movimento rapido è seguito direttamente da un movimento di taglio
      // senza un adeguato approccio graduale
      if (
        (p1.type === "rapid" || p1.type === "retract") &&
        (p2.type === "cutting" || p2.type === undefined) &&
        Math.abs(p2.z - p1.z) < 0.5
      ) {
        // Non c'è un plunge significativo
        issues.push({
          id: uuidv4(),
          type: "unoptimized_approach",
          severity: "medium",
          description: `Approccio diretto potenzialmente problematico rilevato al punto ${i}`,
          location: {
            startIndex: i - 1,
            endIndex: i
          },
          suggestedFix:
            "Considera di aggiungere un movimento di approccio graduale (lead-in) prima di iniziare il taglio."
        });
      }
    }
  }

  /**
   * Verifica problemi di entrata/uscita
   */
  private checkEntryExitIssues(toolpath: Toolpath, issues: ToolpathIssue[]): void {
    const points = toolpath.points;

    // Verifica entrata diretta nel materiale (diving)
    if (points.length > 1) {
      const p1 = points[0];
      const p2 = points[1];

      if (p1.type !== "rapid" && p1.type !== "approach" && p2.type !== "rapid" && p2.type !== "approach") {
        issues.push({
          id: uuidv4(),
          type: "unsafe_entry",
          severity: "medium",
          description:
            "Il percorso utensile inizia direttamente con un movimento di taglio, senza un approccio appropriato",
          location: {
            startIndex: 0,
            endIndex: 1
          },
          suggestedFix: "Aggiungi un movimento di approccio appropriato all'inizio del percorso utensile."
        });
      }
    }

    // Verifica uscita diretta dal materiale
    if (points.length > 1) {
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];

      if (
        p1.type !== "rapid" &&
        p1.type !== "lead-out" &&
        p2.type !== "rapid" &&
        p2.type !== "lead-out" &&
        p2.type !== "retract"
      ) {
        issues.push({
          id: uuidv4(),
          type: "unsafe_exit",
          severity: "medium",
          description:
            "Il percorso utensile termina direttamente con un movimento di taglio, senza un'uscita appropriata",
          location: {
            startIndex: points.length - 2,
            endIndex: points.length - 1
          },
          suggestedFix: "Aggiungi un movimento di uscita appropriato (lead-out) alla fine del percorso utensile."
        });
      }
    }
  }

  /**
   * Verifica tagli aerei
   */
  private checkAirCuttingIssues(toolpath: Toolpath, issues: ToolpathIssue[]): void {
    const points = toolpath.points;
    const safeZ = 0.0; // Assumiamo che Z=0 sia la superficie del materiale

    // Cerca sequenze di punti che sembrano essere movimenti di taglio ma sono sopra il materiale
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      if (p1.type !== "rapid" && p2.type !== "rapid" && p1.z > safeZ && p2.z > safeZ) {
        // Calcola la distanza XY
        const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

        // Ignora movimenti molto corti
        if (distance > 5.0) {
          issues.push({
            id: uuidv4(),
            type: "unnecessary_air_cutting",
            severity: "low",
            description: `Potenziale taglio in aria rilevato tra i punti ${i - 1} e ${i}`,
            location: {
              startIndex: i - 1,
              endIndex: i
            },
            suggestedFix: "Considera di convertire questo movimento in un rapido per migliorare l'efficienza."
          });
        }
      }
    }
  }

  /**
   * Genera raccomandazioni per migliorare il percorso utensile
   */
  private generateToolpathRecommendations(
    toolpath: Toolpath,
    tool: Tool,
    issues: ToolpathIssue[],
    material?: Material
  ): ToolpathRecommendation[] {
    const recommendations: ToolpathRecommendation[] = [];

    // Organizza i problemi per tipo
    const issuesByType = issues.reduce(
      (acc, issue) => {
        acc[issue.type] = acc[issue.type] || [];
        acc[issue.type].push(issue);
        return acc;
      },
      {} as Record<string, ToolpathIssue[]>
    );

    // Raccomandazioni basate sui problemi di feed rate
    if (issuesByType["feed_rate_issue"]) {
      const feedRateIssues = issuesByType["feed_rate_issue"];
      const highFeedRates = feedRateIssues.filter(i => i.description.includes("eccessivo"));
      const lowFeedRates = feedRateIssues.filter(i => i.description.includes("inefficiente"));
      const volatileFeedRates = feedRateIssues.filter(i => i.description.includes("brusca"));

      // Raccomandazione per feed rate eccessivi
      if (highFeedRates.length > 0) {
        // Estrai il valore massimo sicuro dal fix suggerito
        const suggestedMaxFeedRate = highFeedRates[0].suggestedFix
          ? parseInt(highFeedRates[0].suggestedFix.match(/\d+/)![0])
          : Math.round(tool.maxFeedRate || toolpath.operation.feedRate * 0.8);

        recommendations.push({
          id: uuidv4(),
          type: "feed_rate",
          description: `Riduci i feed rate eccessivi a un massimo di ${suggestedMaxFeedRate} mm/min`,
          currentValue: Math.max(...toolpath.points.filter(p => p.feedRate !== undefined).map(p => p.feedRate!)),
          recommendedValue: suggestedMaxFeedRate,
          estimatedImprovement: {
            toolLife: 30, // Percentuale stimata di miglioramento della durata utensile
            quality: 15 // Percentuale stimata di miglioramento della qualità
          },
          confidence: 0.9
        });
      }

      // Raccomandazione per feed rate troppo bassi
      if (lowFeedRates.length > 0) {
        const minEfficientFeedRate = Math.round(toolpath.operation.feedRate * 0.7);

        recommendations.push({
          id: uuidv4(),
          type: "feed_rate",
          description: `Aumenta i feed rate inefficienti ad almeno ${minEfficientFeedRate} mm/min`,
          currentValue: Math.min(
            ...toolpath.points.filter(p => p.feedRate !== undefined && p.type !== "rapid").map(p => p.feedRate!)
          ),
          recommendedValue: minEfficientFeedRate,
          estimatedImprovement: {
            time: Math.round(lowFeedRates.length * 5) // Stima di secondi risparmiati
          },
          confidence: 0.8
        });
      }

      // Raccomandazione per variazioni brusche di feed rate
      if (volatileFeedRates.length > 0) {
        recommendations.push({
          id: uuidv4(),
          type: "feed_rate",
          description:
            "Uniforma le variazioni brusche di feed rate per ridurre lo stress sulla macchina e migliorare la finitura",
          estimatedImprovement: {
            quality: 10,
            toolLife: 5
          },
          confidence: 0.7
        });
      }
    }

    // Raccomandazioni basate sui problemi di profondità di taglio
    if (issuesByType["excessive_depth"]) {
      const depthIssues = issuesByType["excessive_depth"];

      // Estrai il valore massimo sicuro dal fix suggerito
      const suggestedMaxDepth = depthIssues[0].suggestedFix
        ? parseFloat(depthIssues[0].suggestedFix.match(/\d+\.\d+/)![0])
        : tool.maxCuttingDepth || tool.diameter * 0.5;

      recommendations.push({
        id: uuidv4(),
        type: "depth_of_cut",
        description: `Riduci la profondità di taglio a un massimo di ${suggestedMaxDepth.toFixed(2)} mm`,
        currentValue: Math.max(...depthIssues.map(i => parseFloat(i.description.match(/\d+\.\d+/)![0]))),
        recommendedValue: suggestedMaxDepth,
        estimatedImprovement: {
          toolLife: 40,
          quality: 20
        },
        confidence: 0.9
      });

      // Raccomandazione: Suddividi in più passate
      recommendations.push({
        id: uuidv4(),
        type: "strategy",
        description: `Suddividi le lavorazioni profonde in più passate di ${(suggestedMaxDepth / 2).toFixed(2)}-${suggestedMaxDepth.toFixed(2)} mm ciascuna`,
        estimatedImprovement: {
          toolLife: 50,
          quality: 25
        },
        confidence: 0.85
      });
    }

    // Raccomandazioni basate sui problemi di stepover
    if (issuesByType["excessive_stepover"]) {
      const stepoverIssues = issuesByType["excessive_stepover"];

      // Estrai il valore massimo sicuro dal fix suggerito
      const suggestedMaxStepover = stepoverIssues[0].suggestedFix
        ? parseFloat(stepoverIssues[0].suggestedFix.match(/\d+\.\d+/)![0])
        : tool.maxStepover || tool.diameter * 0.4;

      const currentStepover = toolpath.operation.stepover || 0;

      recommendations.push({
        id: uuidv4(),
        type: "stepover",
        description: `Riduci lo stepover a un massimo di ${suggestedMaxStepover.toFixed(2)} mm (${((suggestedMaxStepover / tool.diameter) * 100).toFixed(1)}% del diametro)`,
        currentValue: currentStepover,
        recommendedValue: suggestedMaxStepover,
        estimatedImprovement: {
          toolLife: 30,
          quality: 25
        },
        confidence: 0.85
      });
    }

    // Raccomandazioni basate sui problemi di approccio/ritiro
    if (issuesByType["unoptimized_approach"] || issuesByType["unsafe_entry"]) {
      recommendations.push({
        id: uuidv4(),
        type: "approach",
        description: "Aggiungi approcci graduali (lead-in) ad arco o a spirale per ridurre lo stress dell'utensile",
        estimatedImprovement: {
          toolLife: 20,
          quality: 15
        },
        confidence: 0.8
      });
    }

    if (issuesByType["unoptimized_retract"] || issuesByType["unsafe_exit"]) {
      recommendations.push({
        id: uuidv4(),
        type: "retract",
        description:
          "Ottimizza i movimenti di ritiro riducendo le altezze eccessive e aggiungendo uscite graduali (lead-out)",
        estimatedImprovement: {
          time: 10, // Secondi risparmiati stimati
          toolLife: 10
        },
        confidence: 0.8
      });
    }

    // Raccomandazioni basate sui problemi di movimenti inefficienti
    if (
      issuesByType["inefficient_movement"] ||
      issuesByType["unnecessary_air_cutting"] ||
      issuesByType["long_tool_path"]
    ) {
      recommendations.push({
        id: uuidv4(),
        type: "strategy",
        description:
          "Ottimizza la strategia di percorso eliminando movimenti ridondanti e convertendo tagli aerei in rapidi",
        estimatedImprovement: {
          time: Math.round(
            (issuesByType["inefficient_movement"]?.length || 0) * 2 +
              (issuesByType["unnecessary_air_cutting"]?.length || 0) * 5
          )
        },
        confidence: 0.75
      });
    }

    // Raccomandazione generale per la finitura
    if (toolpath.operation.type.includes("adaptive") || toolpath.operation.type.includes("pocket")) {
      recommendations.push({
        id: uuidv4(),
        type: "strategy",
        description:
          "Considera di aggiungere una passata di finitura con un feed rate ridotto per migliorare la qualità superficiale",
        estimatedImprovement: {
          quality: 30
        },
        confidence: 0.7
      });
    }

    return recommendations;
  }

  /**
   * Calcola un punteggio di efficienza per il percorso utensile
   */
  private calculateEfficiency(toolpath: Toolpath, issues: ToolpathIssue[]): number {
    let score = 100; // Punteggio iniziale

    // Conta i problemi per tipo
    const issuesByType = issues.reduce(
      (acc, issue) => {
        acc[issue.type] = acc[issue.type] || 0;
        acc[issue.type]++;
        return acc;
      },
      {} as Record<string, number>
    );

    // Riduci il punteggio in base ai problemi rilevati
    if (issuesByType["inefficient_movement"]) {
      score -= issuesByType["inefficient_movement"] * 2;
    }

    if (issuesByType["unnecessary_air_cutting"]) {
      score -= issuesByType["unnecessary_air_cutting"] * 3;
    }

    if (issuesByType["unoptimized_retract"]) {
      score -= issuesByType["unoptimized_retract"] * 2;
    }

    if (issuesByType["feed_rate_issue"]) {
      score -= issuesByType["feed_rate_issue"] * 1.5;
    }

    if (issuesByType["long_tool_path"]) {
      score -= issuesByType["long_tool_path"] * 4;
    }

    // Considera la lunghezza totale del percorso
    const points = toolpath.points;
    let totalDistance = 0;
    let cuttingDistance = 0;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      totalDistance += distance;

      if (p2.type !== "rapid" && p1.type !== "rapid") {
        cuttingDistance += distance;
      }
    }

    // Calcola il rapporto tra distanza di taglio e distanza totale
    const cuttingRatio = cuttingDistance / totalDistance;

    // Un rapporto migliore (più taglio, meno rapidi) è più efficiente
    score += cuttingRatio * 10;

    // Limita il punteggio tra 0 e 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calcola un punteggio di qualità prevista per il percorso utensile
   */
  private calculateQuality(toolpath: Toolpath, tool: Tool, issues: ToolpathIssue[], material?: Material): number {
    let score = 100; // Punteggio iniziale

    // Conta i problemi per tipo
    const issuesByType = issues.reduce(
      (acc, issue) => {
        acc[issue.type] = acc[issue.type] || 0;
        acc[issue.type]++;
        return acc;
      },
      {} as Record<string, number>
    );

    // Riduci il punteggio in base ai problemi rilevati
    if (issuesByType["feed_rate_issue"]) {
      score -= issuesByType["feed_rate_issue"] * 3;
    }

    if (issuesByType["excessive_depth"]) {
      score -= issuesByType["excessive_depth"] * 5;
    }

    if (issuesByType["excessive_stepover"]) {
      score -= issuesByType["excessive_stepover"] * 4;
    }

    if (issuesByType["tool_engagement_issue"]) {
      score -= issuesByType["tool_engagement_issue"] * 4;
    }

    if (issuesByType["unsafe_entry"]) {
      score -= issuesByType["unsafe_entry"] * 3;
    }

    if (issuesByType["unsafe_exit"]) {
      score -= issuesByType["unsafe_exit"] * 3;
    }

    if (issuesByType["surface_quality_issue"]) {
      score -= issuesByType["surface_quality_issue"] * 6;
    }

    // Considera il tipo di operazione
    const operationType = toolpath.operation.type;

    // Operazioni di finitura hanno un potenziale di qualità maggiore
    if (operationType.includes("contour") || operationType.includes("parallel")) {
      score += 5;
    }

    // Operazioni di sgrossatura hanno un potenziale di qualità minore
    if (operationType.includes("adaptive") || operationType.includes("pocket")) {
      score -= 5;
    }

    // Considera il materiale se disponibile
    if (material) {
      // Materiali più morbidi sono generalmente più facili da lavorare con buona qualità
      if (material.type === "aluminum" || material.type === "plastic" || material.type === "wood") {
        score += 5;
      }

      // Materiali duri possono essere più problematici
      if (material.type === "stainless_steel" || material.type === "titanium") {
        score -= 5;
      }
    }

    // Limita il punteggio tra 0 e 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analizza uno strumento specifico per un materiale e operazione
   */
  async analyzeTool(tool: Tool, material?: Material, operation?: MachiningOperation): Promise<any> {
    // Implementazione da completare
    // Questo metodo dovrebbe analizzare l'adeguatezza di uno strumento per un materiale specifico
    return {
      toolId: tool.id,
      analysis: {
        suitability: 0.8, // esempio
        recommendations: []
      }
    };
  }

  /**
   * Analizza un materiale per operazioni di lavorazione
   */
  async analyzeMaterial(material: Material, tools?: Tool[], operation?: MachiningOperation): Promise<any> {
    // Implementazione da completare
    // Questo metodo dovrebbe analizzare le caratteristiche di lavorazione di un materiale
    return {
      materialId: material.id,
      analysis: {
        toolRecommendations: [],
        parameterRecommendations: []
      }
    };
  }
}

// Esporta un'istanza singleton
export const camAnalyzer = new CAMAnalyzer();
