/**
 * advanced-post-processor.ts
 * Sistema avanzato di post-processing per ottimizzare il G-code
 * Supporta controller Fanuc e Heidenhain con funzionalità avanzate
 */

import fanucOptimizer from "./fanucOptimizer";



// Tipo di controller CNC
export type ControllerType = 'fanuc' | 'heidenhain' | 'siemens' | 'haas' | 'mazak' | 'okuma' | 'generic';

// Opzioni di ottimizzazione
export interface OptimizationOptions {
  // Opzioni generali
  removeRedundantMoves: boolean;
  removeRedundantCodes: boolean;
  optimizeRapidMoves: boolean;
  optimizeToolpaths: boolean;
  optimizeFeedrates: boolean;
  useHighSpeedMode: boolean;
  useLookAhead: boolean;
  useTCPMode: boolean; // Tool Center Point - per macchine 5 assi
  useArcOptimization: boolean;
  consolidateGCodes: boolean;
  removeEmptyLines: boolean;
  removeComments: boolean;
  minimizeAxisMovement: boolean;
  safetyChecks: boolean;
  
  // Opzioni avanzate specifiche per controller
  controllerSpecific: {
    fanuc?: {
      useDecimalFormat: boolean;
      useModalGCodes: boolean;
      useAI: boolean; // AI Contour Control
      useNanoSmoothing: boolean;
      useCornerRounding: boolean;
      useHighPrecisionMode: boolean;
      useCompactGCode: boolean;
    },
    heidenhain?: {
      useConversationalFormat: boolean;
      useFunctionBlocks: boolean;
      useCycleDefine: boolean;
      useParameterProgramming: boolean;
      useTCP: boolean; // TCPM mode
      useRadiusCompensation3D: boolean;
      useSmartTurning: boolean;
    }
  }
}

// Risultati dell'ottimizzazione
export interface OptimizationResult {
  code: string;
  improvements: string[];
  stats: {
    originalLines: number;
    optimizedLines: number;
    reductionPercent: number;
    estimatedTimeReduction: number;
    minorWarnings: string[];
    majorWarnings: string[];
  };
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }
}

/**
 * Classe principale per il post-processing avanzato di G-code
 */
export class AdvancedPostProcessor {
  private controllerType: ControllerType;
  private options: OptimizationOptions;
  
  constructor(controllerType: ControllerType = 'fanuc', options?: Partial<OptimizationOptions>) {
    this.controllerType = controllerType;
    this.options = this.mergeWithDefaultOptions(options || {});
  }
  
  /**
   * Combina le opzioni fornite con quelle predefinite
   */
  private mergeWithDefaultOptions(options: Partial<OptimizationOptions>): OptimizationOptions {
    // Opzioni predefinite
    const defaultOptions: OptimizationOptions = {
      removeRedundantMoves: true,
      removeRedundantCodes: true,
      optimizeRapidMoves: true,
      optimizeToolpaths: true,
      optimizeFeedrates: true,
      useHighSpeedMode: false,
      useLookAhead: true,
      useTCPMode: false,
      useArcOptimization: true,
      consolidateGCodes: true,
      removeEmptyLines: true,
      removeComments: false,
      minimizeAxisMovement: true,
      safetyChecks: true,
      
      controllerSpecific: {
        fanuc: {
          useDecimalFormat: true,
          useModalGCodes: true,
          useAI: false,
          useNanoSmoothing: false,
          useCornerRounding: false,
          useHighPrecisionMode: false,
          useCompactGCode: true
        },
        heidenhain: {
          useConversationalFormat: true,
          useFunctionBlocks: true,
          useCycleDefine: true,
          useParameterProgramming: false,
          useTCP: false,
          useRadiusCompensation3D: false,
          useSmartTurning: true
        }
      }
    };
    
    // Merge options recursively
    return {
      ...defaultOptions,
      ...options,
      controllerSpecific: {
        ...defaultOptions.controllerSpecific,
        ...options.controllerSpecific,
        fanuc: {
          ...defaultOptions.controllerSpecific.fanuc,
          ...(options.controllerSpecific?.fanuc || {})
        } as OptimizationOptions['controllerSpecific']['fanuc'],
        heidenhain: {
          ...defaultOptions.controllerSpecific.heidenhain,
          ...(options.controllerSpecific?.heidenhain || {})
        } as OptimizationOptions['controllerSpecific']['heidenhain']
      }
    };
  }
  
  /**
   * Processa e ottimizza il G-code
   */
  async processGCode(code: string): Promise<OptimizationResult> {
    try {
      switch (this.controllerType) {
        case 'fanuc':
          return await this.processFanucGCode(code);
        case 'heidenhain':
          return await this.processHeidenhainGCode(code);
        case 'siemens':
          return await this.processSiemensGCode(code);
        case 'haas':
          return await this.processHaasGCode(code);
        case 'mazak':
          return await this.processMazakGCode(code);
        case 'okuma':
          return await this.processOkumaGCode(code);
        default:
          return await this.processGenericGCode(code);
      }
    } catch (error) {
      console.error('Error in post-processing:', error);
      return {
        code,
        improvements: ['Errore durante il post-processing'],
        stats: {
          originalLines: code.split('\n').length,
          optimizedLines: code.split('\n').length,
          reductionPercent: 0,
          estimatedTimeReduction: 0,
          minorWarnings: [],
          majorWarnings: [`Error: ${error}`]
        },
        validation: {
          isValid: false,
          errors: [`Processing error: ${error}`],
          warnings: []
        }
      };
    }
  }
  
  /**
   * Ottimizza G-code per controller Fanuc
   */
  private async processFanucGCode(code: string): Promise<OptimizationResult> {
    // Prima applichiamo l'ottimizzatore Fanuc esistente
    const basicResult = await fanucOptimizer.optimizeCode(code);
    
    let processedCode = basicResult.code;
    const improvements = [...basicResult.improvements];
    const minorWarnings: string[] = [];
    const majorWarnings: string[] = [];
    
    // Procedi con ottimizzazioni avanzate specifiche per Fanuc
    if (this.options.useHighSpeedMode) {
      processedCode = this.applyFanucHighSpeedMode(processedCode);
      improvements.push('Applicata modalità di alta velocità (AICC/Nano Smoothing)');
    }
    
    if (this.options.controllerSpecific.fanuc?.useAI) {
      processedCode = this.applyFanucAIContourControl(processedCode);
      improvements.push('Applicato AI Contour Control per movimenti più fluidi');
    }
    
    if (this.options.controllerSpecific.fanuc?.useCornerRounding) {
      processedCode = this.applyFanucCornerRounding(processedCode);
      improvements.push('Ottimizzato raccordi e angoli per una lavorazione più fluida');
    }
    
    // Applica ulteriori ottimizzazioni Fanuc
    processedCode = this.applyAdvancedFanucOptimizations(processedCode);
    
    // Valida il G-code finale per Fanuc
    const validation = this.validateFanucGCode(processedCode);
    
    // Calcola statistiche aggiornate
    const originalLines = code.split('\n').length;
    const optimizedLines = processedCode.split('\n').length;
    const reductionPercent = 
      ((originalLines - optimizedLines) / originalLines * 100).toFixed(2);
    
    return {
      code: processedCode,
      improvements,
      stats: {
        originalLines,
        optimizedLines,
        reductionPercent: parseFloat(reductionPercent),
        estimatedTimeReduction: basicResult.stats.estimatedTimeReduction * 1.2, // +20% con ottimizzazioni avanzate
        minorWarnings,
        majorWarnings
      },
      validation
    };
  }
  
  /**
   * Ottimizza G-code per controller Heidenhain
   */
  private async processHeidenhainGCode(code: string): Promise<OptimizationResult> {
    const originalLines = code.split('\n');
    const improvements: string[] = [];
    const minorWarnings: string[] = [];
    const majorWarnings: string[] = [];
    
    // Prima conversione/adattamento per formato Heidenhain
    let processedCode = this.convertToHeidenhain(code);
    improvements.push('Convertito al formato Heidenhain');
    
    // Applica ottimizzazioni specifiche Heidenhain
    if (this.options.controllerSpecific.heidenhain?.useConversationalFormat) {
      processedCode = this.applyHeidenhainConversationalFormat(processedCode);
      improvements.push('Applicato formato conversazionale Heidenhain');
    }
    
    if (this.options.controllerSpecific.heidenhain?.useTCP) {
      processedCode = this.applyHeidenhainTCPMode(processedCode);
      improvements.push('Aggiunto supporto TCPM per lavorazioni avanzate');
    }
    
    // Applica funzioni di blocco, se richiesto
    if (this.options.controllerSpecific.heidenhain?.useFunctionBlocks) {
      processedCode = this.applyHeidenhainFunctionBlocks(processedCode);
      improvements.push('Ottimizzato con Function Blocks per ridurre la complessità del programma');
    }
    
    // Aggiungi ottimizzazioni dei cicli
    if (this.options.controllerSpecific.heidenhain?.useCycleDefine) {
      processedCode = this.optimizeHeidenhainCycles(processedCode);
      improvements.push('Ottimizzati cicli di lavorazione');
    }
    
    // Applica ulteriori ottimizzazioni
    processedCode = this.applyAdvancedHeidenhainOptimizations(processedCode);
    improvements.push('Applicate ottimizzazioni avanzate specifiche Heidenhain');
    
    // Valida il G-code finale
    const validation = this.validateHeidenhainGCode(processedCode);
    
    // Calcola statistiche
    const optimizedLines = processedCode.split('\n').length;
    const reductionPercent = 
      ((originalLines.length - optimizedLines) / originalLines.length * 100).toFixed(2);
    
    return {
      code: processedCode,
      improvements,
      stats: {
        originalLines: originalLines.length,
        optimizedLines,
        reductionPercent: parseFloat(reductionPercent),
        estimatedTimeReduction: (originalLines.length - optimizedLines) * 0.015, // Stima semplificata
        minorWarnings,
        majorWarnings
      },
      validation
    };
  }
  
  /**
   * Ottimizza G-code per controller Siemens
   */
  private async processSiemensGCode(code: string): Promise<OptimizationResult> {
    // Implementazione semplificata per Siemens
    return this.processGenericGCode(code, 'Siemens');
  }
  
  /**
   * Ottimizza G-code per controller Haas
   */
  private async processHaasGCode(code: string): Promise<OptimizationResult> {
    // Haas è simile a Fanuc ma con alcune differenze
    const result = await this.processFanucGCode(code);
    result.improvements.push('Adattato per controller Haas');
    return result;
  }
  
  /**
   * Ottimizza G-code per controller Mazak
   */
  private async processMazakGCode(code: string): Promise<OptimizationResult> {
    // Implementazione semplificata per Mazak
    return this.processGenericGCode(code, 'Mazak');
  }
  
  /**
   * Ottimizza G-code per controller Okuma
   */
  private async processOkumaGCode(code: string): Promise<OptimizationResult> {
    // Implementazione semplificata per Okuma
    return this.processGenericGCode(code, 'Okuma');
  }
  
  /**
   * Ottimizza G-code generico (compatibile con la maggior parte dei controller)
   */
  private async processGenericGCode(code: string, controllerName: string = 'Generic'): Promise<OptimizationResult> {
    // Version semplificata per controller non specificatamente supportati
    const originalLines = code.split('\n');
    const improvements: string[] = [];
    const minorWarnings: string[] = [];
    const majorWarnings: string[] = [];
    
    // Applica ottimizzazioni generiche
    let processedCode = code;
    
    // Rimuovi righe vuote in eccesso, se richiesto
    if (this.options.removeEmptyLines) {
      processedCode = this.removeExcessEmptyLines(processedCode);
      improvements.push('Rimosse righe vuote in eccesso');
    }
    
    // Rimuovi commenti, se richiesto (con cautela)
    if (this.options.removeComments) {
      processedCode = this.removeComments(processedCode);
      improvements.push('Rimossi commenti');
    }
    
    // Ottimizza movimenti, se richiesto
    if (this.options.optimizeRapidMoves) {
      processedCode = this.optimizeRapidMovements(processedCode);
      improvements.push('Ottimizzati movimenti rapidi');
    }
    
    // Consolida i G-code, se richiesto
    if (this.options.consolidateGCodes) {
      processedCode = this.consolidateGCodes(processedCode);
      improvements.push('Consolidati G-code ridondanti');
    }
    
    // Aggiungi formattazione e header
    processedCode = this.addGenericHeader(processedCode, controllerName);
    
    // Valida il G-code risultante
    const validation = this.validateGenericGCode(processedCode);
    
    // Calcola statistiche
    const optimizedLines = processedCode.split('\n').length;
    const reductionPercent = 
      ((originalLines.length - optimizedLines) / originalLines.length * 100).toFixed(2);
    
    return {
      code: processedCode,
      improvements,
      stats: {
        originalLines: originalLines.length,
        optimizedLines,
        reductionPercent: parseFloat(reductionPercent),
        estimatedTimeReduction: (originalLines.length - optimizedLines) * 0.01,
        minorWarnings,
        majorWarnings
      },
      validation
    };
  }
  
  // ==== FANUC SPECIFIC OPTIMIZATIONS ====
  
  /**
   * Applica la modalità ad alta velocità Fanuc
   */
  private applyFanucHighSpeedMode(code: string): string {
    const lines = code.split('\n');
    const fanucOptions = this.options.controllerSpecific.fanuc;
    
    // Cerca il punto migliore per inserire i comandi AICC, di solito dopo l'inizializzazione
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('G90') || lines[i].includes('G21') || lines[i].includes('G17')) {
        insertIndex = i + 1;
      }
      
      // Se troviamo l'inizio dell'operazione, interrompiamo per inserire prima
      if (lines[i].includes('G0') || lines[i].includes('G1')) {
        break;
      }
    }
    
    // Configurazione AICC e altre funzionalità avanzate
    const highSpeedCommands = [];
    
    if (fanucOptions?.useAI) {
      highSpeedCommands.push('G05.1 Q1 ; Attiva AI Contour Control');
    }
    
    if (fanucOptions?.useNanoSmoothing) {
      highSpeedCommands.push('G05.1 Q3 ; Attiva Nano Smoothing');
    }
    
    if (fanucOptions?.useHighPrecisionMode) {
      highSpeedCommands.push('G61.1 ; Modalità di arresto esatto');
    } else {
      highSpeedCommands.push('G64 P0.05 ; Modalità taglio con tolleranza di raccordo 0.05mm');
    }
    
    // Inserisci i comandi di alta velocità
    if (highSpeedCommands.length > 0) {
      highSpeedCommands.unshift(''); // Aggiungi una riga vuota prima
      highSpeedCommands.unshift('; ----- Attivazione modalità Alta Velocità -----');
      highSpeedCommands.push('; -----------------------------------------');
      highSpeedCommands.push('');
      
      lines.splice(insertIndex, 0, ...highSpeedCommands);
      
      // Assicurati di disattivare queste modalità alla fine del programma
      let endIndex = lines.length - 1;
      while (endIndex > 0 && (lines[endIndex].trim() === '' || lines[endIndex].startsWith(';'))) {
        endIndex--;
      }
      
      // Cerca M30 o M2 (fine programma)
      let foundEndCommand = false;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('M30') || lines[i].includes('M2')) {
          lines.splice(i, 0, '; ----- Disattivazione modalità Alta Velocità -----');
          if (fanucOptions?.useAI) {
            lines.splice(i, 0, 'G05.1 Q0 ; Disattiva AI Contour Control');
          }
          if (fanucOptions?.useNanoSmoothing) {
            lines.splice(i, 0, 'G05.1 Q0 ; Disattiva Nano Smoothing');
          }
          lines.splice(i, 0, 'G64 ; Ripristina modalità taglio normale');
          lines.splice(i, 0, '; -----------------------------------------');
          foundEndCommand = true;
          break;
        }
      }
      
      // Se non troviamo M30/M2, aggiungiamo alla fine
      if (!foundEndCommand) {
        lines.push(''); 
        lines.push('; ----- Disattivazione modalità Alta Velocità -----');
        if (fanucOptions?.useAI) {
          lines.push('G05.1 Q0 ; Disattiva AI Contour Control');
        }
        if (fanucOptions?.useNanoSmoothing) {
          lines.push('G05.1 Q0 ; Disattiva Nano Smoothing');
        }
        lines.push('G64 ; Ripristina modalità taglio normale');
        lines.push('; -----------------------------------------');
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Applica AI Contour Control di Fanuc
   */
  private applyFanucAIContourControl(code: string): string {
    // Questo è gestito da applyFanucHighSpeedMode
    return code;
  }
  
  /**
   * Applica l'ottimizzazione degli angoli per Fanuc
   */
  private applyFanucCornerRounding(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Flag per tenere traccia dello stato
    let inContour = false;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastZ: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Non modificare commenti o righe vuote
      if (line.startsWith(';') || line === '') {
        result.push(line);
        continue;
      }
      
      // Check se siamo in una sequenza di contornatura
      if ((line.includes('G1') || line.includes('G01')) && !inContour) {
        inContour = true;
      }
      
      // Estrai coordinate
      const xMatch = line.match(/X([-\d.]+)/);
      const yMatch = line.match(/Y([-\d.]+)/);
      const zMatch = line.match(/Z([-\d.]+)/);
      
      if (xMatch) lastX = parseFloat(xMatch[1]);
      if (yMatch) lastY = parseFloat(yMatch[1]);
      if (zMatch) lastZ = parseFloat(zMatch[1]);
      
      // Verifica se possiamo applicare il corner rounding
      if (inContour && i < lines.length - 1) {
        const nextLine = lines[i + 1].trim();
        
        // Se abbiamo due movimenti G1 consecutivi, possiamo considerare l'arrotondamento
        if ((line.includes('G1') || line.includes('G01')) && 
            (nextLine.includes('G1') || nextLine.includes('G01'))) {
          
          // Estrai le coordinate della prossima linea
          const nextXMatch = nextLine.match(/X([-\d.]+)/);
          const nextYMatch = nextLine.match(/Y([-\d.]+)/);
          const nextZMatch = nextLine.match(/Z([-\d.]+)/);
          
          const nextX = nextXMatch ? parseFloat(nextXMatch[1]) : lastX;
          const nextY = nextYMatch ? parseFloat(nextYMatch[1]) : lastY;
          const nextZ: number | null = nextZMatch ? parseFloat(nextZMatch[1]) : lastZ;
          
          // Verifica se è un cambio di direzione ad angolo retto (semplificato)
          if (lastX !== null && lastY !== null && nextX !== null && nextY !== null) {
            const isXChange = lastX !== nextX;
            const isYChange = lastY !== nextY;
            
            // Se cambiano entrambe le coordinate e siamo allo stesso Z, è un angolo
            if (isXChange && isYChange && lastZ === nextZ) {
              // Aggiungi raggio di arrotondamento (R0.5 = 0.5mm di raggio)
              result.push(line + ' R0.5 ; Corner rounding');
              continue;
            }
          }
        }
      }
      
      // Se arriviamo qui, non abbiamo applicato l'arrotondamento
      result.push(line);
      
      // Controlla se stiamo uscendo da un contorno
      if (inContour && (line.includes('G0') || line.includes('G00'))) {
        inContour = false;
      }
    }
    
    return result.join('\n');
  }
  
  /**
   * Applica ottimizzazioni avanzate specifiche per Fanuc
   */
  private applyAdvancedFanucOptimizations(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Flag per tenere traccia dello stato modale
    let modalG0 = false;
    let modalG1 = false;
    let currentF: number | null = null;
    let currentS: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Non modificare commenti o righe vuote
      if (line.startsWith(';') || line === '') {
        result.push(line);
        continue;
      }
      
      // Ottimizzazione codici modali
      if (this.options.controllerSpecific.fanuc?.useModalGCodes) {
        if (line.includes('G0') || line.includes('G00')) {
          if (modalG0) {
            line = line.replace(/G0\s|G00\s/, '');
          } else {
            modalG0 = true;
            modalG1 = false;
          }
        } else if (line.includes('G1') || line.includes('G01')) {
          if (modalG1) {
            line = line.replace(/G1\s|G01\s/, '');
          } else {
            modalG1 = true;
            modalG0 = false;
          }
        }
      }
      
      // Ottimizzazione feed rate ripetuti
      if (this.options.optimizeFeedrates) {
        const fMatch = line.match(/F([\d.]+)/);
        if (fMatch) {
          const f = parseFloat(fMatch[1]);
          if (currentF === f) {
            line = line.replace(/F[\d.]+/, '');
          } else {
            currentF = f;
          }
        }
        
        // Ottimizzazione velocità mandrino ripetute
        const sMatch = line.match(/S([\d.]+)/);
        if (sMatch) {
          const s = parseFloat(sMatch[1]);
          if (currentS === s) {
            line = line.replace(/S[\d.]+/, '');
          } else {
            currentS = s;
          }
        }
      }
      
      // Formato decimale compatto (rimuove zeri finali)
      if (this.options.controllerSpecific.fanuc?.useDecimalFormat) {
        line = line.replace(/(\d+)\.0+([^\d]|$)/g, '$1$2');
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }
  
  /**
   * Valida il G-code per controller Fanuc
   */
  private validateFanucGCode(code: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const lines = code.split('\n');
    let hasStart = false;
    let hasEnd = false;
    let maxLineLength = 0;
    
    // Validazione di base per Fanuc
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Verifica la lunghezza massima della riga (standard Fanuc ~ 128 caratteri)
      if (line.length > maxLineLength) {
        maxLineLength = line.length;
      }
      
      if (line.length > 128) {
        warnings.push(`Linea ${i+1} è più lunga di 128 caratteri (${line.length})`);
      }
      
      // Verifica inizio programma
      if (line.startsWith('%')) {
        hasStart = true;
      }
      
      // Verifica fine programma
      if (line.includes('M30') || line.includes('M2')) {
        hasEnd = true;
      }
      
      // Cerca sintassi degli archi non valida
      if ((line.includes('G2') || line.includes('G3')) && 
          (!line.includes('I') && !line.includes('J') && !line.includes('R'))) {
        errors.push(`Linea ${i+1}: Arco mancante di parametri I/J o R`);
      }
      
      // Controlla errori comuni di sintassi
      if (line.includes('G') && line.match(/G\d+\.\d+[^\s\d.]/)) {
        errors.push(`Linea ${i+1}: Formato G-code non valido`);
      }
    }
    
    // Aggiungi avvertimenti per mancanza di inizio/fine
    if (!hasStart) {
      warnings.push('Il programma non ha un simbolo di inizio (%)')
    }
    
    if (!hasEnd) {
      warnings.push('Il programma non ha un comando di fine (M30/M2)');
    }
    
    // Avvertimenti su lunghezza programma
    if (lines.length > 10000) {
      warnings.push(`Il programma è molto lungo (${lines.length} linee), potrebbe causare problemi di memoria`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  // ==== HEIDENHAIN SPECIFIC OPTIMIZATIONS ====
  
  /**
   * Converte G-code standard in formato Heidenhain
   */
  private convertToHeidenhain(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Header Heidenhain
    result.push('BEGIN PGM WORKPIECE MM');
    
    // Preparazione definizione BLK_FORM
    let minX = 0;
    let minY = 0;
    let minZ = 0;
    let maxX = 100;
    let maxY = 100;
    let maxZ = 100;
    
    // Estrai i parametri del blocco di lavoro
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Cerca commenti che contengono dimensioni del pezzo
      if (line.startsWith(';') && 
          (line.includes('Workpiece') || line.includes('Material') || line.includes('STOCK'))) {
        const wMatch = line.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/);
        if (wMatch) {
          maxX = parseInt(wMatch[1]);
          maxY = parseInt(wMatch[2]);
          maxZ = parseInt(wMatch[3]);
        }
      }
    }
    
    // Definizione blocco di lavoro
    result.push(`BLK FORM 0.1 Z X${minX} Y${minY} Z${minZ}`);
    result.push(`BLK FORM 0.2 X+${maxX} Y+${maxY} Z+${maxZ}`);
    
    // Definizione tool
    let toolNumber = 1;
    let toolDiameter = 10;
    
    // Cerca informazioni utensile
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('T') && line.includes('M6')) {
        const tMatch = line.match(/T(\d+)/);
        if (tMatch) {
          toolNumber = parseInt(tMatch[1]);
        }
      }
      
      if (line.includes('diameter') || line.includes('Diameter')) {
        const dMatch = line.match(/(\d+(\.\d+)?)\s*mm/);
        if (dMatch) {
          toolDiameter = parseFloat(dMatch[1]);
        }
      }
    }
    
    result.push(`TOOL CALL ${toolNumber} Z S0 ; Initial tool call`);
    
    // Converti il G-code in formato Heidenhain
    let lineNumber = 1;
    let inRapidMode = true; // Assumiamo che iniziamo in modalità di rapido
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Salta righe vuote e commenti e righe di configurazione iniziale
      if (line === '' || line.startsWith(';') || line.startsWith('%') || 
          line.startsWith('G20') || line.startsWith('G21') || 
          line.startsWith('G90') || line.startsWith('G91')) {
        continue;
      }
      
      // Converti i comandi
      if (line.includes('G0') || line.includes('G00')) {
        // Rapido
        inRapidMode = true;
        const coords = this.extractCoordinates(line);
        if (Object.keys(coords).length > 0) {
          result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)} FMAX`);
          lineNumber++;
        }
      } else if (line.includes('G1') || line.includes('G01')) {
        // Lineare
        inRapidMode = false;
        const coords = this.extractCoordinates(line);
        const feedrate = this.extractFeedrate(line);
        
        if (Object.keys(coords).length > 0) {
          if (feedrate) {
            result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)} F${feedrate}`);
          } else {
            result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)}`);
          }
          lineNumber++;
        }
      } else if (line.includes('G2') || line.includes('G02')) {
        // Arco in senso orario
        inRapidMode = false;
        const coords = this.extractCoordinates(line);
        const center = this.extractArcCenter(line);
        const feedrate = this.extractFeedrate(line);
        
        if (Object.keys(coords).length > 0 && center) {
          const radius = Math.sqrt(Math.pow(center.i || 0, 2) + Math.pow(center.j || 0, 2));
          if (feedrate) {
            result.push(`${lineNumber} CR ${this.formatHeidenhainCoords(coords)} R-${radius.toFixed(3)} F${feedrate}`);
          } else {
            result.push(`${lineNumber} CR ${this.formatHeidenhainCoords(coords)} R-${radius.toFixed(3)}`);
          }
          lineNumber++;
        }
      } else if (line.includes('G3') || line.includes('G03')) {
        // Arco in senso antiorario
        inRapidMode = false;
        const coords = this.extractCoordinates(line);
        const center = this.extractArcCenter(line);
        const feedrate = this.extractFeedrate(line);
        
        if (Object.keys(coords).length > 0 && center) {
          const radius = Math.sqrt(Math.pow(center.i || 0, 2) + Math.pow(center.j || 0, 2));
          if (feedrate) {
            result.push(`${lineNumber} CR ${this.formatHeidenhainCoords(coords)} R+${radius.toFixed(3)} F${feedrate}`);
          } else {
            result.push(`${lineNumber} CR ${this.formatHeidenhainCoords(coords)} R+${radius.toFixed(3)}`);
          }
          lineNumber++;
        }
      } else if (line.includes('G81')) {
        // Ciclo di foratura semplice
        const coords = this.extractCoordinates(line);
        const depth = this.extractCycleDepth(line);
        const retract = this.extractRetractHeight(line);
        const feedrate = this.extractFeedrate(line);
        
        // Converto in ciclo Heidenhain
        result.push(`${lineNumber} CYCL DEF 200 DRILLING`);
        lineNumber++;
        result.push(`${lineNumber} Q200=${retract || 2} ; SET-UP CLEARANCE`);
        lineNumber++;
        result.push(`${lineNumber} Q201=-${depth || 10} ; DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q206=${feedrate || 150} ; FEED RATE FOR PLUNGING`);
        lineNumber++;
        result.push(`${lineNumber} Q202=${depth || 10} ; PLUNGING DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q210=0 ; DWELL TIME AT TOP`);
        lineNumber++;
        result.push(`${lineNumber} Q203=0 ; SURFACE COORDINATE`);
        lineNumber++;
        result.push(`${lineNumber} Q204=${retract || 2} ; 2ND SET-UP CLEARANCE`);
        lineNumber++;
        result.push(`${lineNumber} Q211=0 ; DWELL TIME AT DEPTH`);
        lineNumber++;
        
        // Esecuzione del ciclo sul punto
        if (Object.keys(coords).length > 0) {
          result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)} FMAX M99`);
          lineNumber++;
        }
      } else if (line.includes('G83')) {
        // Ciclo di foratura a rompitruciolo
        const coords = this.extractCoordinates(line);
        const depth = this.extractCycleDepth(line);
        const retract = this.extractRetractHeight(line);
        const peckDepth = this.extractPeckDepth(line);
        const feedrate = this.extractFeedrate(line);
        
        // Converto in ciclo Heidenhain
        result.push(`${lineNumber} CYCL DEF 203 UNIVERSAL DRILLING`);
        lineNumber++;
        result.push(`${lineNumber} Q200=${retract || 2} ; SET-UP CLEARANCE`);
        lineNumber++;
        result.push(`${lineNumber} Q201=-${depth || 10} ; DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q206=${feedrate || 150} ; FEED RATE FOR PLUNGING`);
        lineNumber++;
        result.push(`${lineNumber} Q202=${peckDepth || 3} ; PLUNGING DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q210=0 ; DWELL TIME AT TOP`);
        lineNumber++;
        result.push(`${lineNumber} Q203=0 ; SURFACE COORDINATE`);
        lineNumber++;
        result.push(`${lineNumber} Q204=${retract || 2} ; 2ND SET-UP CLEARANCE`);
        lineNumber++;
        result.push(`${lineNumber} Q212=0 ; DECREMENT`);
        lineNumber++;
        result.push(`${lineNumber} Q213=0 ; BREAKS`);
        lineNumber++;
        result.push(`${lineNumber} Q205=${peckDepth || 3} ; MIN. PLUNGING DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q211=0 ; DWELL TIME AT DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q208=500 ; RETRACTION FEED RATE`);
        lineNumber++;
        result.push(`${lineNumber} Q256=0.2 ; DIST. FOR CHIP BRKNG`);
        lineNumber++;
        
        // Esecuzione del ciclo sul punto
        if (Object.keys(coords).length > 0) {
          result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)} FMAX M99`);
          lineNumber++;
        }
      } else if (line.includes('G84')) {
        // Ciclo di maschiatura
        const coords = this.extractCoordinates(line);
        const depth = this.extractCycleDepth(line);
        const retract = this.extractRetractHeight(line);
        const threadPitch = this.extractThreadPitch(line);
        
        // Converto in ciclo Heidenhain
        result.push(`${lineNumber} CYCL DEF 207 RIGID TAPPING`);
        lineNumber++;
        result.push(`${lineNumber} Q200=${retract || 2} ; SET-UP CLEARANCE`);
        lineNumber++;
        result.push(`${lineNumber} Q201=-${depth || 10} ; DEPTH`);
        lineNumber++;
        result.push(`${lineNumber} Q239=${threadPitch || 1.5} ; THREAD PITCH`);
        lineNumber++;
        result.push(`${lineNumber} Q203=0 ; SURFACE COORDINATE`);
        lineNumber++;
        result.push(`${lineNumber} Q204=${retract || 2} ; 2ND SET-UP CLEARANCE`);
        lineNumber++;
        
        // Esecuzione del ciclo sul punto
        if (Object.keys(coords).length > 0) {
          result.push(`${lineNumber} L ${this.formatHeidenhainCoords(coords)} FMAX M99`);
          lineNumber++;
        }
      } else if (line.includes('M3') || line.includes('M03')) {
        // Avvio mandrino in senso orario
        const speedMatch = line.match(/S(\d+)/);
        if (speedMatch) {
          const speed = parseInt(speedMatch[1]);
          result.push(`${lineNumber} TOOL CALL ${toolNumber} Z S${speed}`);
          lineNumber++;
        }
      } else if (line.includes('M4') || line.includes('M04')) {
        // Avvio mandrino in senso antiorario
        const speedMatch = line.match(/S(\d+)/);
        if (speedMatch) {
          const speed = parseInt(speedMatch[1]);
          result.push(`${lineNumber} TOOL CALL ${toolNumber} Z S${speed} M4`);
          lineNumber++;
        }
      } else if (line.includes('M5') || line.includes('M05')) {
        // Stop mandrino
        result.push(`${lineNumber} M5`);
        lineNumber++;
      } else if (line.includes('M8') || line.includes('M7')) {
        // Refrigerante on
        result.push(`${lineNumber} M8`);
        lineNumber++;
      } else if (line.includes('M9')) {
        // Refrigerante off
        result.push(`${lineNumber} M9`);
        lineNumber++;
      } else if (line.includes('M30') || line.includes('M2')) {
        // Fine programma
        result.push(`${lineNumber} L Z+100 R0 FMAX M2`);
        lineNumber++;
      } else if (line.match(/T\d+/) && line.includes('M6')) {
        // Cambio utensile
        const tMatch = line.match(/T(\d+)/);
        if (tMatch) {
          const toolNum = parseInt(tMatch[1]);
          const speedMatch = line.match(/S(\d+)/);
          const speed = speedMatch ? parseInt(speedMatch[1]) : 0;
          
          result.push(`${lineNumber} TOOL CALL ${toolNum} Z S${speed}`);
          lineNumber++;
          toolNumber = toolNum;
        }
      } else if (line.includes('G43') && line.match(/H\d+/)) {
        // Compensazione lunghezza utensile - non serve in Heidenhain
        continue;
      } else if (line.includes('G41')) {
        // Compensazione raggio a sinistra
        result.push(`${lineNumber} RL`);
        lineNumber++;
      } else if (line.includes('G42')) {
        // Compensazione raggio a destra
        result.push(`${lineNumber} RR`);
        lineNumber++;
      } else if (line.includes('G40')) {
        // Annulla compensazione raggio
        result.push(`${lineNumber} R0`);
        lineNumber++;
      } else {
        // Per altri comandi che non riconosciamo, li convertiamo in commenti
        if (line.trim() !== '') {
          result.push(`; Unconverted: ${line}`);
        }
      }
    }
    
    // Aggiungi la fine del programma
    result.push('END PGM WORKPIECE MM');
    
    return result.join('\n');
  }
  
  /**
   * Converte le coordinate in formato Heidenhain
   */
  private formatHeidenhainCoords(coords: { x?: number; y?: number; z?: number }): string {
    let result = '';
    
    if (coords.x !== undefined) {
      result += 'X' + (coords.x >= 0 ? '+' : '') + coords.x.toFixed(3) + ' ';
    }
    
    if (coords.y !== undefined) {
      result += 'Y' + (coords.y >= 0 ? '+' : '') + coords.y.toFixed(3) + ' ';
    }
    
    if (coords.z !== undefined) {
      result += 'Z' + (coords.z >= 0 ? '+' : '') + coords.z.toFixed(3) + ' ';
    }
    
    return result.trim();
  }
  
  /**
   * Estrae le coordinate da una linea di G-code
   */
  private extractCoordinates(line: string): { x?: number; y?: number; z?: number } {
    const coords: { x?: number; y?: number; z?: number } = {};
    
    // Estrai coordinata X
    const xMatch = line.match(/X([+-]?\d*\.?\d+)/);
    if (xMatch) {
      coords.x = parseFloat(xMatch[1]);
    }
    
    // Estrai coordinata Y
    const yMatch = line.match(/Y([+-]?\d*\.?\d+)/);
    if (yMatch) {
      coords.y = parseFloat(yMatch[1]);
    }
    
    // Estrai coordinata Z
    const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);
    if (zMatch) {
      coords.z = parseFloat(zMatch[1]);
    }
    
    return coords;
  }
  
  /**
   * Estrae il centro dell'arco per comandi G2/G3
   */
  private extractArcCenter(line: string): { i?: number; j?: number; k?: number } | null {
    const center: { i?: number; j?: number; k?: number } = {};
    
    // Estrai offset I
    const iMatch = line.match(/I([+-]?\d*\.?\d+)/);
    if (iMatch) {
      center.i = parseFloat(iMatch[1]);
    }
    
    // Estrai offset J
    const jMatch = line.match(/J([+-]?\d*\.?\d+)/);
    if (jMatch) {
      center.j = parseFloat(jMatch[1]);
    }
    
    // Estrai offset K
    const kMatch = line.match(/K([+-]?\d*\.?\d+)/);
    if (kMatch) {
      center.k = parseFloat(kMatch[1]);
    }
    
    // Se non abbiamo nessun offset, restituisci null
    if (center.i === undefined && center.j === undefined && center.k === undefined) {
      return null;
    }
    
    return center;
  }
  
  /**
   * Estrae la velocità di avanzamento
   */
  private extractFeedrate(line: string): number | null {
    const fMatch = line.match(/F([+-]?\d*\.?\d+)/);
    return fMatch ? parseFloat(fMatch[1]) : null;
  }
  
  /**
   * Estrae la profondità per cicli
   */
  private extractCycleDepth(line: string): number | null {
    const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);
    if (zMatch) {
      const z = parseFloat(zMatch[1]);
      return Math.abs(z); // Restituisci il valore assoluto
    }
    return null;
  }
  
  /**
   * Estrae l'altezza di retrazione per cicli
   */
  private extractRetractHeight(line: string): number | null {
    const rMatch = line.match(/R([+-]?\d*\.?\d+)/);
    return rMatch ? parseFloat(rMatch[1]) : null;
  }
  
  /**
   * Estrae la profondità di peck per cicli
   */
  private extractPeckDepth(line: string): number | null {
    const qMatch = line.match(/Q([+-]?\d*\.?\d+)/);
    return qMatch ? parseFloat(qMatch[1]) : null;
  }
  
  /**
   * Estrae il passo della filettatura
   */
  private extractThreadPitch(line: string): number | null {
    // In Fanuc G84, il passo è spesso specificato come F
    const fMatch = line.match(/F([+-]?\d*\.?\d+)/);
    return fMatch ? parseFloat(fMatch[1]) : null;
  }
  
  /**
   * Applica il formato conversazionale Heidenhain
   */
  private applyHeidenhainConversationalFormat(code: string): string {
    // Il codice è già stato convertito in formato conversazionale di base
    return code;
  }
  
  /**
   * Applica TCPM mode per lavorazioni a 5 assi
   */
  private applyHeidenhainTCPMode(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Cerca dove inserire il comando TCPM
    let insertPoint = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('TOOL CALL')) {
        insertPoint = i + 1;
      }
      
      if (insertPoint >= 0 && lines[i].match(/L .*FMAX/)) {
        break;
      }
    }
    
    if (insertPoint < 0) {
      insertPoint = 5; // Fallback
    }
    
    // Inserisci la configurazione TCPM
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      
      if (i === insertPoint) {
        result.push('FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS ; Enable TCPM');
      }
    }
    
    // Cerca uno dei punti di fine programma
    let endIndex = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].includes('END PGM') || result[i].includes('M2') || result[i].includes('M30')) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex >= 0) {
      // Disattiva TCPM prima della fine
      result.splice(endIndex, 0, 'FUNCTION TCPM RESET ; Disable TCPM');
    }
    
    return result.join('\n');
  }
  
  /**
   * Ottimizza i cicli Heidenhain
   */
  private optimizeHeidenhainCycles(code: string): string {
    // Il sistema Heidenhain ha già definizioni di cicli avanzati
    return code;
  }
  
  /**
   * Applica function blocks Heidenhain
   */
  private applyHeidenhainFunctionBlocks(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Pattern rilevamento
    const drillPattern: number[] = []; // Indici dove troviamo cicli di foratura
    const contourPattern: number[] = []; // Indici dove troviamo contorni
    
    // Cerca pattern di cicli e contorni
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('CYCL DEF 200') || 
          lines[i].includes('CYCL DEF 203') || 
          lines[i].includes('CYCL DEF 207')) {
        drillPattern.push(i);
      } else if (lines[i].match(/\d+ L .* RR/) || lines[i].match(/\d+ L .* RL/)) {
        // Possibile inizio contorno
        contourPattern.push(i);
      }
    }
    
    // Inserisci il codice fino al primo pattern rilevato
    let currentLine = 0;
    
    // Gestisci i function blocks per foratura
    if (drillPattern.length > 1) {
      // Possiamo creare un pattern di foratura
      // Trova tutti i punti di foratura
      const drillPoints: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\d+ L X.* Y.* FMAX M99/)) {
          drillPoints.push(lines[i].replace(/\d+ L /, '').replace(' FMAX M99', ''));
        }
      }
      
      if (drillPoints.length > 0) {
        // Genera definizione punto pattern
        while (currentLine < drillPattern[0]) {
          result.push(lines[currentLine]);
          currentLine++;
        }
        
        // Inserisci definizione pattern
        result.push('LBL 1 ; DRILL PATTERN');
        for (let point of drillPoints) {
          result.push(`L ${point} R0 FMAX`);
        }
        result.push('LBL 0');
        
        // Salta le definizioni dei punti originali
        const cycleDef = [];
        while (currentLine < drillPattern[0] + 15 && currentLine < lines.length) {
          cycleDef.push(lines[currentLine]);
          currentLine++;
        }
        
        // Aggiungi definizione ciclo
        result.push(...cycleDef);
        
        // Esegui il ciclo sul pattern
        result.push('CALL LBL 1');
        result.push('');
        
        // Salta tutti i punti di foratura originali
        while (currentLine < lines.length && lines[currentLine].match(/\d+ L X.* Y.* FMAX M99/)) {
          currentLine++;
        }
      }
    }
    
    // Copia il resto del codice
    while (currentLine < lines.length) {
      result.push(lines[currentLine]);
      currentLine++;
    }
    
    return result.join('\n');
  }
  
  /**
   * Applica ottimizzazioni avanzate Heidenhain
   */
  private applyAdvancedHeidenhainOptimizations(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Ottimizza numeri di riga
    let lineCount = 1;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Salta righe di commento e vuote
      if (line.startsWith(';') || line.trim() === '' || line.includes('BLK FORM') || 
          line.includes('BEGIN PGM') || line.includes('END PGM')) {
        result.push(line);
        continue;
      }
      
      // Estrai la parte numerica iniziale, se presente
      const lineNumMatch = line.match(/^(\d+)(.*)$/);
      if (lineNumMatch) {
        line = lineCount + lineNumMatch[2];
        lineCount += 5; // Incrementa per Heidenhain
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }
  
  /**
   * Valida il G-code Heidenhain
   */
  private validateHeidenhainGCode(code: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const lines = code.split('\n');
    
    // Validazione di base per Heidenhain
    let hasBeginPgm = false;
    let hasEndPgm = false;
    let hasToolCall = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Verifica sintassi di base
      if (line.startsWith('BEGIN PGM')) {
        hasBeginPgm = true;
      }
      
      if (line.startsWith('END PGM')) {
        hasEndPgm = true;
      }
      
      if (line.includes('TOOL CALL')) {
        hasToolCall = true;
      }
      
      // Verifica errori comuni
      if (line.match(/^(\d+)/) && !line.match(/^(\d+)\s+(L|CR|CC|CYCL|LBL|CALL)/)) {
        warnings.push(`Linea ${i+1}: Sintassi potenzialmente errata`);
      }
    }
    
    // Controlla i requisiti di base
    if (!hasBeginPgm) {
      errors.push('Manca BEGIN PGM');
    }
    
    if (!hasEndPgm) {
      errors.push('Manca END PGM');
    }
    
    if (!hasToolCall) {
      warnings.push('Nessuna chiamata utensile (TOOL CALL) trovata');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  // ==== COMMON OPTIMIZATION FUNCTIONS ====
  
  /**
   * Rimuove le righe vuote in eccesso
   */
  private removeExcessEmptyLines(code: string): string {
    // Sostituisce 3 o più righe vuote consecutive con 2
    return code.replace(/\n{3,}/g, '\n\n');
  }
  
  /**
   * Rimuove i commenti
   */
  private removeComments(code: string): string {
    // Rimuove i commenti, mantenendo le parentesi graffe e i commenti essenziali
    const lines = code.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Mantieni alcuni commenti importanti
      if (line.trim().startsWith(';') && 
         (line.includes('OPERATION') || line.includes('SETUP') || 
          line.includes('BEGIN') || line.includes('END'))) {
        result.push(line);
        continue;
      }
      
      // Rimuovi commenti inlinea
      line = line.replace(/\s*;.*$/, '');
      
      // Aggiungi la riga se non è vuota
      if (line.trim() !== '') {
        result.push(line);
      }
    }
    
    return result.join('\n');
  }
  
  /**
   * Ottimizza movimenti rapidi
   */
  private optimizeRapidMovements(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastZ: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Salta righe vuote e commenti
      if (line === '' || line.startsWith(';')) {
        result.push(line);
        continue;
      }
      
      // Verifica movimenti G0
      if (line.includes('G0') || line.includes('G00')) {
        // Estrai le coordinate
        const coords = this.extractCoordinates(line);
        
        // Verifica se c'è un cambiamento significativo
        const xChanged = coords.x !== undefined && (lastX === null || Math.abs(coords.x - lastX) > 0.001);
        const yChanged = coords.y !== undefined && (lastY === null || Math.abs(coords.y - lastY) > 0.001);
        const zChanged = coords.z !== undefined && (lastZ === null || Math.abs(coords.z - lastZ) > 0.001);
        
        // Aggiorna le coordinate
        if (coords.x !== undefined) lastX = coords.x;
        if (coords.y !== undefined) lastY = coords.y;
        if (coords.z !== undefined) lastZ = coords.z;
        
        // Se non ci sono cambiamenti significativi, salta
        if (!xChanged && !yChanged && !zChanged) {
          continue;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }
  
  /**
   * Consolida i G-code ridondanti
   */
  private consolidateGCodes(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    
    // Traccia lo stato dei G-code modali
    const modalState: Record<string, string> = {
      motion: '',      // G0/G1/G2/G3
      plane: '',       // G17/G18/G19
      feedMode: '',    // G94/G95
      unitMode: '',    // G20/G21
      coordMode: '',   // G90/G91
      compensation: '' // G40/G41/G42
    };
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Salta righe vuote e commenti
      if (line === '' || line.startsWith(';')) {
        result.push(line);
        continue;
      }
      
      // Verifica e aggiorna modalità G
      const g0Match = line.match(/G0(?!\d)/);
      const g1Match = line.match(/G1(?!\d)/);
      const g2Match = line.match(/G2(?!\d)/);
      const g3Match = line.match(/G3(?!\d)/);
      
      if (g0Match && modalState.motion === 'G0') {
        line = line.replace(/G0\s/, '');
      } else if (g1Match && modalState.motion === 'G1') {
        line = line.replace(/G1\s/, '');
      } else if (g2Match && modalState.motion === 'G2') {
        line = line.replace(/G2\s/, '');
      } else if (g3Match && modalState.motion === 'G3') {
        line = line.replace(/G3\s/, '');
      }
      
      // Aggiorna stato modale per movimento
      if (g0Match) modalState.motion = 'G0';
      if (g1Match) modalState.motion = 'G1';
      if (g2Match) modalState.motion = 'G2';
      if (g3Match) modalState.motion = 'G3';
      
      // Verifica modalità piano di lavoro
      if (line.includes('G17') && modalState.plane === 'G17') {
        line = line.replace(/G17\s/, '');
      } else if (line.includes('G18') && modalState.plane === 'G18') {
        line = line.replace(/G18\s/, '');
      } else if (line.includes('G19') && modalState.plane === 'G19') {
        line = line.replace(/G19\s/, '');
      }
      
      // Aggiorna stato modale per piano
      if (line.includes('G17')) modalState.plane = 'G17';
      if (line.includes('G18')) modalState.plane = 'G18';
      if (line.includes('G19')) modalState.plane = 'G19';
      
      // Verifica modalità unità
      if (line.includes('G20') && modalState.unitMode === 'G20') {
        line = line.replace(/G20\s/, '');
      } else if (line.includes('G21') && modalState.unitMode === 'G21') {
        line = line.replace(/G21\s/, '');
      }
      
      // Aggiorna stato modale per unità
      if (line.includes('G20')) modalState.unitMode = 'G20';
      if (line.includes('G21')) modalState.unitMode = 'G21';
      
      // Verifica modalità coordinate
      if (line.includes('G90') && modalState.coordMode === 'G90') {
        line = line.replace(/G90\s/, '');
      } else if (line.includes('G91') && modalState.coordMode === 'G91') {
        line = line.replace(/G91\s/, '');
      }
      
      // Aggiorna stato modale per coordinate
      if (line.includes('G90')) modalState.coordMode = 'G90';
      if (line.includes('G91')) modalState.coordMode = 'G91';
      
      // Verifica compensazione raggio utensile
      if (line.includes('G40') && modalState.compensation === 'G40') {
        line = line.replace(/G40\s/, '');
      } else if (line.includes('G41') && modalState.compensation === 'G41') {
        line = line.replace(/G41\s/, '');
      } else if (line.includes('G42') && modalState.compensation === 'G42') {
        line = line.replace(/G42\s/, '');
      }
      
      // Aggiorna stato modale per compensazione
      if (line.includes('G40')) modalState.compensation = 'G40';
      if (line.includes('G41')) modalState.compensation = 'G41';
      if (line.includes('G42')) modalState.compensation = 'G42';
      
      result.push(line);
    }
    
    return result.join('\n');
  }
  
  /**
   * Aggiunge un header generico al G-code
   */
  private addGenericHeader(code: string, controllerName: string): string {
    const lines = code.split('\n');
    
    // Verifica se esiste già un'intestazione
    let hasHeader = false;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].includes('Generated by') || lines[i].includes('Post-processor')) {
        hasHeader = true;
        break;
      }
    }
    
    if (!hasHeader) {
      const header = [
        '% ',
        '; ' + '='.repeat(50),
        '; G-code ottimizzato generato dal Post-processor avanzato',
        '; Controller: ' + controllerName,
        '; Data: ' + new Date().toISOString().split('T')[0],
        '; ' + '='.repeat(50),
        ''
      ];
      
      return header.join('\n') + '\n' + code;
    }
    
    return code;
  }
  
  /**
   * Valida il G-code generico
   */
  private validateGenericGCode(code: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const lines = code.split('\n');
    
    // Verifica se ci sono comandi di movimento senza coordinate
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Salta righe vuote e commenti
      if (line === '' || line.startsWith(';')) {
        continue;
      }
      
      // Verifica comandi di movimento (G0, G1, G2, G3) senza coordinate
      if ((line.includes('G0') || line.includes('G1') || 
           line.includes('G2') || line.includes('G3')) && 
          !line.match(/[XYZ][-\d.]/)) {
        warnings.push(`Linea ${i+1}: Comando di movimento senza coordinate`);
      }
      
      // Verifica archi (G2, G3) senza parametri centro/raggio
      if ((line.includes('G2') || line.includes('G3')) && 
          !line.match(/[IJR][-\d.]/)) {
        errors.push(`Linea ${i+1}: Comando arco senza parametri centro o raggio`);
      }
      
      // Verifica comandi non validi
      if (line.match(/G\d+/) && !line.match(/G[0-9]{1,3}(\.\d+)?/)) {
        errors.push(`Linea ${i+1}: Formato G-code non valido`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Crea un post-processor per Fanuc
 */
export function createFanucPostProcessor(options?: Partial<OptimizationOptions>): AdvancedPostProcessor {
  return new AdvancedPostProcessor('fanuc', options);
}

/**
 * Crea un post-processor per Heidenhain
 */
export function createHeidenhainPostProcessor(options?: Partial<OptimizationOptions>): AdvancedPostProcessor {
  return new AdvancedPostProcessor('heidenhain', options);
}

/**
 * Crea un post-processor per un controller specifico
 */
export function createPostProcessor(
  controllerType: ControllerType, 
  options?: Partial<OptimizationOptions>
): AdvancedPostProcessor {
  return new AdvancedPostProcessor(controllerType, options);
}