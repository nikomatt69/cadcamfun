import { convertGcode, generateGCodeHeader, generateGCodeFooter, ControllerType } from './cncControllers';

/**
 * Converte G-code generato da unifiedGeometryCalculator.ts nei formati Fanuc e Heidenhain
 */
export interface GCodeConversionOptions {
  controller: ControllerType;
  useAbsoluteCoordinates?: boolean;
  useMetricUnits?: boolean;
  spindleSpeed?: number;
  feedrate?: number;
  plungerate?: number;
  safeHeight?: number;
  toolNumber?: number;
  programName?: string;
  optimizeRapidMoves?: boolean;
  includeComments?: boolean;
  coolantOn?: boolean;
}

/**
 * Converte G-code generato dal generatore di geometrie unificate in un formato specifico per controllo Fanuc o Heidenhain
 * @param genericGcode G-code generato dal unifiedGeometryCalculator.ts
 * @param options Opzioni di conversione
 * @returns G-code adattato per il controller specificato
 */
export function convertUnifiedGcode(genericGcode: string, options: GCodeConversionOptions): string {
  // Estrai metadati dal g-code originale
  const metadataLines: string[] = [];
  const operationLines: string[] = [];
  const footerLines: string[] = [];
  
  let currentSection = 'metadata';
  
  // Dividi il g-code in sezioni
  genericGcode.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    
    // Ignora linee vuote
    if (trimmedLine === '') {
      return;
    }
    
    // Identifica la sezione dalla riga del g-code
    if (trimmedLine.includes('=== Z Level:')) {
      currentSection = 'operations';
    } else if (trimmedLine.includes('End of program') || trimmedLine.includes('Move to safe height')) {
      currentSection = 'footer';
    }
    
    // Memorizza la riga nella sezione appropriata
    switch (currentSection) {
      case 'metadata':
        metadataLines.push(line);
        break;
      case 'operations':
        operationLines.push(line);
        break;
      case 'footer':
        footerLines.push(line);
        break;
    }
  });
  
  // Estrai informazioni rilevanti dai metadati per usarli nella conversione
  const materialMatch = metadataLines.join('\n').match(/Material: ([^\n]+)/);
  const toolMatch = metadataLines.join('\n').match(/Tool: ([^\n]+)/);
  const dateMatch = metadataLines.join('\n').match(/Date: ([^\n]+)/);
  const operationMatch = metadataLines.join('\n').match(/Operation: ([^\n]+)/);
  
  // Prepara i parametri del nuovo g-code
  const headerParams = {
    controller: options.controller,
    programName: options.programName || 'CAD_CAM',
    toolNumber: options.toolNumber,
    spindleSpeed: options.spindleSpeed || 12000,
    coolant: options.coolantOn || true,
    useAbsolutePositioning: options.useAbsoluteCoordinates || true,
    useMetricUnits: options.useMetricUnits || true,
    safeHeight: options.safeHeight || 30,
    initialComment: generateInitialComment(
      materialMatch ? materialMatch[1] : 'Unknown',
      toolMatch ? toolMatch[1] : 'Unknown',
      operationMatch ? operationMatch[1] : 'Unknown',
      dateMatch ? dateMatch[1] : new Date().toISOString()
    )
  };
  
  // Genera intestazione per il controller selezionato
  let convertedGcode = generateGCodeHeader(headerParams);
  
  // Converti le operazioni
  let operationsGcode = operationLines.join('\n');
  operationsGcode = convertGcode(operationsGcode, options.controller);
  
  // Aggiungi le operazioni al g-code convertito
  convertedGcode += operationsGcode + '\n';
  
  // Genera footer per il controller selezionato
  convertedGcode += generateGCodeFooter(headerParams);
  
  return convertedGcode;
}

/**
 * Genera un commento iniziale con informazioni sul programma
 */
function generateInitialComment(material: string, tool: string, operation: string, date: string): string {
  return `CAD/CAM SYSTEM - Generated Mill G-code with AI assistance
Operation: ${operation}
Material: ${material}
Tool: ${tool}
Date: ${date}`;
}

/**
 * Ottimizza il G-code per un controller specifico
 * @param gcode G-code da ottimizzare
 * @param options Opzioni di ottimizzazione
 * @returns G-code ottimizzato
 */
export function optimizeGcode(gcode: string, options: GCodeConversionOptions): string {
  let optimizedGcode = '';
  let lines = gcode.split('\n');
  let lastRapidZ = 0;
  let lastX: number | undefined = undefined;
  let lastY: number | undefined = undefined;
  let lastZ: number | undefined = undefined;
  
  // Salta le linee vuote e i commenti
  lines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed !== '' && (!options.includeComments || !trimmed.startsWith(';'));
  });
  
  // Ottimizzazione dei movimenti rapidi
  if (options.optimizeRapidMoves) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Conserva commenti se richiesto
      if (line.trim().startsWith(';') && options.includeComments) {
        optimizedGcode += line + '\n';
        continue;
      }
      
      // Identifica i movimenti rapidi (G0)
      if (line.trim().startsWith('G0')) {
        const xMatch = line.match(/X([-\d.]+)/);
        const yMatch = line.match(/Y([-\d.]+)/);
        const zMatch = line.match(/Z([-\d.]+)/);
        
        const x = xMatch ? parseFloat(xMatch[1]) : undefined;
        const y = yMatch ? parseFloat(yMatch[1]) : undefined;
        const z = zMatch ? parseFloat(zMatch[1]) : undefined;
        
        // Ottimizza movimenti Z
        if (z !== undefined && z > lastRapidZ && (lastX === x && lastY === y)) {
          // Se è solo un movimento verso l'alto che torna alla stessa posizione XY, 
          // aggiorna lastRapidZ ma non aggiungere alla lista
          lastRapidZ = z;
          continue;
        }
        
        // Aggiorna le ultime posizioni conosciute
        if (x !== undefined) lastX = x;
        if (y !== undefined) lastY = y;
        if (z !== undefined) lastZ = z;
      }
      
      optimizedGcode += line + '\n';
    }
  } else {
    // Se l'ottimizzazione non è richiesta, restituisci il G-code originale
    optimizedGcode = lines.join('\n') + '\n';
  }
  
  return optimizedGcode;
}

/**
 * Verifica se il G-code contiene movimenti che potrebbero essere pericolosi
 * @param gcode G-code da verificare
 * @returns Lista di avvertimenti
 */
export function validateGcode(gcode: string): string[] {
  const warnings: string[] = [];
  
  // Dividi per linee
  const lines = gcode.split('\n');
  
  // Controlla se il G-code contiene un ritorno alla posizione sicura
  const hasSafeReturn = lines.some(line => 
    line.includes('G0 Z') && 
    parseFloat(line.match(/Z([-\d.]+)/)?.[1] || '0') > 10
  );
  
  if (!hasSafeReturn) {
    warnings.push('Il G-code non contiene un ritorno ad una posizione Z sicura');
  }
  
  // Controlla se il mandrino viene fermato
  const hasSpindleStop = lines.some(line => line.includes('M5'));
  
  if (!hasSpindleStop) {
    warnings.push('Il G-code non ferma il mandrino (M5)');
  }
  
  // Controlla se il refrigerante viene spento
  const hasCoolantOff = lines.some(line => line.includes('M9'));
  
  if (!hasCoolantOff) {
    warnings.push('Il G-code non spegne il refrigerante (M9)');
  }
  
  // Controlla se ci sono movimenti rapidi verso il basso che potrebbero causare collisioni
  let lastZ: number | undefined = undefined;
  
  for (const line of lines) {
    if (line.trim().startsWith('G0')) {
      const zMatch = line.match(/Z([-\d.]+)/);
      
      if (zMatch) {
        const z = parseFloat(zMatch[1]);
        
        // Se è un movimento rapido verso il basso di più di 5mm
        if (lastZ !== undefined && z < lastZ && (lastZ - z) > 5) {
          warnings.push(`Movimento rapido verso il basso potenzialmente pericoloso: ${line}`);
        }
        
        lastZ = z;
      }
    }
  }
  
  return warnings;
}

/**
 * Genera un riepilogo statistico del G-code
 * @param gcode G-code da analizzare
 * @returns Statistiche del G-code
 */
export function analyzeGcode(gcode: string): object {
  const stats = {
    totalLines: 0,
    comments: 0,
    rapidMoves: 0,
    linearMoves: 0,
    arcMoves: 0,
    totalDistance: 0,
    estimatedTime: 0,
    feedrates: new Set<number>(),
    maxZ: -Infinity,
    minZ: Infinity,
    warnings: [] as string[]
  };
  
  const lines = gcode.split('\n');
  stats.totalLines = lines.length;
  
  // Calcola la distanza totale e il tempo stimato
  let lastX = 0, lastY = 0, lastZ = 0;
  let lastFeedrate = 0;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Conta i commenti
    if (trimmedLine.startsWith(';')) {
      stats.comments++;
      continue;
    }
    
    // Analizza i movimenti
    if (trimmedLine.startsWith('G0')) {
      stats.rapidMoves++;
      
      // Estrai le coordinate
      const xMatch = trimmedLine.match(/X([-\d.]+)/);
      const yMatch = trimmedLine.match(/Y([-\d.]+)/);
      const zMatch = trimmedLine.match(/Z([-\d.]+)/);
      
      const x = xMatch ? parseFloat(xMatch[1]) : lastX;
      const y = yMatch ? parseFloat(yMatch[1]) : lastY;
      const z = zMatch ? parseFloat(zMatch[1]) : lastZ;
      
      // Calcola la distanza
      const distance = Math.sqrt(
        Math.pow(x - lastX, 2) + 
        Math.pow(y - lastY, 2) + 
        Math.pow(z - lastZ, 2)
      );
      
      stats.totalDistance += distance;
      
      // Aggiorna le ultime posizioni
      lastX = x;
      lastY = y;
      lastZ = z;
      
      // Aggiorna Z min/max
      if (z > stats.maxZ) stats.maxZ = z;
      if (z < stats.minZ) stats.minZ = z;
      
    } else if (trimmedLine.startsWith('G1')) {
      stats.linearMoves++;
      
      // Estrai le coordinate e la velocità
      const xMatch = trimmedLine.match(/X([-\d.]+)/);
      const yMatch = trimmedLine.match(/Y([-\d.]+)/);
      const zMatch = trimmedLine.match(/Z([-\d.]+)/);
      const fMatch = trimmedLine.match(/F([\d.]+)/);
      
      const x = xMatch ? parseFloat(xMatch[1]) : lastX;
      const y = yMatch ? parseFloat(yMatch[1]) : lastY;
      const z = zMatch ? parseFloat(zMatch[1]) : lastZ;
      const f = fMatch ? parseFloat(fMatch[1]) : lastFeedrate;
      
      // Memorizza la velocità
      if (f > 0) {
        stats.feedrates.add(f);
        lastFeedrate = f;
      }
      
      // Calcola la distanza
      const distance = Math.sqrt(
        Math.pow(x - lastX, 2) + 
        Math.pow(y - lastY, 2) + 
        Math.pow(z - lastZ, 2)
      );
      
      stats.totalDistance += distance;
      
      // Calcola il tempo di lavorazione (in secondi)
      if (f > 0) {
        stats.estimatedTime += (distance / f) * 60;
      }
      
      // Aggiorna le ultime posizioni
      lastX = x;
      lastY = y;
      lastZ = z;
      
      // Aggiorna Z min/max
      if (z > stats.maxZ) stats.maxZ = z;
      if (z < stats.minZ) stats.minZ = z;
      
    } else if (trimmedLine.startsWith('G2') || trimmedLine.startsWith('G3')) {
      stats.arcMoves++;
      
      // Per i movimenti ad arco, l'approssimazione della distanza è complessa
      // per una stima semplice, usiamo le coordinate finali
      const xMatch = trimmedLine.match(/X([-\d.]+)/);
      const yMatch = trimmedLine.match(/Y([-\d.]+)/);
      const fMatch = trimmedLine.match(/F([\d.]+)/);
      
      const x = xMatch ? parseFloat(xMatch[1]) : lastX;
      const y = yMatch ? parseFloat(yMatch[1]) : lastY;
      const f = fMatch ? parseFloat(fMatch[1]) : lastFeedrate;
      
      // Memorizza la velocità
      if (f > 0) {
        stats.feedrates.add(f);
        lastFeedrate = f;
      }
      
      // Calcola la distanza lineare (approssimazione)
      const linearDistance = Math.sqrt(
        Math.pow(x - lastX, 2) + 
        Math.pow(y - lastY, 2)
      );
      
      // Approssima la distanza dell'arco (assumendo un semicerchio)
      const arcDistance = linearDistance * Math.PI / 2;
      
      stats.totalDistance += arcDistance;
      
      // Calcola il tempo di lavorazione (in secondi)
      if (f > 0) {
        stats.estimatedTime += (arcDistance / f) * 60;
      }
      
      // Aggiorna le ultime posizioni
      lastX = x;
      lastY = y;
    }
  }
  
  // Verifica la validità del G-code
  stats.warnings = validateGcode(gcode);
  
  // Formatta il risultato per migliorare la leggibilità
  return {
    totalLines: stats.totalLines,
    comments: stats.comments,
    moves: {
      rapid: stats.rapidMoves,
      linear: stats.linearMoves,
      arc: stats.arcMoves,
      total: stats.rapidMoves + stats.linearMoves + stats.arcMoves
    },
    distance: {
      total: parseFloat(stats.totalDistance.toFixed(2)),
      unit: 'mm'
    },
    time: {
      estimated: parseFloat((stats.estimatedTime / 60).toFixed(2)), // in minuti
      unit: 'minutes'
    },
    feedrates: Array.from(stats.feedrates).sort((a, b) => a - b),
    zRange: {
      min: stats.minZ === Infinity ? 'N/A' : stats.minZ.toFixed(2),
      max: stats.maxZ === -Infinity ? 'N/A' : stats.maxZ.toFixed(2),
      unit: 'mm'
    },
    warnings: stats.warnings
  };
} 