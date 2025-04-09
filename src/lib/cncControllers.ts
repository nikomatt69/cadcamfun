/**
 * Libreria per la generazione di G-code e M-code specifici per diversi controlli CNC
 * Supporta controlli Fanuc e Heidenhain
 */

export type ControllerType = 'fanuc' | 'heidenhain' | 'generic';

/**
 * Interfaccia per i parametri di generazione G-code
 */
export interface GCodeGenerationParams {
  controller: ControllerType;
  programName?: string;
  toolNumber?: number;
  feedrate?: number;
  spindleSpeed?: number;
  coolant?: boolean;
  useAbsolutePositioning?: boolean;
  useMetricUnits?: boolean;
  workOffset?: number;
  safeHeight?: number;
  plungeRate?: number;
  useHighPrecision?: boolean;
  toleranceValue?: number;
  useRadiusCompensation?: boolean;
  radiusCompensationValue?: number;
  useToolLengthCompensation?: boolean;
  initialComment?: string;
  stockDimensions?: { x: number, y: number, z: number };
  material?: string;
  optimizeRapidMoves?: boolean;
  includeMachineSetup?: boolean;
}

/**
 * Interfaccia per il commento del G-code
 */
export interface GCodeComment {
  text: string;
  indent?: number;
  separator?: boolean;
}

/**
 * Formato del file di definizione dei codici CNC
 */
export interface CNCCodeDefinition {
  code: string;
  description: string;
  format: string;
  example: string;
  parameters?: { [key: string]: string };
  notes?: string;
  compatibility?: ControllerType[];
}

// Definizioni dei G-code comuni
export const COMMON_G_CODES: { [key: string]: CNCCodeDefinition } = {
  'G0': {
    code: 'G0',
    description: 'Movimento rapido',
    format: 'G0 X.. Y.. Z..',
    example: 'G0 X100 Y100 Z50',
    parameters: {
      'X': 'Coordinata X',
      'Y': 'Coordinata Y',
      'Z': 'Coordinata Z'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'G1': {
    code: 'G1',
    description: 'Movimento lineare a velocità controllata',
    format: 'G1 X.. Y.. Z.. F..',
    example: 'G1 X100 Y100 Z50 F1000',
    parameters: {
      'X': 'Coordinata X',
      'Y': 'Coordinata Y',
      'Z': 'Coordinata Z',
      'F': 'Velocità di avanzamento'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'G2': {
    code: 'G2',
    description: 'Interpolazione circolare in senso orario',
    format: 'G2 X.. Y.. I.. J.. F..',
    example: 'G2 X100 Y100 I10 J10 F1000',
    parameters: {
      'X': 'Coordinata X del punto finale',
      'Y': 'Coordinata Y del punto finale',
      'I': 'Offset X del centro rispetto al punto iniziale',
      'J': 'Offset Y del centro rispetto al punto iniziale',
      'R': 'Raggio (alternativa a I/J)',
      'F': 'Velocità di avanzamento'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'G3': {
    code: 'G3',
    description: 'Interpolazione circolare in senso antiorario',
    format: 'G3 X.. Y.. I.. J.. F..',
    example: 'G3 X100 Y100 I10 J10 F1000',
    parameters: {
      'X': 'Coordinata X del punto finale',
      'Y': 'Coordinata Y del punto finale',
      'I': 'Offset X del centro rispetto al punto iniziale',
      'J': 'Offset Y del centro rispetto al punto iniziale',
      'R': 'Raggio (alternativa a I/J)',
      'F': 'Velocità di avanzamento'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  }
};

// Definizioni dei G-code Fanuc
export const FANUC_G_CODES: { [key: string]: CNCCodeDefinition } = {
  ...COMMON_G_CODES,
  'G17': {
    code: 'G17',
    description: 'Selezione piano XY',
    format: 'G17',
    example: 'G17',
    compatibility: ['fanuc', 'generic']
  },
  'G18': {
    code: 'G18',
    description: 'Selezione piano XZ',
    format: 'G18',
    example: 'G18',
    compatibility: ['fanuc', 'generic']
  },
  'G19': {
    code: 'G19',
    description: 'Selezione piano YZ',
    format: 'G19',
    example: 'G19',
    compatibility: ['fanuc', 'generic']
  },
  'G20': {
    code: 'G20',
    description: 'Unità di misura in pollici',
    format: 'G20',
    example: 'G20',
    compatibility: ['fanuc', 'generic']
  },
  'G21': {
    code: 'G21',
    description: 'Unità di misura in millimetri',
    format: 'G21',
    example: 'G21',
    compatibility: ['fanuc', 'generic']
  },
  'G28': {
    code: 'G28',
    description: 'Ritorno al punto di riferimento',
    format: 'G28 X.. Y.. Z..',
    example: 'G28 X0 Y0 Z0',
    parameters: {
      'X': 'Coordinata X del punto intermedio',
      'Y': 'Coordinata Y del punto intermedio',
      'Z': 'Coordinata Z del punto intermedio'
    },
    compatibility: ['fanuc']
  },
  'G40': {
    code: 'G40',
    description: 'Annulla compensazione raggio utensile',
    format: 'G40',
    example: 'G40',
    compatibility: ['fanuc', 'generic']
  },
  'G41': {
    code: 'G41',
    description: 'Compensazione raggio utensile a sinistra',
    format: 'G41 D..',
    example: 'G41 D1',
    parameters: {
      'D': 'Numero compensazione raggio utensile'
    },
    compatibility: ['fanuc', 'generic']
  },
  'G42': {
    code: 'G42',
    description: 'Compensazione raggio utensile a destra',
    format: 'G42 D..',
    example: 'G42 D1',
    parameters: {
      'D': 'Numero compensazione raggio utensile'
    },
    compatibility: ['fanuc', 'generic']
  },
  'G43': {
    code: 'G43',
    description: 'Compensazione lunghezza utensile positiva',
    format: 'G43 H..',
    example: 'G43 H1',
    parameters: {
      'H': 'Numero compensazione lunghezza utensile'
    },
    compatibility: ['fanuc', 'generic']
  },
  'G49': {
    code: 'G49',
    description: 'Annulla compensazione lunghezza utensile',
    format: 'G49',
    example: 'G49',
    compatibility: ['fanuc', 'generic']
  },
  'G54': {
    code: 'G54',
    description: 'Sistema di coordinate 1',
    format: 'G54',
    example: 'G54',
    compatibility: ['fanuc', 'generic']
  },
  'G90': {
    code: 'G90',
    description: 'Programmazione in coordinate assolute',
    format: 'G90',
    example: 'G90',
    compatibility: ['fanuc', 'generic']
  },
  'G91': {
    code: 'G91',
    description: 'Programmazione in coordinate incrementali',
    format: 'G91',
    example: 'G91',
    compatibility: ['fanuc', 'generic']
  },
  'G94': {
    code: 'G94',
    description: 'Avanzamento in mm/min o pollici/min',
    format: 'G94',
    example: 'G94',
    compatibility: ['fanuc', 'generic']
  },
  'G95': {
    code: 'G95',
    description: 'Avanzamento in mm/giro o pollici/giro',
    format: 'G95',
    example: 'G95',
    compatibility: ['fanuc', 'generic']
  }
};

// Definizioni dei G-code Heidenhain (formato ISO)
export const HEIDENHAIN_G_CODES: { [key: string]: CNCCodeDefinition } = {
  ...COMMON_G_CODES,
  'G17': {
    code: 'G17',
    description: 'Selezione piano XY',
    format: 'G17',
    example: 'G17',
    compatibility: ['heidenhain', 'generic']
  },
  'G40': {
    code: 'G40',
    description: 'Annulla compensazione raggio utensile',
    format: 'G40',
    example: 'G40',
    compatibility: ['heidenhain', 'generic']
  },
  'G41': {
    code: 'G41',
    description: 'Compensazione raggio utensile a sinistra',
    format: 'G41 R..',
    example: 'G41 R5',
    parameters: {
      'R': 'Raggio utensile'
    },
    compatibility: ['heidenhain', 'generic']
  },
  'G42': {
    code: 'G42',
    description: 'Compensazione raggio utensile a destra',
    format: 'G42 R..',
    example: 'G42 R5',
    parameters: {
      'R': 'Raggio utensile'
    },
    compatibility: ['heidenhain', 'generic']
  },
  'G70': {
    code: 'G70',
    description: 'Unità di misura in pollici',
    format: 'G70',
    example: 'G70',
    compatibility: ['heidenhain']
  },
  'G71': {
    code: 'G71',
    description: 'Unità di misura in millimetri',
    format: 'G71',
    example: 'G71',
    compatibility: ['heidenhain']
  },
  'G90': {
    code: 'G90',
    description: 'Programmazione in coordinate assolute',
    format: 'G90',
    example: 'G90',
    compatibility: ['heidenhain', 'generic']
  },
  'G91': {
    code: 'G91',
    description: 'Programmazione in coordinate incrementali',
    format: 'G91',
    example: 'G91',
    compatibility: ['heidenhain', 'generic']
  }
};

// Definizioni dei codici M comuni
export const COMMON_M_CODES: { [key: string]: CNCCodeDefinition } = {
  'M0': {
    code: 'M0',
    description: 'Arresto programmato',
    format: 'M0',
    example: 'M0',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M1': {
    code: 'M1',
    description: 'Arresto opzionale',
    format: 'M1',
    example: 'M1',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M2': {
    code: 'M2',
    description: 'Fine programma',
    format: 'M2',
    example: 'M2',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M3': {
    code: 'M3',
    description: 'Rotazione mandrino oraria',
    format: 'M3 S..',
    example: 'M3 S1000',
    parameters: {
      'S': 'Velocità mandrino (giri/min)'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M4': {
    code: 'M4',
    description: 'Rotazione mandrino antioraria',
    format: 'M4 S..',
    example: 'M4 S1000',
    parameters: {
      'S': 'Velocità mandrino (giri/min)'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M5': {
    code: 'M5',
    description: 'Arresto mandrino',
    format: 'M5',
    example: 'M5',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M6': {
    code: 'M6',
    description: 'Cambio utensile',
    format: 'M6 T..',
    example: 'M6 T1',
    parameters: {
      'T': 'Numero utensile'
    },
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M8': {
    code: 'M8',
    description: 'Refrigerante acceso',
    format: 'M8',
    example: 'M8',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M9': {
    code: 'M9',
    description: 'Refrigerante spento',
    format: 'M9',
    example: 'M9',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  },
  'M30': {
    code: 'M30',
    description: 'Fine programma e reset',
    format: 'M30',
    example: 'M30',
    compatibility: ['fanuc', 'heidenhain', 'generic']
  }
};

// Definizioni dei codici M Fanuc
export const FANUC_M_CODES: { [key: string]: CNCCodeDefinition } = {
  ...COMMON_M_CODES,
  'M7': {
    code: 'M7',
    description: 'Refrigerante nebulizzato acceso',
    format: 'M7',
    example: 'M7',
    compatibility: ['fanuc', 'generic']
  },
  'M10': {
    code: 'M10',
    description: 'Bloccaggio asse acceso',
    format: 'M10',
    example: 'M10',
    compatibility: ['fanuc']
  },
  'M11': {
    code: 'M11',
    description: 'Bloccaggio asse spento',
    format: 'M11',
    example: 'M11',
    compatibility: ['fanuc']
  },
  'M19': {
    code: 'M19',
    description: 'Orientamento mandrino',
    format: 'M19',
    example: 'M19',
    compatibility: ['fanuc']
  },
  'M48': {
    code: 'M48',
    description: 'Abilita override avanzamento/velocità',
    format: 'M48',
    example: 'M48',
    compatibility: ['fanuc']
  },
  'M49': {
    code: 'M49',
    description: 'Disabilita override avanzamento/velocità',
    format: 'M49',
    example: 'M49',
    compatibility: ['fanuc']
  },
  'M98': {
    code: 'M98',
    description: 'Chiamata sottoprogramma',
    format: 'M98 P..',
    example: 'M98 P1000',
    parameters: {
      'P': 'Numero sottoprogramma'
    },
    compatibility: ['fanuc']
  },
  'M99': {
    code: 'M99',
    description: 'Fine sottoprogramma o salto',
    format: 'M99',
    example: 'M99',
    compatibility: ['fanuc']
  }
};

// Definizioni dei codici M Heidenhain
export const HEIDENHAIN_M_CODES: { [key: string]: CNCCodeDefinition } = {
  ...COMMON_M_CODES,
  'M17': {
    code: 'M17',
    description: 'Fine sottoprogramma',
    format: 'M17',
    example: 'M17',
    compatibility: ['heidenhain']
  },
  'M19': {
    code: 'M19',
    description: 'Orientamento mandrino',
    format: 'M19',
    example: 'M19',
    compatibility: ['heidenhain']
  },
  'M89': {
    code: 'M89',
    description: 'Ciclo modale',
    format: 'M89',
    example: 'M89',
    compatibility: ['heidenhain']
  },
  'M91': {
    code: 'M91',
    description: 'Nel blocco di posizionamento: coordinate riferite al punto zero macchina',
    format: 'M91',
    example: 'M91',
    compatibility: ['heidenhain']
  },
  'M92': {
    code: 'M92',
    description: 'Nel blocco di posizionamento: coordinate riferite a posizioni definite dal costruttore',
    format: 'M92',
    example: 'M92',
    compatibility: ['heidenhain']
  },
  'M94': {
    code: 'M94',
    description: 'Riduzione del valore visualizzato dell\'asse rotativo ad un valore inferiore a 360°',
    format: 'M94',
    example: 'M94',
    compatibility: ['heidenhain']
  },
  'M140': {
    code: 'M140',
    description: 'Distacco dal profilo nella direzione dell\'asse utensile',
    format: 'M140 MB..',
    example: 'M140 MB50',
    parameters: {
      'MB': 'Distanza massima di distacco'
    },
    compatibility: ['heidenhain']
  },
  'M144': {
    code: 'M144',
    description: 'Considerazione della cinematica della macchina nei blocchi ACTUAL/NOMINAL alla fine del blocco',
    format: 'M144',
    example: 'M144',
    compatibility: ['heidenhain']
  }
};

/**
 * Genera un'intestazione G-code per il controllo specificato
 * @param params Parametri di generazione
 * @returns Intestazione G-code
 */
export function generateGCodeHeader(params: GCodeGenerationParams): string {
  let header = '';
  const { controller, programName, toolNumber, initialComment } = params;
  
  // Aggiungi commento iniziale
  if (initialComment) {
    header += formatComment({ text: initialComment });
    header += formatComment({ text: '', separator: true });
  }
  
  // Intestazione specifica per controller
  switch (controller) {
    case 'fanuc':
      header += formatComment({ text: 'FANUC CONTROLLER', separator: true });
      if (programName) {
        header += `O${programName}\n`;
      }
      
      // Impostazioni di base
      header += 'G90 ; Absolute positioning\n';
      header += params.useMetricUnits ? 'G21 ; Metric units\n' : 'G20 ; Imperial units\n';
      header += 'G17 ; XY plane selection\n';
      
      // Work offset
      if (params.workOffset !== undefined) {
        header += `G${53 + params.workOffset} ; Work offset\n`;
      } else {
        header += 'G54 ; Default work offset\n';
      }
      
      // Tool setup
      if (toolNumber !== undefined) {
        header += `T${toolNumber} M6 ; Select tool ${toolNumber}\n`;
      }
      
      break;
      
    case 'heidenhain':
      header += formatComment({ text: 'HEIDENHAIN CONTROLLER', separator: true });
      if (programName) {
        header += `BEGIN PGM ${programName} MM\n`;
      }
      
      // Impostazioni di base
      header += params.useMetricUnits ? 'G71 ; Metric units\n' : 'G70 ; Imperial units\n';
      header += 'G90 ; Absolute coordinates\n';
      
      // Tool setup
      if (toolNumber !== undefined) {
        header += `TOOL CALL ${toolNumber} Z ; Call tool ${toolNumber}\n`;
      }
      
      // Alta precisione (se richiesta)
      if (params.useHighPrecision) {
        const tolerance = params.toleranceValue || 0.01;
        header += `CYCL DEF 32.0 TOLERANCE\n`;
        header += `CYCL DEF 32.1 T${tolerance}\n`;
      }
      
      break;
      
    default: // Generic
      header += formatComment({ text: 'GENERIC CNC CONTROLLER', separator: true });
      
      // Impostazioni di base
      header += 'G90 ; Absolute positioning\n';
      header += params.useMetricUnits ? 'G21 ; Metric units\n' : 'G20 ; Imperial units\n';
      
      // Tool setup
      if (toolNumber !== undefined) {
        header += `T${toolNumber} M6 ; Select tool ${toolNumber}\n`;
      }
  }
  
  // Impostazioni comuni
  
  // Refrigerante
  if (params.coolant) {
    header += 'M8 ; Coolant on\n';
  }
  
  // Velocità mandrino
  if (params.spindleSpeed) {
    header += `M3 S${params.spindleSpeed} ; Start spindle\n`;
  }
  
  return header;
}

/**
 * Genera un footer G-code per il controllo specificato
 * @param params Parametri di generazione
 * @returns Footer G-code
 */
export function generateGCodeFooter(params: GCodeGenerationParams): string {
  let footer = '';
  const { controller, safeHeight, programName } = params;
  
  // Movimenti finali comuni
  if (safeHeight !== undefined) {
    footer += `\nG0 Z${safeHeight} ; Move to safe height\n`;
  }
  
  // Refrigerante spento
  footer += 'M9 ; Coolant off\n';
  
  // Arresto mandrino
  footer += 'M5 ; Stop spindle\n';
  
  // Footer specifico per controller
  switch (controller) {
    case 'fanuc':
      footer += 'M30 ; Program end\n';
      footer += '%\n';
      break;
      
    case 'heidenhain':
      footer += 'M30 ; Program end\n';
      if (programName) {
        footer += `END PGM ${programName} MM\n`;
      }
      break;
      
    default: // Generic
      footer += 'M30 ; Program end\n';
  }
  
  return footer;
}

/**
 * Genera un movimento rapido (G0) nel formato corretto per il controller specificato
 * @param x Coordinata X
 * @param y Coordinata Y
 * @param z Coordinata Z
 * @param controller Tipo di controller
 * @param comment Commento opzionale
 * @returns Comando G-code
 */
export function generateRapidMove(x?: number, y?: number, z?: number, controller: ControllerType = 'fanuc', comment?: string): string {
  let command = '';
  
  switch (controller) {
    case 'fanuc':
    case 'generic':
      command = 'G0';
      if (x !== undefined) command += ` X${x.toFixed(3)}`;
      if (y !== undefined) command += ` Y${y.toFixed(3)}`;
      if (z !== undefined) command += ` Z${z.toFixed(3)}`;
      break;
      
    case 'heidenhain':
      // Heidenhain può usare L per movimenti rapidi
      if (z !== undefined && (x === undefined && y === undefined)) {
        // Solo movimento Z
        command = `L Z${z.toFixed(3)} R0 FMAX`;
      } else {
        command = 'L';
        if (x !== undefined) command += ` X${x.toFixed(3)}`;
        if (y !== undefined) command += ` Y${y.toFixed(3)}`;
        if (z !== undefined) command += ` Z${z.toFixed(3)}`;
        command += ' R0 FMAX';
      }
      break;
  }
  
  if (comment) {
    command += ` ; ${comment}`;
  }
  
  return command + '\n';
}

/**
 * Genera un movimento lineare (G1) nel formato corretto per il controller specificato
 * @param x Coordinata X
 * @param y Coordinata Y
 * @param z Coordinata Z
 * @param feedrate Velocità di avanzamento
 * @param controller Tipo di controller
 * @param comment Commento opzionale
 * @returns Comando G-code
 */
export function generateLinearMove(x?: number, y?: number, z?: number, feedrate?: number, controller: ControllerType = 'fanuc', comment?: string): string {
  let command = '';
  
  switch (controller) {
    case 'fanuc':
    case 'generic':
      command = 'G1';
      if (x !== undefined) command += ` X${x.toFixed(3)}`;
      if (y !== undefined) command += ` Y${y.toFixed(3)}`;
      if (z !== undefined) command += ` Z${z.toFixed(3)}`;
      if (feedrate !== undefined) command += ` F${feedrate}`;
      break;
      
    case 'heidenhain':
      command = 'L';
      if (x !== undefined) command += ` X${x.toFixed(3)}`;
      if (y !== undefined) command += ` Y${y.toFixed(3)}`;
      if (z !== undefined) command += ` Z${z.toFixed(3)}`;
      if (feedrate !== undefined) {
        command += ` F${feedrate}`;
      } else {
        command += ' FMAX';
      }
      command += ' R0';
      break;
  }
  
  if (comment) {
    command += ` ; ${comment}`;
  }
  
  return command + '\n';
}

/**
 * Genera un movimento circolare (G2/G3) nel formato corretto per il controller specificato
 * @param endX Coordinata X finale
 * @param endY Coordinata Y finale
 * @param centerI Offset X del centro rispetto al punto iniziale
 * @param centerJ Offset Y del centro rispetto al punto iniziale
 * @param clockwise Senso orario (true) o antiorario (false)
 * @param feedrate Velocità di avanzamento
 * @param controller Tipo di controller
 * @param comment Commento opzionale
 * @returns Comando G-code
 */
export function generateCircularMove(
  endX: number, 
  endY: number, 
  centerI: number, 
  centerJ: number, 
  clockwise: boolean = true, 
  feedrate?: number, 
  controller: ControllerType = 'fanuc', 
  comment?: string
): string {
  let command = '';
  
  switch (controller) {
    case 'fanuc':
    case 'generic':
      command = clockwise ? 'G2' : 'G3';
      command += ` X${endX.toFixed(3)} Y${endY.toFixed(3)} I${centerI.toFixed(3)} J${centerJ.toFixed(3)}`;
      if (feedrate !== undefined) command += ` F${feedrate}`;
      break;
      
    case 'heidenhain':
      // Heidenhain usa CR per il raggio e DR per la direzione
      const radius = Math.sqrt(centerI * centerI + centerJ * centerJ);
      command = 'CC';
      command += ` X${(endX - centerI).toFixed(3)} Y${(endY - centerJ).toFixed(3)}\n`;
      command += 'C';
      command += ` X${endX.toFixed(3)} Y${endY.toFixed(3)} DR${clockwise ? '-' : '+'}`;
      if (feedrate !== undefined) {
        command += ` F${feedrate}`;
      } else {
        command += ' FMAX';
      }
      break;
  }
  
  if (comment) {
    command += ` ; ${comment}`;
  }
  
  return command + '\n';
}

/**
 * Formatta un commento nel G-code
 * @param comment Parametri del commento
 * @returns Commento formattato
 */
export function formatComment(comment: GCodeComment): string {
  if (comment.separator) {
    return ';' + '-'.repeat(60) + '\n';
  }
  
  const indent = comment.indent ? ' '.repeat(comment.indent) : '';
  return `${indent}; ${comment.text}\n`;
}

/**
 * Genera un ciclo di foratura per il controller specificato
 * @param x Coordinata X
 * @param y Coordinata Y
 * @param z Profondità finale
 * @param retractHeight Altezza di ritorno
 * @param feedrate Velocità di avanzamento
 * @param controller Tipo di controller
 * @param dwell Tempo di sosta sul fondo (ms)
 * @returns Comando G-code
 */
export function generateDrillingCycle(
  x: number, 
  y: number, 
  z: number, 
  retractHeight: number, 
  feedrate: number, 
  controller: ControllerType = 'fanuc', 
  dwell?: number
): string {
  let command = '';
  
  switch (controller) {
    case 'fanuc':
      command = `G0 X${x.toFixed(3)} Y${y.toFixed(3)}\n`;
      command += `G0 Z${retractHeight.toFixed(3)}\n`;
      
      if (dwell !== undefined && dwell > 0) {
        command += `G82 Z${z.toFixed(3)} R${retractHeight.toFixed(3)} F${feedrate} P${dwell}\n`;
      } else {
        command += `G81 Z${z.toFixed(3)} R${retractHeight.toFixed(3)} F${feedrate}\n`;
      }
      break;
      
    case 'heidenhain':
      command += `CYCL DEF 200 DRILLING\n`;
      command += `  Q200=${retractHeight.toFixed(3)} ; Set-up clearance\n`;
      command += `  Q201=${(-Math.abs(z)).toFixed(3)} ; Depth\n`;
      command += `  Q206=${feedrate} ; Feed rate for plunging\n`;
      command += `  Q202=${Math.abs(z).toFixed(3)} ; Infeed depth\n`;
      command += `  Q210=0 ; Dwell time at top\n`;
      
      if (dwell !== undefined && dwell > 0) {
        command += `  Q211=${(dwell / 1000).toFixed(1)} ; Dwell time at bottom\n`;
      } else {
        command += `  Q211=0 ; Dwell time at bottom\n`;
      }
      
      command += `L X${x.toFixed(3)} Y${y.toFixed(3)} R0 FMAX M99\n`;
      break;
      
    default: // Generic
      command = `G0 X${x.toFixed(3)} Y${y.toFixed(3)}\n`;
      command += `G0 Z${retractHeight.toFixed(3)}\n`;
      
      if (dwell !== undefined && dwell > 0) {
        command += `G82 Z${z.toFixed(3)} R${retractHeight.toFixed(3)} F${feedrate} P${dwell}\n`;
      } else {
        command += `G81 Z${z.toFixed(3)} R${retractHeight.toFixed(3)} F${feedrate}\n`;
      }
  }
  
  return command;
}

/**
 * Genera un ciclo di contornatura per il controller specificato
 * @param points Array di punti [x, y]
 * @param z Profondità di taglio
 * @param safeZ Altezza di sicurezza
 * @param feedrate Velocità di avanzamento
 * @param plungeRate Velocità di entrata
 * @param controller Tipo di controller
 * @param useCompensation Utilizza compensazione raggio utensile
 * @param toolRadius Raggio utensile (per compensazione)
 * @param compensationDirection Direzione compensazione ('left' o 'right')
 * @returns Comando G-code
 */
export function generateContourCycle(
  points: number[][], 
  z: number, 
  safeZ: number, 
  feedrate: number, 
  plungeRate: number, 
  controller: ControllerType = 'fanuc',
  useCompensation: boolean = false,
  toolRadius?: number,
  compensationDirection: 'left' | 'right' = 'left'
): string {
  let command = '';
  
  if (points.length < 2) {
    return formatComment({ text: 'Contour requires at least 2 points' });
  }
  
  // Posizionamento al primo punto
  command += generateRapidMove(points[0][0], points[0][1], safeZ, controller, 'Move to start position');
  
  // Movimento di entrata
  command += generateLinearMove(undefined, undefined, z, plungeRate, controller, 'Plunge to depth');
  
  // Compensazione raggio utensile
  if (useCompensation && toolRadius !== undefined) {
    switch (controller) {
      case 'fanuc':
        command += compensationDirection === 'left' ? 
          `G41 D${toolRadius.toFixed(3)} ; Tool radius compensation left\n` : 
          `G42 D${toolRadius.toFixed(3)} ; Tool radius compensation right\n`;
        break;
        
      case 'heidenhain':
        if (compensationDirection === 'left') {
          command += `L X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} RL F${feedrate} ; Tool radius compensation left\n`;
        } else {
          command += `L X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} RR F${feedrate} ; Tool radius compensation right\n`;
        }
        break;
        
      default: // Generic
        command += compensationDirection === 'left' ? 
          `G41 D${toolRadius.toFixed(3)} ; Tool radius compensation left\n` : 
          `G42 D${toolRadius.toFixed(3)} ; Tool radius compensation right\n`;
    }
  }
  
  // Generazione dei movimenti tra i punti
  for (let i = 1; i < points.length; i++) {
    command += generateLinearMove(points[i][0], points[i][1], undefined, feedrate, controller, `Move to point ${i+1}`);
  }
  
  // Chiusura contorno se necessario
  if (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1]) {
    command += generateLinearMove(points[0][0], points[0][1], undefined, feedrate, controller, 'Close contour');
  }
  
  // Cancella compensazione raggio utensile
  if (useCompensation) {
    switch (controller) {
      case 'fanuc':
      case 'generic':
        command += 'G40 ; Cancel tool radius compensation\n';
        break;
        
      case 'heidenhain':
        command += 'L R0 ; Cancel tool radius compensation\n';
        break;
    }
  }
  
  // Ritiro
  command += generateRapidMove(undefined, undefined, safeZ, controller, 'Retract to safe height');
  
  return command;
}

/**
 * Funzione principale per generare un programma G-code completo da una configurazione
 * @param params Parametri di generazione
 * @param operations Array di funzioni che generano le operazioni
 * @returns Programma G-code completo
 */
export function generateGCodeProgram(
  params: GCodeGenerationParams,
  operations: ((controller: ControllerType) => string)[]
): string {
  let program = '';
  
  // Genera intestazione
  program += generateGCodeHeader(params);
  
  // Corpo del programma (operazioni)
  for (const operation of operations) {
    program += operation(params.controller);
  }
  
  // Genera footer
  program += generateGCodeFooter(params);
  
  return program;
}

/**
 * Converte un G-code generico in uno specifico per il controller desiderato
 * @param genericGcode G-code in formato generico
 * @param targetController Controller di destinazione
 * @returns G-code convertito
 */
export function convertGcode(genericGcode: string, targetController: ControllerType): string {
  let convertedGcode = '';
  
  // Dividi per linee per processare ogni comando
  const lines = genericGcode.split('\n');
  
  for (const line of lines) {
    // Ignora linee vuote
    if (line.trim() === '') {
      convertedGcode += '\n';
      continue;
    }
    
    // Preserva i commenti
    if (line.trim().startsWith(';')) {
      convertedGcode += line + '\n';
      continue;
    }
    
    // Estrai il comando principale (G/M/ecc.) e i parametri
    const match = line.match(/^([A-Z]\d+)/);
    
    if (!match) {
      // Preserva la riga se non contiene un comando riconoscibile
      convertedGcode += line + '\n';
      continue;
    }
    
    const command = match[1];
    
    // Estrai eventuali commenti alla fine della riga
    const commentMatch = line.match(/;(.*)$/);
    const comment = commentMatch ? commentMatch[1].trim() : undefined;
    
    // Converti in base al comando e al controller di destinazione
    switch (command) {
      case 'G0': {
        // Movimento rapido
        const x = parseFloat(line.match(/X([-\d.]+)/)?.[1] ?? '');
        const y = parseFloat(line.match(/Y([-\d.]+)/)?.[1] ?? '');
        const z = parseFloat(line.match(/Z([-\d.]+)/)?.[1] ?? '');
        
        convertedGcode += generateRapidMove(
          isNaN(x) ? undefined : x,
          isNaN(y) ? undefined : y,
          isNaN(z) ? undefined : z,
          targetController,
          comment
        );
        break;
      }
      
      case 'G1': {
        // Movimento lineare
        const x = parseFloat(line.match(/X([-\d.]+)/)?.[1] ?? '');
        const y = parseFloat(line.match(/Y([-\d.]+)/)?.[1] ?? '');
        const z = parseFloat(line.match(/Z([-\d.]+)/)?.[1] ?? '');
        const f = parseFloat(line.match(/F([\d.]+)/)?.[1] ?? '');
        
        convertedGcode += generateLinearMove(
          isNaN(x) ? undefined : x,
          isNaN(y) ? undefined : y,
          isNaN(z) ? undefined : z,
          isNaN(f) ? undefined : f,
          targetController,
          comment
        );
        break;
      }
      
      // Altri comandi...
      
      default:
        // Per comandi non gestiti specificamente, mantieni la riga originale
        convertedGcode += line + '\n';
    }
  }
  
  return convertedGcode;
} 