// src/toolpath/fixedCycles/fixedCyclesParser.ts
import { GCodeCommand, ToolpathPoint } from 'src//types/GCode';

/**
 * Interfaccia per i parametri di un ciclo fisso di foratura
 */
export interface DrillingCycleParams {
  x?: number;        // Posizione X
  y?: number;        // Posizione Y
  z?: number;        // Profondità finale (Z)
  r?: number;        // Posizione del piano di riferimento
  q?: number;        // Profondità di incremento (per cicli a rompitruciolo)
  p?: number;        // Tempo di sosta (in secondi)
  f?: number;        // Avanzamento
  l?: number;        // Numero di ripetizioni
}

/**
 * Interfaccia per i parametri di un ciclo fisso di filettatura
 */
export interface ThreadingCycleParams extends DrillingCycleParams {
  s?: number;        // Velocità mandrino
  d?: number;        // Profondità di filettatura (K per alcuni controlli)
  h?: number;        // Passo filettatura (P per alcuni controlli)
}

/**
 * Interfaccia per i parametri di un ciclo fisso di alesatura
 */
export interface BoringCycleParams extends DrillingCycleParams {
  i?: number;        // Spostamento lungo X
  j?: number;        // Spostamento lungo Y
  k?: number;        // Spostamento lungo Z o profondità di alesatura
  q?: number;        // Spostamento alla fine dell'alesatura
  d?: number;        // Diametro dell'utensile (per alcuni controlli)
}

/**
 * Tipo unione per tutti i cicli fissi
 */
export type FixedCycleParams = DrillingCycleParams | ThreadingCycleParams | BoringCycleParams;

/**
 * Tipo di ciclo fisso
 */
export enum FixedCycleType {
  // Cicli di foratura
  DRILLING = 'drilling',               // G81: Foratura semplice
  DRILLING_DWELL = 'drilling_dwell',   // G82: Foratura con sosta
  PECK_DRILLING = 'peck_drilling',     // G83: Foratura a rompitruciolo
  RIGHT_TAPPING = 'right_tapping',     // G84: Maschiatura destra
  BORING = 'boring',                   // G85: Alesatura
  BORING_DWELL = 'boring_dwell',       // G86: Alesatura con sosta
  BACK_BORING = 'back_boring',         // G87: Alesatura posteriore
  LEFT_TAPPING = 'left_tapping',       // G74: Maschiatura sinistra
  BORING_WITH_RETRACT = 'boring_retract', // G89: Alesatura con sosta e ritrazione
  CUSTOM = 'custom'                    // Altri cicli specifici
}

/**
 * Interfaccia per il risultato dell'analisi di un ciclo fisso
 */
export interface FixedCycleResult {
  type: FixedCycleType;
  params: FixedCycleParams;
  gCode: string;
  points: ToolpathPoint[];  // Punti generati per la visualizzazione
  isValid: boolean;
  error?: string;
}

/**
 * Classe per riconoscere e parsare i cicli fissi nel G-code
 */
export class FixedCyclesParser {
  private lastX: number = 0;
  private lastY: number = 0;
  private lastZ: number = 0;
  private currentPlane: 'XY' | 'YZ' | 'ZX' = 'XY';  // G17, G18, G19
  private activeCycle: FixedCycleType | null = null;
  private cycleParams: FixedCycleParams = {};
  private useIncrementalMode: boolean = false;
  
  /**
   * Reinizializza il parser
   */
  public reset(): void {
    this.lastX = 0;
    this.lastY = 0;
    this.lastZ = 0;
    this.currentPlane = 'XY';
    this.activeCycle = null;
    this.cycleParams = {};
    this.useIncrementalMode = false;
  }
  
  /**
   * Aggiorna le coordinate correnti
   */
  public updatePosition(x?: number, y?: number, z?: number): void {
    if (x !== undefined) this.lastX = x;
    if (y !== undefined) this.lastY = y;
    if (z !== undefined) this.lastZ = z;
  }
  
  /**
   * Imposta la modalità incrementale o assoluta
   */
  public setIncrementalMode(incremental: boolean): void {
    this.useIncrementalMode = incremental;
  }
  
  /**
   * Imposta il piano di lavoro corrente
   */
  public setWorkPlane(code: 'G17' | 'G18' | 'G19'): void {
    switch (code) {
      case 'G17': this.currentPlane = 'XY'; break;
      case 'G18': this.currentPlane = 'ZX'; break;
      case 'G19': this.currentPlane = 'YZ'; break;
    }
  }
  
  /**
   * Analizza un comando G-code per identificare un ciclo fisso
   * @param command Comando G-code da analizzare
   * @returns Risultato dell'analisi o null se non è un ciclo fisso
   */
  public parseCommand(command: GCodeCommand): FixedCycleResult | null {
    const cmd = command.command.toUpperCase();
    
    // Verifica se è un comando che modifica il piano di lavoro
    if (cmd === 'G17' || cmd === 'G18' || cmd === 'G19') {
      this.setWorkPlane(cmd as 'G17' | 'G18' | 'G19');
      return null;
    }
    
    // Verifica se è un comando di modalità incrementale/assoluta
    if (cmd === 'G90') {
      this.setIncrementalMode(false);
      return null;
    } else if (cmd === 'G91') {
      this.setIncrementalMode(true);
      return null;
    }
    
    // Controlla se è un ciclo fisso o una sua chiamata
    if (this.isFixedCycleStart(cmd)) {
      // Inizializzazione di un nuovo ciclo fisso
      this.activeCycle = this.getFixedCycleType(cmd);
      this.cycleParams = this.extractCycleParams(command.parameters);
      
      // Se ci sono coordinate X, Y sono punti di applicazione del ciclo
      this.updatePositionFromParams(command.parameters);
      
      // Genera i punti per visualizzazione
      return this.generateFixedCycleResult(cmd, command.parameters);
      
    } else if (this.activeCycle && this.isFixedCycleContinuation(cmd, command.parameters)) {
      // Continuazione di un ciclo fisso esistente con nuove coordinate
      this.updatePositionFromParams(command.parameters);
      
      // Aggiorna i parametri del ciclo con eventuali nuovi valori
      this.updateCycleParams(command.parameters);
      
      // Genera i punti per questo punto del ciclo
      return this.generateFixedCycleResult(cmd, command.parameters);
      
    } else if (cmd === 'G80') {
      // Fine del ciclo fisso
      this.activeCycle = null;
      this.cycleParams = {};
      return null;
    }
    
    // Aggiorna la posizione per comandi di movimento normali
    if ((cmd === 'G0' || cmd === 'G1' || cmd === 'G2' || cmd === 'G3') && !this.activeCycle) {
      this.updatePositionFromParams(command.parameters);
    }
    
    return null;
  }
  
  /**
   * Verifica se il comando è l'inizio di un ciclo fisso
   */
  private isFixedCycleStart(cmd: string): boolean {
    return [
      'G81', 'G82', 'G83', 'G84', 'G85', 'G86', 'G87', 'G88', 'G89', 'G74'
    ].includes(cmd);
  }
  
  /**
   * Verifica se il comando è una continuazione di un ciclo fisso esistente
   */
  private isFixedCycleContinuation(cmd: string, params: Record<string, number>): boolean {
    // Un ciclo fisso continua quando c'è un comando G di movimento o
    // semplicemente nuove coordinate X, Y senza un comando G
    if (['G0', 'G1'].includes(cmd)) {
      return 'X' in params || 'Y' in params;
    }
    
    // Oppure potrebbe essere solo X, Y senza comando G
    return !cmd && ('X' in params || 'Y' in params);
  }
  
  /**
   * Determina il tipo di ciclo fisso dal comando G
   */
  private getFixedCycleType(cmd: string): FixedCycleType {
    switch (cmd) {
      case 'G81': return FixedCycleType.DRILLING;
      case 'G82': return FixedCycleType.DRILLING_DWELL;
      case 'G83': return FixedCycleType.PECK_DRILLING;
      case 'G84': return FixedCycleType.RIGHT_TAPPING;
      case 'G85': return FixedCycleType.BORING;
      case 'G86': return FixedCycleType.BORING_DWELL;
      case 'G87': return FixedCycleType.BACK_BORING;
      case 'G74': return FixedCycleType.LEFT_TAPPING;
      case 'G89': return FixedCycleType.BORING_WITH_RETRACT;
      default: return FixedCycleType.CUSTOM;
    }
  }
  
  /**
   * Estrae i parametri del ciclo dai parametri del comando
   */
  private extractCycleParams(params: Record<string, number>): FixedCycleParams {
    const cycleParams: FixedCycleParams = {};
    
    // Copia i parametri pertinenti
    if ('Z' in params) cycleParams.z = params.Z;
    if ('R' in params) cycleParams.r = params.R;
    if ('Q' in params) cycleParams.q = params.Q;
    if ('P' in params) cycleParams.p = params.P;
    if ('F' in params) cycleParams.f = params.F;
    if ('L' in params) cycleParams.l = params.L;
    
    // Parametri specifici per la filettatura
    if ('S' in params) (cycleParams as ThreadingCycleParams).s = params.S;
    if ('K' in params) (cycleParams as ThreadingCycleParams).d = params.K;
    
    // Parametri specifici per l'alesatura
    if ('I' in params) (cycleParams as BoringCycleParams).i = params.I;
    if ('J' in params) (cycleParams as BoringCycleParams).j = params.J;
    if ('K' in params) (cycleParams as BoringCycleParams).k = params.K;
    
    return cycleParams;
  }
  
  /**
   * Aggiorna i parametri del ciclo con nuovi valori
   */
  private updateCycleParams(params: Record<string, number>): void {
    if ('Z' in params) this.cycleParams.z = params.Z;
    if ('R' in params) this.cycleParams.r = params.R;
    if ('Q' in params) this.cycleParams.q = params.Q;
    if ('P' in params) this.cycleParams.p = params.P;
    if ('F' in params) this.cycleParams.f = params.F;
    if ('L' in params) this.cycleParams.l = params.L;
    
    // Aggiorna altri parametri specifici se necessario
  }
  
  /**
   * Aggiorna la posizione corrente dai parametri del comando
   */
  private updatePositionFromParams(params: Record<string, number>): void {
    let x = this.lastX;
    let y = this.lastY;
    let z = this.lastZ;
    
    if ('X' in params) {
      x = this.useIncrementalMode ? this.lastX + params.X : params.X;
    }
    if ('Y' in params) {
      y = this.useIncrementalMode ? this.lastY + params.Y : params.Y;
    }
    if ('Z' in params) {
      z = this.useIncrementalMode ? this.lastZ + params.Z : params.Z;
    }
    
    this.updatePosition(x, y, z);
    
    // Aggiorna anche le coordinate nel ciclo corrente
    if (this.activeCycle) {
      this.cycleParams.x = x;
      this.cycleParams.y = y;
    }
  }
  
  /**
   * Genera il risultato del ciclo fisso con i punti per la visualizzazione
   */
  private generateFixedCycleResult(cmd: string, params: Record<string, number>): FixedCycleResult {
    if (!this.activeCycle) {
      return {
        type: FixedCycleType.CUSTOM,
        params: {},
        gCode: cmd,
        points: [],
        isValid: false,
        error: 'Nessun ciclo fisso attivo'
      };
    }
    
    // Valori predefiniti
    const x = this.cycleParams.x ?? this.lastX;
    const y = this.cycleParams.y ?? this.lastY;
    const z = this.cycleParams.z ?? 0;
    const r = this.cycleParams.r ?? (this.lastZ + 5); // Piano di riferimento predefinito
    
    // Genera i punti del ciclo in base al tipo
    const points = this.generateCyclePoints(
      this.activeCycle,
      x,
      y,
      z,
      r,
      this.cycleParams
    );
    
    return {
      type: this.activeCycle,
      params: { ...this.cycleParams },
      gCode: cmd || 'CYCLE',
      points,
      isValid: points.length > 0
    };
  }
  
  /**
   * Genera i punti di percorso per la visualizzazione del ciclo fisso
   */
  private generateCyclePoints(
    cycleType: FixedCycleType,
    x: number,
    y: number,
    z: number,
    r: number,
    params: FixedCycleParams
  ): ToolpathPoint[] {
    const points: ToolpathPoint[] = [];
    
    switch (cycleType) {
      case FixedCycleType.DRILLING:
        // Ciclo di foratura semplice G81
        // 1. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        // 2. Foratura fino alla profondità finale
        points.push({ x, y, z, type: 'linear', feedRate: params.f });
        // 3. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        break;
      
      case FixedCycleType.DRILLING_DWELL:
        // Ciclo di foratura con sosta G82
        // 1. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        // 2. Foratura fino alla profondità finale
        points.push({ x, y, z, type: 'linear', feedRate: params.f });
        // 3. Sosta
        points.push({ x, y, z, type: 'dwell', dwell: params.p || 0 });
        // 4. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        break;
      
      case FixedCycleType.PECK_DRILLING:
        // Ciclo di foratura a rompitruciolo G83
        // 1. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        
        // Calcola i passi di foratura
        const depthIncrement = params.q || 5; // Incremento predefinito se non specificato
        let currentDepth = r - depthIncrement;
        
        // Assicurati di non superare la profondità finale
        while (currentDepth > z) {
          // Foratura fino alla profondità corrente
          points.push({ x, y, z: currentDepth, type: 'linear', feedRate: params.f });
          // Ritorno rapido al piano di riferimento
          points.push({ x, y, z: r, type: 'rapid' });
          // Rientro rapido alla profondità precedente
          points.push({ x, y, z: currentDepth, type: 'rapid' });
          
          // Calcola la prossima profondità
          currentDepth -= depthIncrement;
        }
        
        // Foratura finale fino alla profondità Z
        points.push({ x, y, z, type: 'linear', feedRate: params.f });
        // Ritorno rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        break;
      
      case FixedCycleType.RIGHT_TAPPING:
        // Ciclo di maschiatura destra G84
        // 1. Rapido al piano di riferimento
        points.push({ x, y, z: r, type: 'rapid' });
        // 2. Maschiatura fino alla profondità finale
        points.push({ x, y, z, type: 'linear', feedRate: params.f });
        // 3. Inversione rotazione mandrino (qui simuliamo con un punto di sosta)
        points.push({ x, y, z, type: 'dwell', dwell: 0.1 });
        // 4. Ritorno alla stessa velocità (importante per maschiatura)
        points.push({ x, y, z: r, type: 'linear', feedRate: params.f });
        break;
      
      // Implementa qui altri tipi di ciclo secondo necessità
      default:
        // Ciclo generico/sconosciuto - usa una foratura semplice come fallback
        points.push({ x, y, z: r, type: 'rapid' });
        points.push({ x, y, z, type: 'linear', feedRate: params.f });
        points.push({ x, y, z: r, type: 'rapid' });
        break;
    }
    
    return points;
  }
}

// Esporta un'istanza singleton del parser
export const fixedCyclesParser = new FixedCyclesParser();

/**
 * Funzione per riconoscere e convertire un blocco di G-code in un ciclo fisso
 * @param gcode Stringa del G-code da analizzare
 * @returns Risultato dell'analisi o null se non è un ciclo fisso
 */
export function parseFixedCycleFromGCode(gcode: string): FixedCycleResult | null {
  // Parsing semplificato del G-code
  const command: GCodeCommand = { command: '', parameters: {} };
  
  // Estrai il comando G
  const gMatch = gcode.match(/G\d+/);
  if (gMatch) {
    command.command = gMatch[0];
  }
  
  // Estrai i parametri
  const paramRegex = /([A-Z])([+-]?\d*\.?\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(gcode)) !== null) {
    const param = match[1];
    const value = parseFloat(match[2]);
    command.parameters[param] = value;
  }
  
  // Estrai eventuali commenti
  const commentMatch = gcode.match(/\(([^)]*)\)/);
  if (commentMatch) {
    command.comment = commentMatch[1];
  }
  
  // Ora analizza il comando per identificare un ciclo fisso
  return fixedCyclesParser.parseCommand(command);
}

/**
 * Funzione per generare i percorsi da visualizzare per un array di linee G-code
 * @param gcodeLines Array di stringhe G-code
 * @returns Array di punti del percorso per la visualizzazione
 */
export function generateFixedCycleToolpaths(gcodeLines: string[]): ToolpathPoint[] {
  // Resetta il parser all'inizio
  fixedCyclesParser.reset();
  
  // Array per accumulare tutti i punti generati
  const allPoints: ToolpathPoint[] = [];
  
  // Analizza ogni linea di G-code
  for (const line of gcodeLines) {
    const result = parseFixedCycleFromGCode(line.trim());
    
    if (result && result.isValid) {
      // Aggiungi i punti generati al percorso complessivo
      allPoints.push(...result.points);
    }
  }
  
  return allPoints;
}