// src/lib/ai/cam-new/gcodeOptimizer.ts
import { v4 as uuidv4 } from "uuid";
import { Tool, Material, GCodeAnalysis, GCodeError, GCodeWarning, GCodeOptimization } from "../../../types/CAMTypes";
import { aiAnalytics } from "../ai-new/aiAnalytics";
import { unifiedAIService } from "../unifiedAIService";

/**
 * Classe per l'analisi e l'ottimizzazione di file G-code
 */
export class GCodeOptimizer {
  /**
   * Analizza un file G-code
   */
  async analyzeGCode(gcode: string, tool?: Tool, material?: Material): Promise<GCodeAnalysis> {
    // Traccia l'analisi per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_gcode",
      eventName: "analyze_gcode",
      metadata: {
        gcodeLength: gcode.length,
        toolId: tool?.id,
        materialId: material?.id
      }
    });

    const startTime = Date.now();

    try {
      // Analizza statistiche di base del G-code
      const stats = this.analyzeGCodeStats(gcode);

      // Identifica errori e avvisi
      const { errors, warnings } = this.identifyGCodeIssues(gcode);

      // Calcola le potenziali ottimizzazioni
      const optimization = this.calculateOptimizations(gcode, errors, warnings);

      // Assembla l'analisi completa
      const analysis: GCodeAnalysis = {
        id: uuidv4(),
        ...stats,
        errors,
        warnings,
        optimization
      };

      // Traccia il completamento dell'analisi
      aiAnalytics.trackEvent({
        eventType: "cam_gcode",
        eventName: "gcode_analysis_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          lineCount: stats.lineCount,
          errorsCount: errors.length,
          warningsCount: warnings.length
        }
      });

      return analysis;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "gcode_analysis_error",
        success: false,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      throw error;
    }
  }

  /**
   * Ottimizza un file G-code
   */
  async optimizeGCode(
    gcode: string,
    tool?: Tool,
    material?: Material,
    goals?: ("time" | "quality" | "tool_life" | "cost")[]
  ): Promise<string> {
    // Traccia l'ottimizzazione per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_gcode",
      eventName: "optimize_gcode",
      metadata: {
        gcodeLength: gcode.length,
        toolId: tool?.id,
        materialId: material?.id,
        goals: goals?.join(",")
      }
    });

    const startTime = Date.now();

    try {
      // Prima analizza il G-code
      const analysis = await this.analyzeGCode(gcode, tool, material);

      // Se non ci sono errori o ottimizzazioni possibili, restituisci il G-code originale
      if (analysis.errors.length === 0 && analysis.optimization.recommendations.length === 0) {
        return gcode;
      }

      // Determina le ottimizzazioni da applicare in base agli obiettivi
      const optimizationsToApply = this.determineOptimizations(analysis, goals || ["time"]);

      // Applica le ottimizzazioni
      let optimizedGCode = gcode;

      // Ottimizzazione 1: Rimuovi commenti non necessari
      if (optimizationsToApply.includes("remove_comments")) {
        optimizedGCode = this.removeUnnecessaryComments(optimizedGCode);
      }

      // Ottimizzazione 2: Rimuovi movimenti ridondanti
      if (optimizationsToApply.includes("optimize_movements")) {
        optimizedGCode = this.optimizeMovements(optimizedGCode);
      }

      // Ottimizzazione 3: Ottimizza feed rate
      if (optimizationsToApply.includes("optimize_feedrates")) {
        optimizedGCode = this.optimizeFeedRates(optimizedGCode, goals);
      }

      // Ottimizzazione 4: Ottimizza rapidi
      if (optimizationsToApply.includes("optimize_rapids")) {
        optimizedGCode = this.optimizeRapids(optimizedGCode);
      }

      // Ottimizzazione 5: Correggi errori
      if (optimizationsToApply.includes("fix_errors")) {
        optimizedGCode = this.fixErrors(optimizedGCode, analysis.errors);
      }

      // Ottimizzazione 6: Aggiungi miglioramenti di sicurezza
      if (optimizationsToApply.includes("add_safety")) {
        optimizedGCode = this.addSafetyFeatures(optimizedGCode);
      }

      // Ottimizzazione 7: Formatta il codice
      if (optimizationsToApply.includes("format_code")) {
        optimizedGCode = this.formatGCode(optimizedGCode);
      }

      // Ottimizzazione 8: (opzionale) Usa intelligenza artificiale per ottimizzazioni avanzate
      if (optimizationsToApply.includes("ai_optimization") && unifiedAIService) {
        // Utilizziamo il metodo esistente per un'ottimizzazione più avanzata
        const aiOptimizationResult = await unifiedAIService.optimizeGCode(
          optimizedGCode,
          tool?.type || "generic",
          material?.name || "unknown",
          {
            optimizationGoals: goals,
            toolData: tool,
            materialData: material
          }
        );

        if (aiOptimizationResult.success && aiOptimizationResult.data) {
          optimizedGCode = aiOptimizationResult.data;
        }
      }

      // Traccia il completamento dell'ottimizzazione
      aiAnalytics.trackEvent({
        eventType: "cam_gcode",
        eventName: "gcode_optimization_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          originalSize: gcode.length,
          optimizedSize: optimizedGCode.length,
          reductionPercent: (((gcode.length - optimizedGCode.length) / gcode.length) * 100).toFixed(2),
          optimizationsApplied: optimizationsToApply.join(",")
        }
      });

      return optimizedGCode;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "gcode_optimization_error",
        success: false,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      // In caso di errore, restituisci il G-code originale
      return gcode;
    }
  }

  /**
   * Analizza statistiche di base del G-code
   */
  private analyzeGCodeStats(gcode: string): any {
    // Dividi il G-code in righe
    const lines = gcode.split("\n");

    // Calcola le dimensioni del file
    const fileSize = gcode.length;

    // Conta le righe (escluse quelle vuote)
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const lineCount = nonEmptyLines.length;

    // Conta i comandi per tipo
    const commandCount: Record<string, number> = {};

    for (const line of nonEmptyLines) {
      // Rimuovi eventuali commenti
      const cleanLine = line.split(";")[0].split("(")[0].trim();

      if (cleanLine.length === 0) {
        continue;
      }

      // Estrai il comando principale (G0, G1, M3, ecc.)
      const match = cleanLine.match(/^([GM]\d+)/);

      if (match) {
        const command = match[1];
        commandCount[command] = (commandCount[command] || 0) + 1;
      }
    }

    // Conta i cambi utensile
    const toolChanges = commandCount["T"] || 0;

    // Stima il tempo di lavorazione (tecnica semplificata)
    const estimatedMachiningTime = this.estimateGCodeMachiningTime(lines);

    return {
      fileSize,
      lineCount,
      commandCount,
      estimatedMachiningTime,
      toolChanges
    };
  }

  /**
   * Stima il tempo di lavorazione in secondi
   */
  private estimateGCodeMachiningTime(lines: string[]): number {
    let totalTime = 0;
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let rapidRate = 5000; // mm/min
    let currentFeedRate = 200; // mm/min default
    let isRapid = false;

    for (const line of lines) {
      // Rimuovi eventuali commenti
      const cleanLine = line.split(";")[0].split("(")[0].trim();

      if (cleanLine.length === 0) {
        continue;
      }

      // Controllo per G0 (rapido)
      if (cleanLine.match(/^G0\s/)) {
        isRapid = true;
      }

      // Controllo per G1 (lineare)
      if (cleanLine.match(/^G1\s/)) {
        isRapid = false;
      }

      // Controllo per F (feed rate)
      const feedMatch = cleanLine.match(/F(\d+(\.\d+)?)/);
      if (feedMatch) {
        currentFeedRate = parseFloat(feedMatch[1]);
      }

      // Estrai le coordinate
      let x = currentX;
      let y = currentY;
      let z = currentZ;

      const xMatch = cleanLine.match(/X([+-]?\d+(\.\d+)?)/);
      if (xMatch) {
        x = parseFloat(xMatch[1]);
      }

      const yMatch = cleanLine.match(/Y([+-]?\d+(\.\d+)?)/);
      if (yMatch) {
        y = parseFloat(yMatch[1]);
      }

      const zMatch = cleanLine.match(/Z([+-]?\d+(\.\d+)?)/);
      if (zMatch) {
        z = parseFloat(zMatch[1]);
      }

      // Calcola la distanza
      const distance = Math.sqrt(Math.pow(x - currentX, 2) + Math.pow(y - currentY, 2) + Math.pow(z - currentZ, 2));

      // Aggiorna le coordinate correnti
      currentX = x;
      currentY = y;
      currentZ = z;

      // Calcola il tempo
      if (distance > 0) {
        const feedRate = isRapid ? rapidRate : currentFeedRate;
        const timeMinutes = distance / feedRate;
        totalTime += timeMinutes * 60; // converti in secondi
      }

      // Aggiungi tempo per ritardi (G4)
      const delayMatch = cleanLine.match(/^G4\s+P(\d+(\.\d+)?)/);
      if (delayMatch) {
        totalTime += parseFloat(delayMatch[1]) / 1000; // P è in millisecondi
      }

      // Aggiungi tempo per operazioni speciali
      if (cleanLine.match(/^(M6|T\d+)/)) {
        // Cambio utensile
        totalTime += 10; // 10 secondi per cambio utensile
      }
    }

    // Aggiungi un fattore realistico per accelerazioni, decelerazioni, ecc.
    return totalTime * 1.2;
  }

  /**
   * Identifica problemi nel G-code
   */
  private identifyGCodeIssues(gcode: string): { errors: GCodeError[]; warnings: GCodeWarning[] } {
    const errors: GCodeError[] = [];
    const warnings: GCodeWarning[] = [];

    // Dividi il G-code in righe
    const lines = gcode.split("\n");

    // Pattern per rilevare problemi comuni
    const errorPatterns = [
      {
        regex: /G\d+(\.\d+)?[^\n]*G\d+(\.\d+)?/,
        message: "Più comandi G sulla stessa riga",
        severity: "error" as const,
        fix: "Separare i comandi G su righe diverse"
      },
      {
        regex: /^[^\n]*?[XYZ][^0-9\.\-\s]/,
        message: "Formato di coordinate non valido",
        severity: "error" as const,
        fix: "Correggere il formato delle coordinate (es. X100.0)"
      },
      {
        regex: /G53(?!\s*G0|\s*G1)/,
        message: "G53 deve essere usato con G0 o G1",
        severity: "error" as const,
        fix: "Usare G53 solo con G0 o G1 (es. G53 G0 X0 Y0)"
      },
      {
        regex: /G28[^\n]*[XYZ][^\n]*[XYZ][^\n]*\s*G/,
        message: "G28 con coordinate incomplete seguito da altro comando sulla stessa riga",
        severity: "error" as const,
        fix: "Separare G28 su una riga a sé stante o specificare tutte le coordinate necessarie"
      }
    ];

    const warningPatterns = [
      {
        regex: /^[^\n]*F\d+(\.\d+)?[^\n]*F\d+(\.\d+)?/,
        message: "Feed rate specificato più volte sulla stessa riga",
        fix: "Rimuovere i feed rate ridondanti"
      },
      {
        regex: /G1[^\n]*(?!F\d+)/,
        message: "Movimento lineare senza specificare il feed rate",
        fix: "Aggiungere un feed rate (F) al comando G1"
      },
      {
        regex: /S\d+(\.\d+)?[^\n]*S\d+(\.\d+)?/,
        message: "Velocità mandrino specificata più volte sulla stessa riga",
        fix: "Rimuovere le velocità mandrino ridondanti"
      },
      {
        regex: /G0[^\n]*F\d+(\.\d+)?/,
        message: "Feed rate specificato per movimento rapido",
        fix: "Rimuovere il feed rate dai comandi G0"
      },
      {
        regex: /G4\s+[^P]/,
        message: "Comando di pausa (G4) senza parametro P",
        fix: "Aggiungere il parametro P (in millisecondi) al comando G4"
      }
    ];

    // Verifica ogni riga
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Salta le righe vuote o i commenti
      if (line.length === 0 || line.startsWith(";") || line.startsWith("(")) {
        continue;
      }

      // Verifica gli errori
      for (const pattern of errorPatterns) {
        if (pattern.regex.test(line)) {
          errors.push({
            id: uuidv4(),
            lineNumber: i + 1,
            command: line,
            description: pattern.message,
            severity: pattern.severity,
            suggestedFix: pattern.fix
          });
        }
      }

      // Verifica gli avvisi
      for (const pattern of warningPatterns) {
        if (pattern.regex.test(line)) {
          warnings.push({
            id: uuidv4(),
            lineNumber: i + 1,
            command: line,
            description: pattern.message,
            suggestedFix: pattern.fix
          });
        }
      }

      // Verifica se una riga contiene M6 senza un precedente T
      if (line.includes("M6") && i > 0) {
        let hasPreviousT = false;
        for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
          if (lines[j].trim().match(/^T\d+/)) {
            hasPreviousT = true;
            break;
          }
        }

        if (!hasPreviousT) {
          warnings.push({
            id: uuidv4(),
            lineNumber: i + 1,
            command: line,
            description: "Cambio utensile (M6) senza specificare l'utensile (T)",
            suggestedFix: "Specificare l'utensile prima del cambio utensile (es. T1 M6)"
          });
        }
      }

      // Verifica movimenti rapidi vicino a Z=0
      if (line.match(/G0[^\n]*Z-?0?\.?0*[^\d]/)) {
        warnings.push({
          id: uuidv4(),
          lineNumber: i + 1,
          command: line,
          description: "Movimento rapido a Z zero o vicino a zero potrebbe causare collisioni",
          suggestedFix: "Considerare un movimento di sicurezza o usare G1 per avvicinamenti al pezzo"
        });
      }
    }

    // Verifica di errori di sequenza
    this.checkSequenceErrors(lines, errors, warnings);

    return { errors, warnings };
  }

  /**
   * Verifica errori di sequenza nel G-code
   */
  private checkSequenceErrors(lines: string[], errors: GCodeError[], warnings: GCodeWarning[]): void {
    let spindleOn = false;
    let coolantOn = false;
    let zPosition = 100; // Valore arbitrario alto

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Salta le righe vuote o i commenti
      if (line.length === 0 || line.startsWith(";") || line.startsWith("(")) {
        continue;
      }

      // Traccia stato del mandrino
      if (line.match(/^M0*3/)) {
        spindleOn = true;
      } else if (line.match(/^M0*5/)) {
        spindleOn = false;
      }

      // Traccia stato del refrigerante
      if (line.match(/^M0*[78]/)) {
        coolantOn = true;
      } else if (line.match(/^M0*9/)) {
        coolantOn = false;
      }

      // Traccia posizione Z
      const zMatch = line.match(/Z([+-]?\d+(\.\d+)?)/);
      if (zMatch) {
        zPosition = parseFloat(zMatch[1]);
      }

      // Verifica movimento di taglio senza mandrino acceso
      if (!spindleOn && line.match(/^G0*1[^\n]*Z-/) && zPosition <= 0) {
        errors.push({
          id: uuidv4(),
          lineNumber: i + 1,
          command: line,
          description: "Movimento di taglio con mandrino spento",
          severity: "error",
          suggestedFix: "Accendere il mandrino (M3 SnnnnS) prima di questo movimento"
        });
      }

      // Verifica movimento di taglio senza refrigerante
      if (!coolantOn && line.match(/^G0*1[^\n]*Z-/) && zPosition <= 0) {
        warnings.push({
          id: uuidv4(),
          lineNumber: i + 1,
          command: line,
          description: "Movimento di taglio senza refrigerante",
          suggestedFix: "Considerare l'attivazione del refrigerante (M7/M8) prima di questo movimento"
        });
      }

      // Verifica fine programma con mandrino o refrigerante ancora attivi
      if (line.match(/^M0*30/) || line.match(/^M0*2/)) {
        if (spindleOn) {
          warnings.push({
            id: uuidv4(),
            lineNumber: i + 1,
            command: line,
            description: "Fine programma con mandrino ancora acceso",
            suggestedFix: "Spegnere il mandrino (M5) prima di terminare il programma"
          });
        }

        if (coolantOn) {
          warnings.push({
            id: uuidv4(),
            lineNumber: i + 1,
            command: line,
            description: "Fine programma con refrigerante ancora attivo",
            suggestedFix: "Disattivare il refrigerante (M9) prima di terminare il programma"
          });
        }
      }
    }
  }

  /**
   * Calcola le potenziali ottimizzazioni per il G-code
   */
  private calculateOptimizations(gcode: string, errors: GCodeError[], warnings: GCodeWarning[]): GCodeOptimization {
    // Conta le linee originali
    const originalLines = gcode.split("\n").filter(line => line.trim().length > 0);
    const originalSize = gcode.length;

    // Simula le ottimizzazioni per stimare i risultati
    const optimizedGCode = this.simulateOptimizations(gcode);
    const optimizedLines = optimizedGCode.split("\n").filter(line => line.trim().length > 0);
    const optimizedSize = optimizedGCode.length;

    // Conta le ottimizzazioni specifiche
    const feedRateOptimizations = this.countPotentialFeedRateOptimizations(gcode);
    const unusedCodesRemoved = this.countRemovableUnusedCodes(gcode);
    const redundantMovesOptimized = this.countRedundantMoves(gcode);

    // Stima il risparmio di tempo
    const estimatedOriginalTime = this.estimateGCodeMachiningTime(originalLines);
    const estimatedOptimizedTime = this.estimateGCodeMachiningTime(optimizedLines);
    const timeSavings = Math.max(0, estimatedOriginalTime - estimatedOptimizedTime);

    // Genera raccomandazioni
    const recommendations = this.generateOptimizationRecommendations(gcode, errors, warnings);

    return {
      optimizedSize,
      optimizedLineCount: optimizedLines.length,
      timeSavings,
      feedRateOptimizations,
      unusedCodesRemoved,
      redundantMovesOptimized,
      recommendations
    };
  }

  /**
   * Simula le ottimizzazioni sul G-code senza applicarle realmente
   */
  private simulateOptimizations(gcode: string): string {
    // Rimuovi commenti
    let result = gcode.replace(/;.*$/gm, "").replace(/\([^)]*\)/g, "");

    // Rimuovi linee vuote
    result = result
      .split("\n")
      .filter(line => line.trim().length > 0)
      .join("\n");

    // Rimuovi feed rate ridondanti
    const lines = result.split("\n");
    let lastFeedRate = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const feedMatch = line.match(/F(\d+(\.\d+)?)/);

      if (feedMatch) {
        const currentFeedRate = feedMatch[1];

        if (currentFeedRate === lastFeedRate) {
          // Rimuovi il feed rate ridondante
          lines[i] = line.replace(/F\d+(\.\d+)?/, "");
        } else {
          lastFeedRate = currentFeedRate;
        }
      }
    }

    result = lines.join("\n");

    // Rimuovi feed rate dai movimenti rapidi
    result = result.replace(/G0[^\n]*?F\d+(\.\d+)?/g, match => {
      return match.replace(/F\d+(\.\d+)?/, "");
    });

    // Altre ottimizzazioni potrebbero essere simulate qui

    return result;
  }

  /**
   * Conta le potenziali ottimizzazioni dei feed rate
   */
  private countPotentialFeedRateOptimizations(gcode: string): number {
    let count = 0;
    const lines = gcode.split("\n");
    let lastFeedRate = null;

    for (const line of lines) {
      const feedMatch = line.match(/F(\d+(\.\d+)?)/);

      if (feedMatch) {
        const currentFeedRate = feedMatch[1];

        if (currentFeedRate === lastFeedRate) {
          // Feed rate ridondante
          count++;
        } else {
          lastFeedRate = currentFeedRate;
        }
      }

      // Feed rate nei rapidi
      if (line.match(/G0[^\n]*?F\d+(\.\d+)?/)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Conta i codici non utilizzati che possono essere rimossi
   */
  private countRemovableUnusedCodes(gcode: string): number {
    let count = 0;

    // Commenti
    const commentMatches = gcode.match(/;.*$/gm) || [];
    count += commentMatches.length;

    const parenthesesComments = gcode.match(/\([^)]*\)/g) || [];
    count += parenthesesComments.length;

    // Linee vuote
    const emptyLines = gcode.split("\n").filter(line => line.trim().length === 0).length;
    count += emptyLines;

    return count;
  }

  /**
   * Conta i movimenti ridondanti nel G-code
   */
  private countRedundantMoves(gcode: string): number {
    let count = 0;
    const lines = gcode.split("\n");
    let lastX = null;
    let lastY = null;
    let lastZ = null;

    for (const line of lines) {
      // Estrai le coordinate
      const xMatch = line.match(/X([+-]?\d+(\.\d+)?)/);
      const yMatch = line.match(/Y([+-]?\d+(\.\d+)?)/);
      const zMatch = line.match(/Z([+-]?\d+(\.\d+)?)/);

      // Verifica movimenti ridondanti (stessa posizione)
      if (xMatch && yMatch && zMatch) {
        const x = xMatch[1];
        const y = yMatch[1];
        const z = zMatch[1];

        if (x === lastX && y === lastY && z === lastZ) {
          count++;
        }

        lastX = x;
        lastY = y;
        lastZ = z;
      }
    }

    return count;
  }

  /**
   * Genera raccomandazioni per ottimizzare il G-code
   */
  private generateOptimizationRecommendations(gcode: string, errors: GCodeError[], warnings: GCodeWarning[]): any[] {
    const recommendations: any[] = [];

    // Raccomandazione: Rimuovi commenti e linee vuote
    if (this.countRemovableUnusedCodes(gcode) > 0) {
      recommendations.push({
        description: "Rimuovere commenti e linee vuote per ridurre la dimensione del file",
        type: "formatting",
        benefit: "Riduzione dimensione del file",
        confidence: 1.0
      });
    }

    // Raccomandazione: Rimuovi feed rate ridondanti
    if (this.countPotentialFeedRateOptimizations(gcode) > 0) {
      recommendations.push({
        description: "Ottimizzare i feed rate rimuovendo valori ridondanti e valori nei movimenti rapidi",
        type: "movement",
        benefit: "Miglioramento leggibilità e prestazioni",
        confidence: 0.9
      });
    }

    // Raccomandazione: Ottimizza movimenti rapidi
    const rapidCount = (gcode.match(/G0/g) || []).length;
    if (rapidCount > 10) {
      recommendations.push({
        description: "Ottimizzare i movimenti rapidi per minimizzare i tempi di ciclo",
        type: "movement",
        benefit: "Riduzione tempo di lavorazione",
        confidence: 0.8
      });
    }

    // Raccomandazione: Aggiungi funzionalità di sicurezza
    if (
      warnings.some(
        w =>
          w.description.includes("mandrino") ||
          w.description.includes("refrigerante") ||
          w.description.includes("collisioni")
      )
    ) {
      recommendations.push({
        description: "Aggiungere funzionalità di sicurezza come controlli di avvio/arresto mandrino e refrigerante",
        type: "settings",
        benefit: "Miglioramento sicurezza e affidabilità",
        confidence: 0.9
      });
    }

    // Raccomandazione: Correggere errori
    if (errors.length > 0) {
      recommendations.push({
        description: `Correggere ${errors.length} errori nel G-code che potrebbero causare problemi di esecuzione`,
        type: "formatting",
        benefit: "Prevenzione errori e arresti macchina",
        confidence: 1.0
      });
    }

    // Raccomandazione: Ottimizza feed rate per materiale specifico
    recommendations.push({
      description:
        "Ottimizzare i feed rate in base al materiale e all'utensile per migliorare qualità e durata utensile",
      type: "settings",
      benefit: "Miglioramento finitura superficiale e durata utensile",
      confidence: 0.7
    });

    // Raccomandazione: Usa costanti invece di ripetere valori
    const usesVariables = gcode.includes("#");
    if (!usesVariables && gcode.length > 1000) {
      recommendations.push({
        description:
          "Utilizzare variabili per definire parametri comuni come altezze di sicurezza, feed rate e velocità mandrino",
        type: "formatting",
        benefit: "Maggiore leggibilità e facilità di modifica",
        confidence: 0.7
      });
    }

    // Raccomandazione: Formatta il codice per leggibilità
    recommendations.push({
      description:
        "Formattare il G-code con spaziature e raggruppamenti logici per migliorare la leggibilità e manutenibilità",
      type: "formatting",
      benefit: "Miglioramento leggibilità e manutenibilità",
      confidence: 0.8
    });

    return recommendations;
  }

  /**
   * Determina le ottimizzazioni da applicare in base agli obiettivi
   */
  private determineOptimizations(
    analysis: GCodeAnalysis,
    goals: ("time" | "quality" | "tool_life" | "cost")[]
  ): string[] {
    const optimizations: string[] = [];

    // Ottimizzazioni base sempre applicate
    optimizations.push("remove_comments");
    optimizations.push("format_code");

    // Ottimizzazioni per il tempo
    if (goals.includes("time")) {
      optimizations.push("optimize_movements");
      optimizations.push("optimize_rapids");
    }

    // Ottimizzazioni per la qualità
    if (goals.includes("quality")) {
      optimizations.push("optimize_feedrates");
      optimizations.push("add_safety");
    }

    // Ottimizzazioni per la durata utensile
    if (goals.includes("tool_life")) {
      optimizations.push("optimize_feedrates");
      optimizations.push("add_safety");
    }

    // Ottimizzazioni per il costo
    if (goals.includes("cost")) {
      optimizations.push("optimize_movements");
      optimizations.push("optimize_feedrates");
      optimizations.push("optimize_rapids");
    }

    // Se ci sono errori, correggerli sempre
    if (analysis.errors.length > 0) {
      optimizations.push("fix_errors");
    }

    // Usa l'AI per ottimizzazioni avanzate se ci sono molti problemi
    if (
      analysis.errors.length > 3 ||
      analysis.warnings.length > 5 ||
      analysis.optimization.recommendations.length > 3
    ) {
      optimizations.push("ai_optimization");
    }

    return Array.from(new Set(optimizations)); // Rimuovi duplicati
  }

  /**
   * Rimuove commenti non necessari dal G-code
   */
  private removeUnnecessaryComments(gcode: string): string {
    // Rimuovi commenti con punto e virgola
    let result = gcode.replace(/;.*$/gm, "");

    // Rimuovi commenti tra parentesi
    result = result.replace(/\([^)]*\)/g, "");

    // Rimuovi linee vuote
    result = result
      .split("\n")
      .filter(line => line.trim().length > 0)
      .join("\n");

    return result;
  }

  /**
   * Ottimizza i movimenti nel G-code
   */
  private optimizeMovements(gcode: string): string {
    const lines = gcode.split("\n");
    const result: string[] = [];

    let lastX: string | null = null;
    let lastY: string | null = null;
    let lastZ: string | null = null;
    let lastF: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Salta le righe vuote
      if (line.length === 0) {
        continue;
      }

      // Estrai le coordinate e il feed rate
      const xMatch = line.match(/X([+-]?\d+(\.\d+)?)/);
      const yMatch = line.match(/Y([+-]?\d+(\.\d+)?)/);
      const zMatch = line.match(/Z([+-]?\d+(\.\d+)?)/);
      const fMatch = line.match(/F(\d+(\.\d+)?)/);

      // Aggiorna le coordinate correnti
      const currentX = xMatch ? xMatch[1] : null;
      const currentY = yMatch ? yMatch[1] : null;
      const currentZ = zMatch ? zMatch[1] : null;
      const currentF = fMatch ? fMatch[1] : null;

      // Verifica se è un movimento ridondante (stessa posizione)
      if (currentX === lastX && currentY === lastY && currentZ === lastZ) {
        // Se è solo un cambio di feed rate, salvalo
        if (currentF !== lastF && currentF !== null) {
          result.push(`F${currentF}`);
          lastF = currentF;
        }
        // Altrimenti, salta la riga
        continue;
      }

      // Rimuovi il feed rate se è lo stesso dell'ultimo
      if (currentF !== null && currentF === lastF) {
        const updatedLine = line.replace(/F\d+(\.\d+)?/, "");
        result.push(updatedLine);
      } else {
        result.push(line);
      }

      // Aggiorna le ultime coordinate
      if (currentX !== null) lastX = currentX;
      if (currentY !== null) lastY = currentY;
      if (currentZ !== null) lastZ = currentZ;
      if (currentF !== null) lastF = currentF;
    }

    return result.join("\n");
  }

  /**
   * Ottimizza i feed rate nel G-code
   */
  private optimizeFeedRates(gcode: string, goals?: ("time" | "quality" | "tool_life" | "cost")[]): string {
    const lines = gcode.split("\n");
    const result: string[] = [];

    let lastFeedRate: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Salta le righe vuote
      if (line.length === 0) {
        continue;
      }

      // Rimuovi feed rate dai movimenti rapidi
      if (line.match(/G0[^\n]*?F\d+(\.\d+)?/)) {
        line = line.replace(/F\d+(\.\d+)?/, "");
      }

      // Estrai il feed rate
      const feedMatch = line.match(/F(\d+(\.\d+)?)/);

      if (feedMatch) {
        const currentFeedRate = feedMatch[1];

        // Rimuovi feed rate ridondanti
        if (currentFeedRate === lastFeedRate) {
          line = line.replace(/F\d+(\.\d+)?/, "");
        } else {
          lastFeedRate = currentFeedRate;

          // Ottimizza feed rate in base agli obiettivi
          if (goals) {
            // Se l'obiettivo è la qualità o la durata utensile, riduci feed rate aggressivi
            if ((goals.includes("quality") || goals.includes("tool_life")) && parseFloat(currentFeedRate) > 1000) {
              const adjustedFeedRate = Math.round(parseFloat(currentFeedRate) * 0.85);
              line = line.replace(/F\d+(\.\d+)?/, `F${adjustedFeedRate}`);
            }

            // Se l'obiettivo è il tempo, aumenta feed rate bassi
            if (goals.includes("time") && parseFloat(currentFeedRate) < 200) {
              const adjustedFeedRate = Math.round(parseFloat(currentFeedRate) * 1.15);
              line = line.replace(/F\d+(\.\d+)?/, `F${adjustedFeedRate}`);
            }
          }
        }
      }

      result.push(line);
    }

    return result.join("\n");
  }

  /**
   * Ottimizza i movimenti rapidi nel G-code
   */
  private optimizeRapids(gcode: string): string {
    const lines = gcode.split("\n");
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Salta le righe vuote
      if (line.length === 0) {
        continue;
      }

      // Se è un movimento rapido e il prossimo anche, valuta l'ottimizzazione
      if (line.startsWith("G0") && i < lines.length - 1 && lines[i + 1].trim().startsWith("G0")) {
        const currentLine = line;
        const nextLine = lines[i + 1].trim();

        // Estrai le coordinate
        const currXMatch = currentLine.match(/X([+-]?\d+(\.\d+)?)/);
        const currYMatch = currentLine.match(/Y([+-]?\d+(\.\d+)?)/);
        const currZMatch = currentLine.match(/Z([+-]?\d+(\.\d+)?)/);

        const nextXMatch = nextLine.match(/X([+-]?\d+(\.\d+)?)/);
        const nextYMatch = nextLine.match(/Y([+-]?\d+(\.\d+)?)/);
        const nextZMatch = nextLine.match(/Z([+-]?\d+(\.\d+)?)/);

        // Se il prossimo movimento è solo Z, combinali
        if (nextZMatch && !nextXMatch && !nextYMatch && currZMatch) {
          // Crea un movimento rapido combinato
          let combinedMove = "G0";

          if (currXMatch) combinedMove += ` ${currXMatch[0]}`;
          if (currYMatch) combinedMove += ` ${currYMatch[0]}`;
          combinedMove += ` Z${nextZMatch[1]}`;

          result.push(combinedMove);
          i++; // Salta la prossima riga
          continue;
        }
      }

      result.push(line);
    }

    return result.join("\n");
  }

  /**
   * Corregge gli errori nel G-code
   */
  private fixErrors(gcode: string, errors: GCodeError[]): string {
    const lines = gcode.split("\n");

    // Ordina gli errori dalla riga più alta alla più bassa per non alterare gli indici di riga
    const sortedErrors = [...errors].sort((a, b) => b.lineNumber - a.lineNumber);

    // Applica le correzioni
    for (const error of sortedErrors) {
      const lineIndex = error.lineNumber - 1;

      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];

        // Applica le correzioni in base al tipo di errore
        switch (true) {
          // Più comandi G sulla stessa riga
          case error.description.includes("Più comandi G sulla stessa riga"):
            {
              const gCodes = line.match(/G\d+(\.\d+)?/g) || [];
              if (gCodes.length > 1) {
                // Dividi in più righe
                let remainingLine = line;
                const newLines: string[] = [];

                for (const gCode of gCodes) {
                  const parts = remainingLine.split(gCode);
                  if (parts.length > 1) {
                    // Crea una nuova riga con il G-code corrente
                    const beforePart = parts[0];
                    remainingLine = parts.slice(1).join(gCode);

                    const newLine = `${beforePart}${gCode}${remainingLine.split(/G\d+(\.\d+)?/)[0]}`;
                    newLines.push(newLine.trim());

                    remainingLine = remainingLine.replace(/^[^G]*/, "");
                  }
                }

                if (remainingLine.trim().length > 0) {
                  newLines.push(remainingLine.trim());
                }

                // Sostituisci la riga originale con le nuove righe
                lines.splice(lineIndex, 1, ...newLines);
              }
            }
            break;

          // Formato di coordinate non valido
          case error.description.includes("Formato di coordinate non valido"):
            {
              // Correggi il formato delle coordinate
              lines[lineIndex] = line.replace(/([XYZ])([^0-9\.\-\s])/, "$1 $2");
            }
            break;

          // G53 deve essere usato con G0 o G1
          case error.description.includes("G53 deve essere usato con G0 o G1"):
            {
              // Aggiungi G0 se manca
              if (!line.match(/G53\s+(G0|G1)/)) {
                lines[lineIndex] = line.replace(/G53/, "G53 G0");
              }
            }
            break;

          // G28 con coordinate incomplete
          case error.description.includes("G28 con coordinate incomplete"):
            {
              // Separa G28 su una riga a sé stante
              const parts = line.split(/G28[^\n]*?([XYZ][^\n]*[XYZ][^\n]*)\s*G/);
              if (parts.length > 1) {
                const g28Part = `G28 ${parts[1]}`;
                const remainingPart = `G${parts[2]}`;

                lines[lineIndex] = g28Part;
                lines.splice(lineIndex + 1, 0, remainingPart);
              }
            }
            break;

          // Movimento di taglio con mandrino spento
          case error.description.includes("Movimento di taglio con mandrino spento"):
            {
              // Aggiungi l'accensione del mandrino prima
              lines.splice(lineIndex, 0, "M3 S1000 ; Auto-corrected - spindle on");
            }
            break;
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Aggiunge funzionalità di sicurezza al G-code
   */
  private addSafetyFeatures(gcode: string): string {
    const lines = gcode.split("\n");
    const result: string[] = [];

    // Aggiungi un preambolo di sicurezza all'inizio
    result.push("; Safety features added by GCode Optimizer");
    result.push("G21 ; Set units to mm");
    result.push("G90 ; Set absolute positioning");
    result.push("G17 ; Set XY plane");
    result.push("G54 ; Use work offset 1");
    result.push("");

    // Verifica se il programma contiene già inizializzazioni di mandrino e refrigerante
    const hasSpindleOn = gcode.match(/M0*3\s/);
    const hasCoolantOn = gcode.match(/M0*[78]\s/);
    const hasSpindleOff = gcode.match(/M0*5\s/);
    const hasCoolantOff = gcode.match(/M0*9\s/);
    const hasReturnToSafeZ = gcode.match(/G(0|00)\s+Z[1-9]\d*/);
    const hasEndProgram = gcode.match(/M0*(2|30)/);

    // Copia il resto del programma
    let addedSafetyHeader = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Salta le righe vuote e i commenti
      if (line.length === 0 || line.startsWith(";") || line.startsWith("(")) {
        result.push(line);
        continue;
      }

      // Aggiungi inizializzazioni di sicurezza se necessario
      if (!addedSafetyHeader && !line.startsWith("G")) {
        addedSafetyHeader = true;

        // Aggiungi posizionamento di sicurezza se non presente
        result.push("G0 Z10 ; Move to safe Z height");

        // Aggiungi inizializzazione del mandrino se non presente
        if (!hasSpindleOn) {
          result.push("M3 S1000 ; Turn on spindle at safe RPM");
        }

        // Aggiungi inizializzazione del refrigerante se non presente
        if (!hasCoolantOn) {
          result.push("M8 ; Turn on coolant");
        }

        result.push("");
      }

      result.push(line);
    }

    // Aggiungi sequenza di fine programma se necessario
    if (!hasReturnToSafeZ) {
      result.push("");
      result.push("G0 Z10 ; Return to safe Z height");
    }

    if (!hasSpindleOff) {
      result.push("M5 ; Turn off spindle");
    }

    if (!hasCoolantOff) {
      result.push("M9 ; Turn off coolant");
    }

    if (!hasEndProgram) {
      result.push("M30 ; End program and rewind");
    }

    return result.join("\n");
  }

  /**
   * Formatta il G-code per migliorare la leggibilità
   */
  private formatGCode(gcode: string): string {
    const lines = gcode.split("\n");
    const result: string[] = [];

    let inComment = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Rimuovi spazi in eccesso
      line = line.trim();

      // Salta le righe vuote
      if (line.length === 0) {
        result.push("");
        continue;
      }

      // Gestisci i commenti
      if (line.startsWith(";")) {
        // Se è un commento di sezione (tutto maiuscolo o inizia con ===)
        if (line.toUpperCase() === line || line.match(/^;\s*={3,}/)) {
          // Aggiungi una riga vuota prima dei commenti di sezione
          if (i > 0 && result[result.length - 1] !== "") {
            result.push("");
          }
          result.push(line);
          result.push("");
          inComment = true;
        } else {
          // Commento normale
          result.push(line);
          inComment = true;
        }
        continue;
      } else {
        // Se stiamo uscendo da un blocco di commenti, aggiungi una riga vuota
        if (inComment) {
          result.push("");
          inComment = false;
        }
      }

      // Formatta il G-code
      let formattedLine = line;

      // Aggiungi spazi dopo G e M
      formattedLine = formattedLine.replace(/([GM])(\d+(\.\d+)?)/g, "$1$2 ");

      // Aggiungi spazi tra i parametri
      formattedLine = formattedLine.replace(/([XYZIJKFSP])([+-]?\d+(\.\d+)?)/g, "$1$2 ");

      // Rimuovi spazi in eccesso
      formattedLine = formattedLine.replace(/\s+/g, " ").trim();

      // Raggruppa i comandi logicamente
      // Nuova sezione per cambio utensile
      if (formattedLine.match(/^T\d+/) || formattedLine.match(/^M0*6/)) {
        if (i > 0 && result[result.length - 1] !== "") {
          result.push("");
        }
        result.push(formattedLine);
        continue;
      }

      // Nuova sezione per nuove operazioni (cambio da G0 a G1 o viceversa)
      if (
        i > 0 &&
        ((formattedLine.match(/^G0 /) && lines[i - 1].match(/^G1 /)) ||
          (formattedLine.match(/^G1 /) && lines[i - 1].match(/^G0 /)))
      ) {
        if (result[result.length - 1] !== "") {
          result.push("");
        }
      }

      result.push(formattedLine);
    }

    return result.join("\n");
  }
}

// Esporta un'istanza singleton
export const gcodeOptimizer = new GCodeOptimizer();
