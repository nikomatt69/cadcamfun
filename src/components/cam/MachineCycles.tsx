import React, { useState } from 'react';

export interface CycleParameter {
  name: string;
  label: string;
  type: 'number' | 'select' | 'checkbox';
  defaultValue: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  unit?: string;
  description?: string;
}

export interface CycleTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  controllerTypes: ('fanuc' | 'heidenhain')[];
  parameters: CycleParameter[];
  generateCode: (params: Record<string, any>, controllerType: 'fanuc' | 'heidenhain') => string;
}

interface MachineCyclesProps {
  controllerType: 'fanuc' | 'heidenhain';
  onCycleCodeGenerated: (code: string) => void;
}

const MachineCycles: React.FC<MachineCyclesProps> = ({ controllerType, onCycleCodeGenerated }) => {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [cycleParams, setCycleParams] = useState<Record<string, any>>({});
  const [previewCode, setPreviewCode] = useState<string>('');

  // Collezione di cicli predefiniti
  const cycleTemplates: CycleTemplate[] = [
    // Ciclo di foratura semplice
    {
      id: 'simple-drilling',
      name: 'Foratura Semplice',
      description: 'Ciclo di foratura base con profondità e avanzamento',
      icon: <DrillIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'drillDiameter',
          label: 'Diametro Punta',
          type: 'number',
          defaultValue: 8,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della punta da utilizzare'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 20,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale di foratura'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la foratura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 1000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'retractHeight',
          label: 'Altezza di Ritorno',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Altezza di ritorno della punta dopo la foratura'
        },
        {
          name: 'dwellTime',
          label: 'Tempo di Sosta',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 100,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta sul fondo (0 per nessuna sosta)'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI FORATURA SEMPLICE)
(DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z${params.retractHeight} H1
S${params.spindleSpeed} M3
G00 X0 Y0
G99 G81 R${params.retractHeight} Z-${params.depth} F${params.feedrate} P${params.dwellTime * 1000}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z${params.retractHeight}
M5`;
        } else {
          return `; CICLO DI FORATURA SEMPLICE
; DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+${params.retractHeight} R0 FMAX
CYCL DEF 200 FORATURA
  Q200=${params.retractHeight}  ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q202=${params.depth}          ; PROF. INCREMENTO
  Q210=0                        ; TEMPO ATTESA SOPRA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q211=${params.dwellTime}      ; TEMPO ATTESA SOTTO
L X+0 Y+0 R0 FMAX M99
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+${params.retractHeight} FMAX
M5`;
        }
      }
    },
    
    // Ciclo di tasca rettangolare
    {
      id: 'rectangular-pocket',
      name: 'Tasca Rettangolare',
      description: 'Ciclo per la fresatura di una tasca rettangolare',
      icon: <PocketIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'pocketWidth',
          label: 'Larghezza Tasca',
          type: 'number',
          defaultValue: 50,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza della tasca lungo l\'asse X'
        },
        {
          name: 'pocketLength',
          label: 'Lunghezza Tasca',
          type: 'number',
          defaultValue: 80,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Lunghezza della tasca lungo l\'asse Y'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della tasca'
        },
        {
          name: 'stepdown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di passata per ogni incremento'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 800,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 300,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'cornerRadius',
          label: 'Raggio Angoli',
          type: 'number',
          defaultValue: 5,
          min: 0,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Raggio degli angoli della tasca (0 per angoli vivi)'
        },
        {
          name: 'finishAllowance',
          label: 'Sovrametallo Finitura',
          type: 'number',
          defaultValue: 0.2,
          min: 0,
          max: 10,
          step: 0.05,
          unit: 'mm',
          description: 'Sovrametallo lasciato per la finitura'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI TASCA RETTANGOLARE)
(DIMENSIONI: ${params.pocketWidth}x${params.pocketLength}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X${-params.pocketWidth/2 + params.toolDiameter/2 + params.finishAllowance} Y${-params.pocketLength/2 + params.toolDiameter/2 + params.finishAllowance}
${Array.from({ length: Math.ceil(params.depth / params.stepdown) }).map((_, i) => {
  const currentDepth = Math.min((i + 1) * params.stepdown, params.depth);
  return `
(PASSATA ${i + 1} - PROFONDITA: ${currentDepth}mm)
G01 Z-${currentDepth} F${params.plungeFeedrate}
G01 X${params.pocketWidth/2 - params.toolDiameter/2 - params.finishAllowance} F${params.feedrate}
G01 Y${params.pocketLength/2 - params.toolDiameter/2 - params.finishAllowance}
G01 X${-params.pocketWidth/2 + params.toolDiameter/2 + params.finishAllowance}
G01 Y${-params.pocketLength/2 + params.toolDiameter/2 + params.finishAllowance}`;
}).join('')}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI TASCA RETTANGOLARE
; DIMENSIONI: ${params.pocketWidth}x${params.pocketLength}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 251 TASCA RETTANGOLARE
  Q215=0                        ; TIPO LAVORAZIONE
  Q218=${params.pocketWidth}    ; LUNGHEZZA LATO 1
  Q219=${params.pocketLength}   ; LUNGHEZZA LATO 2
  Q220=${params.cornerRadius}   ; RAGGIO SPIGOLO
  Q368=${params.finishAllowance}; QUOTA LATERALE CONS.
  Q224=0                        ; ROTAZIONE
  Q201=-${params.depth}         ; PROFONDITA
  Q367=0                        ; POSIZIONE TASCA
  Q202=${params.stepdown}       ; PROF. INCREMENTO
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q206=${params.plungeFeedrate} ; AVANZ. INCREMENTO
  Q385=${params.feedrate}       ; AVANZAMENTO FINITURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q351=+1                       ; MODO FRESATURA
  Q370=1                        ; SOVRAPP. TRAIETT.
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di contornatura
    {
      id: 'contour-milling',
      name: 'Contornatura',
      description: 'Ciclo per la fresatura di un profilo esterno o interno',
      icon: <ContourIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'contourType',
          label: 'Tipo Contorno',
          type: 'select',
          defaultValue: 'external',
          options: [
            { value: 'external', label: 'Esterno (a destra)' },
            { value: 'internal', label: 'Interno (a sinistra)' }
          ],
          description: 'Tipo di contorno: esterno o interno'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale del contorno'
        },
        {
          name: 'stepdown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di passata per ogni incremento'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 800,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 300,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'approachDistance',
          label: 'Distanza Approccio',
          type: 'number',
          defaultValue: 5,
          min: 0,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Distanza di approccio al contorno'
        },
        {
          name: 'useToolCompensation',
          label: 'Usa Compensazione Utensile',
          type: 'checkbox',
          defaultValue: true,
          description: 'Attiva la compensazione del raggio utensile'
        }
      ],
      generateCode: (params, controllerType) => {
        const compensationCode = params.contourType === 'external' 
          ? (controllerType === 'fanuc' ? 'G42' : 'RR')
          : (controllerType === 'fanuc' ? 'G41' : 'RL');
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI CONTORNATURA ${params.contourType === 'external' ? 'ESTERNA' : 'INTERNA'})
(PROFONDITA: ${params.depth}mm, PASSATE: ${Math.ceil(params.depth / params.stepdown)})
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
${Array.from({ length: Math.ceil(params.depth / params.stepdown) }).map((_, i) => {
  const currentDepth = Math.min((i + 1) * params.stepdown, params.depth);
  return `
(PASSATA ${i + 1} - PROFONDITA: ${currentDepth}mm)
G00 X${-params.approachDistance} Y0
G00 Z5
G01 Z-${currentDepth} F${params.plungeFeedrate}
${params.useToolCompensation ? `${compensationCode} D1` : ''}
G01 X0 Y0 F${params.feedrate}
G01 X50
G01 Y50
G01 X0
G01 Y0
${params.useToolCompensation ? 'G40' : ''}
G00 Z5`;
}).join('')}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI CONTORNATURA ${params.contourType === 'external' ? 'ESTERNA' : 'INTERNA'}
; PROFONDITA: ${params.depth}mm, PASSATE: ${Math.ceil(params.depth / params.stepdown)}
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
${Array.from({ length: Math.ceil(params.depth / params.stepdown) }).map((_, i) => {
  const currentDepth = Math.min((i + 1) * params.stepdown, params.depth);
  return `
; PASSATA ${i + 1} - PROFONDITA: ${currentDepth}mm
L X-${params.approachDistance} Y+0 R0 FMAX
L Z+5 R0 FMAX
L Z-${currentDepth} F${params.plungeFeedrate}
${params.useToolCompensation ? `L ${compensationCode} R${params.toolDiameter/2}` : ''}
L X+0 Y+0 F${params.feedrate}
L X+50
L Y+50
L X+0
L Y+0
${params.useToolCompensation ? 'L R0' : ''}
L Z+5 FMAX`;
}).join('')}
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di filettatura
    {
      id: 'tapping-cycle',
      name: 'Maschiatura',
      description: 'Ciclo di maschiatura per filettature metriche',
      icon: <TapIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'threadSize',
          label: 'Dimensione Filetto',
          type: 'select',
          defaultValue: 'M8',
          options: [
            { value: 'M3', label: 'M3 (passo 0.5mm)' },
            { value: 'M4', label: 'M4 (passo 0.7mm)' },
            { value: 'M5', label: 'M5 (passo 0.8mm)' },
            { value: 'M6', label: 'M6 (passo 1.0mm)' },
            { value: 'M8', label: 'M8 (passo 1.25mm)' },
            { value: 'M10', label: 'M10 (passo 1.5mm)' },
            { value: 'M12', label: 'M12 (passo 1.75mm)' }
          ],
          description: 'Dimensione della filettatura metrica'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 20,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della filettatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 500,
          min: 1,
          max: 10000,
          step: 10,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'rigidTapping',
          label: 'Maschiatura Rigida',
          type: 'checkbox',
          defaultValue: true,
          description: 'Utilizza la modalità di maschiatura rigida (sincronizzata)'
        },
        {
          name: 'chamferDepth',
          label: 'Profondità Smusso',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità dello smusso all\'imbocco del filetto'
        }
      ],
      generateCode: (params, controllerType) => {
        // Determina il passo in base alla dimensione del filetto
        const threadPitchMap: Record<string, number> = {
          'M3': 0.5,
          'M4': 0.7,
          'M5': 0.8,
          'M6': 1.0,
          'M8': 1.25,
          'M10': 1.5,
          'M12': 1.75
        };
        const pitch = threadPitchMap[params.threadSize];
        const feedrate = params.spindleSpeed * pitch; // Feedrate per maschiatura
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI MASCHIATURA ${params.threadSize})
(PROFONDITA: ${params.depth}mm, PASSO: ${pitch}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
${params.rigidTapping ? 'M29 S' + params.spindleSpeed + ' (MASCHIATURA RIGIDA)' : 'S' + params.spindleSpeed + ' M3'}
G00 X0 Y0
G00 Z5
G84 R5 Z-${params.depth} F${feedrate} ${params.rigidTapping ? '' : 'P100'}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M5`;
        } else {
          return `; CICLO DI MASCHIATURA ${params.threadSize}
; PROFONDITA: ${params.depth}mm, PASSO: ${pitch}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 207 MASCHIATURA RIGID
  Q200=2                        ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA FILETTO
  Q239=${pitch}                 ; PASSO FILETTATURA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // NUOVI CICLI AGGIUNTI
    
    // Ciclo di foratura profonda
    {
      id: 'deep-drilling',
      name: 'Foratura Profonda',
      description: 'Ciclo di foratura profonda con evacuazione trucioli',
      icon: <DeepDrillIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'drillDiameter',
          label: 'Diametro Punta',
          type: 'number',
          defaultValue: 8,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della punta da utilizzare'
        },
        {
          name: 'depth',
          label: 'Profondità Totale',
          type: 'number',
          defaultValue: 80,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale del foro'
        },
        {
          name: 'peckDepth',
          label: 'Profondità Incremento',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di ogni incremento'
        },
        {
          name: 'retractDistance',
          label: 'Distanza Ritorno',
          type: 'number',
          defaultValue: 3,
          min: 0.1,
          max: 50,
          step: 0.1,
          unit: 'mm',
          description: 'Distanza di ritorno per evacuazione trucioli'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 120,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la foratura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 1200,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'dwellAtBottom',
          label: 'Sosta sul Fondo',
          type: 'number',
          defaultValue: 0.5,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta sul fondo di ogni incremento'
        },
        {
          name: 'useChipBreaking',
          label: 'Usa Rottura Truciolo',
          type: 'checkbox',
          defaultValue: true,
          description: 'Attiva la rottura trucioli durante la foratura'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI FORATURA PROFONDA)
(DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
${params.useChipBreaking ? 
  `G83 R5 Z-${params.depth} Q${params.peckDepth} F${params.feedrate} K0 P${params.dwellAtBottom * 1000}` : 
  `G73 R${params.retractDistance} Z-${params.depth} Q${params.peckDepth} F${params.feedrate} K0 P${params.dwellAtBottom * 1000}`}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FORATURA PROFONDA
; DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF ${params.useChipBreaking ? '203 FORATURA UNIVERS' : '200 FORATURA'}
  Q200=2                        ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q202=${params.peckDepth}      ; PROF. INCREMENTO
  ${params.useChipBreaking ? `Q210=0                        ; TEMPO ATTESA SOPRA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q212=${params.retractDistance}; VALORE DA TOGLIERE
  Q213=3                        ; N. ROTTURE TRUCIOLO
  Q205=1                        ; MIN. PROF. INCREMENTO
  Q211=${params.dwellAtBottom}  ; TEMPO ATTESA SOTTO
  Q208=500                      ; AVANZAM. RITORNO
  Q256=${params.retractDistance}; RITIRO ROTT.TRUCIOLO` : 
  `Q210=0                        ; TEMPO ATTESA SOPRA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q211=${params.dwellAtBottom}  ; TEMPO ATTESA SOTTO`}
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di fresatura di cave
    {
      id: 'slot-milling',
      name: 'Fresatura Cave',
      description: 'Ciclo per la fresatura di cave lineari',
      icon: <SlotIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 8,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'slotLength',
          label: 'Lunghezza Cava',
          type: 'number',
          defaultValue: 50,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Lunghezza della cava'
        },
        {
          name: 'slotWidth',
          label: 'Larghezza Cava',
          type: 'number',
          defaultValue: 12,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza della cava'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della cava'
        },
        {
          name: 'stepdown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 3,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di passata per ogni incremento'
        },
        {
          name: 'stepover',
          label: 'Incremento Laterale',
          type: 'number',
          defaultValue: 4,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Incremento laterale tra passate'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 600,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 300,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3500,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'angle',
          label: 'Angolo',
          type: 'number',
          defaultValue: 0,
          min: -360,
          max: 360,
          step: 1,
          unit: 'gradi',
          description: 'Angolo della cava rispetto all\'asse X'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          // Verifica se la larghezza della cava è maggiore del diametro dell'utensile
          const needsMultiplePasses = params.slotWidth > params.toolDiameter;
          const numberOfPasses = needsMultiplePasses ? Math.ceil((params.slotWidth - params.toolDiameter) / params.stepover) + 1 : 1;
          
          let code = `(CICLO DI FRESATURA CAVE)
(DIMENSIONI: ${params.slotLength}x${params.slotWidth}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8\n`;
          
          for (let depthPass = 0; depthPass < Math.ceil(params.depth / params.stepdown); depthPass++) {
            const currentDepth = Math.min((depthPass + 1) * params.stepdown, params.depth);
            code += `(PASSATA Z ${depthPass + 1} - PROFONDITA: ${currentDepth}mm)\n`;
            
            if (needsMultiplePasses) {
              // Calcola il primo offset laterale (centro fresa al bordo della cava)
              const startOffset = (params.slotWidth - params.toolDiameter) / 2;
              
              for (let widthPass = 0; widthPass < numberOfPasses; widthPass++) {
                // Calcola l'offset laterale per questa passata
                const offset = startOffset - (widthPass * params.stepover);
                const yOffset = offset * Math.sin(params.angle * Math.PI / 180);
                const xOffset = offset * Math.cos(params.angle * Math.PI / 180);
                
                // Calcola i punti di inizio e fine della cava con l'angolo
                const startX = -params.slotLength/2 * Math.cos(params.angle * Math.PI / 180) + xOffset;
                const startY = -params.slotLength/2 * Math.sin(params.angle * Math.PI / 180) + yOffset;
                const endX = params.slotLength/2 * Math.cos(params.angle * Math.PI / 180) + xOffset;
                const endY = params.slotLength/2 * Math.sin(params.angle * Math.PI / 180) + yOffset;
                
                code += `G00 X${startX.toFixed(3)} Y${startY.toFixed(3)}\n`;
                if (widthPass === 0 && depthPass === 0) {
                  code += `G00 Z5\n`;
                }
                code += `G01 Z-${currentDepth.toFixed(3)} F${params.plungeFeedrate}\n`;
                code += `G01 X${endX.toFixed(3)} Y${endY.toFixed(3)} F${params.feedrate}\n`;
                code += `G00 Z5\n`;
              }
            } else {
              // Calcola i punti di inizio e fine della cava con l'angolo
              const startX = -params.slotLength/2 * Math.cos(params.angle * Math.PI / 180);
              const startY = -params.slotLength/2 * Math.sin(params.angle * Math.PI / 180);
              const endX = params.slotLength/2 * Math.cos(params.angle * Math.PI / 180);
              const endY = params.slotLength/2 * Math.sin(params.angle * Math.PI / 180);
              
              code += `G00 X${startX.toFixed(3)} Y${startY.toFixed(3)}\n`;
              if (depthPass === 0) {
                code += `G00 Z5\n`;
              }
              code += `G01 Z-${currentDepth.toFixed(3)} F${params.plungeFeedrate}\n`;
              code += `G01 X${endX.toFixed(3)} Y${endY.toFixed(3)} F${params.feedrate}\n`;
              code += `G00 Z5\n`;
            }
          }
          
          code += `G00 Z50\nM9\nM5`;
          return code;
        } else {
          return `; CICLO DI FRESATURA CAVE
; DIMENSIONI: ${params.slotLength}x${params.slotWidth}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 253 FRESATURA SCANALATURE
  Q215=0                        ; TIPO LAVORAZIONE
  Q218=${params.slotLength}     ; LUNGHEZZA SCANALATURA
  Q219=${params.slotWidth}      ; LARGH. SCANALATURA
  Q368=0                        ; QUOTA LATERALE CONS.
  Q374=${params.angle}          ; ANGOLO DI ROTAZIONE
  Q367=0                        ; POSIZIONE SCANALATURA
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q351=+1                       ; MODO FRESATURA
  Q201=-${params.depth}         ; PROFONDITA
  Q202=${params.stepdown}       ; PROF. INCREMENTO
  Q369=0                        ; PROFONDITA' CONSEN.
  Q206=${params.plungeFeedrate} ; AVANZ. INCREMENTO
  Q338=${params.stepover}       ; INCREMENTO FINITURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q366=0                        ; STRATEGIA PENETRAZIONE
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di alesatura
    {
      id: 'boring-cycle',
      name: 'Alesatura',
      description: 'Ciclo di alesatura di precisione',
      icon: <BoringIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'initialDiameter',
          label: 'Diametro Iniziale',
          type: 'number',
          defaultValue: 20,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro del preforo'
        },
        {
          name: 'finalDiameter',
          label: 'Diametro Finale',
          type: 'number',
          defaultValue: 22,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro finale dopo l\'alesatura'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 30,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale dell\'alesatura'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 80,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'alesatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 800,
          min: 1,
          max: 24000,
          step: 10,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'dwellTime',
          label: 'Tempo di Sosta',
          type: 'number',
          defaultValue: 0.5,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta sul fondo per la finitura'
        },
        {
          name: 'retractFeedrate',
          label: 'Avanzamento Ritorno',
          type: 'number',
          defaultValue: 150,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per il ritorno'
        },
        {
          name: 'orientation',
          label: 'Orientamento Mandrino',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 360,
          step: 1,
          unit: 'gradi',
          description: 'Angolo di orientamento del mandrino all\'uscita'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI ALESATURA)
(DIAMETRO: ${params.initialDiameter}mm -> ${params.finalDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
G76 R5 Z-${params.depth} Q${params.orientation} P${params.dwellTime * 1000} F${params.feedrate} K${params.retractFeedrate}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI ALESATURA
; DIAMETRO: ${params.initialDiameter}mm -> ${params.finalDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 202 BARENATURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q211=${params.dwellTime}      ; TEMPO ATTESA SOTTO
  Q208=${params.retractFeedrate}; AVANZAM. RITORNO
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q214=1                        ; DIREZIONE DISIMPEGNO
  Q336=${params.orientation}    ; ANGOLO MANDRINO
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di barenatura
    {
      id: 'back-boring',
      name: 'Barenatura Inversa',
      description: 'Ciclo di barenatura inversa per lavorazioni dal basso',
      icon: <BackBoringIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'holeDiameter',
          label: 'Diametro Foro',
          type: 'number',
          defaultValue: 20,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro del foro passante'
        },
        {
          name: 'counterboreDiameter',
          label: 'Diametro Svasatura',
          type: 'number',
          defaultValue: 28,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della svasatura inferiore'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità della svasatura (dalla superficie inferiore)'
        },
        {
          name: 'thickness',
          label: 'Spessore Pezzo',
          type: 'number',
          defaultValue: 30,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Spessore totale del pezzo'
        },
        {
          name: 'safetyDistance',
          label: 'Distanza Sicurezza',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Distanza di sicurezza all\'interno del foro'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la barenatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 600,
          min: 1,
          max: 24000,
          step: 10,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'dwellTime',
          label: 'Tempo di Sosta',
          type: 'number',
          defaultValue: 0.2,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta in profondità'
        }
      ],
      generateCode: (params, controllerType) => {
        const approachDepth = params.thickness - params.safetyDistance;
        const totalDepth = params.thickness + params.depth;
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI BARENATURA INVERSA)
(DIAMETRO SVASATURA: ${params.counterboreDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
(POSIZIONAMENTO UTENSILE DENTRO IL FORO)
G00 Z-${approachDepth}
(ORIENTAMENTO MANDRINO)
M19
G31 Z-${totalDepth} F50
G01 Z-${totalDepth} F${params.feedrate}
G04 P${params.dwellTime * 1000}
G01 Z-${approachDepth} F${params.feedrate}
G00 Z5
X10 Y10
(RIPETE CICLO)
G00 Z-${approachDepth}
M19
G31 Z-${totalDepth} F50
G01 Z-${totalDepth} F${params.feedrate}
G04 P${params.dwellTime * 1000}
G01 Z-${approachDepth} F${params.feedrate}
G00 Z5
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI BARENATURA INVERSA
; DIAMETRO SVASATURA: ${params.counterboreDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 204 LAVORAZIONE INV.
  Q200=2                        ; DISTANZA SICUREZZA
  Q249=${params.depth}          ; PROFONDITA SCARICO
  Q250=${params.thickness}      ; SPESSORE MATERIALE
  Q251=2                        ; ECCENTRICITA
  Q252=0                        ; ALTEZZA TAGLIENTE
  Q253=500                      ; AVANZ. AVVICINAMENTO
  Q254=${params.feedrate}       ; AVANZ. LAVORAZIONE
  Q255=${params.dwellTime}      ; TEMPO ATTESA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di maschiatura a rompere
    {
      id: 'thread-milling',
      name: 'Fresatura Filetti',
      description: 'Ciclo di fresatura filetti interni o esterni',
      icon: <ThreadMillingIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'threadDiameter',
          label: 'Diametro Filetto',
          type: 'number',
          defaultValue: 16,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro nominale del filetto'
        },
        {
          name: 'threadPitch',
          label: 'Passo Filetto',
          type: 'number',
          defaultValue: 2,
          min: 0.1,
          max: 10,
          step: 0.05,
          unit: 'mm',
          description: 'Passo del filetto'
        },
        {
          name: 'threadDepth',
          label: 'Profondità Filetto',
          type: 'number',
          defaultValue: 1.6,
          min: 0.1,
          max: 10,
          step: 0.05,
          unit: 'mm',
          description: 'Profondità del filetto (radiale)'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 20,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale del filetto'
        },
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 8,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa per filettare'
        },
        {
          name: 'threadType',
          label: 'Tipo Filetto',
          type: 'select',
          defaultValue: 'internal',
          options: [
            { value: 'internal', label: 'Interno' },
            { value: 'external', label: 'Esterno' }
          ],
          description: 'Tipo di filetto: interno o esterno'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 400,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'threadTurns',
          label: 'Numero Giri',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 10,
          step: 0.25,
          unit: 'giri',
          description: 'Numero di giri completi del filetto'
        }
      ],
      generateCode: (params, controllerType) => {
        // Calcola il raggio di lavoro in base al tipo di filetto
        const workRadius = params.threadType === 'internal' ? 
          (params.threadDiameter / 2) - params.threadDepth :
          (params.threadDiameter / 2) + params.threadDepth;
        
        const helixRadius = workRadius - (params.threadType === 'internal' ? 1 : -1) * (params.toolDiameter / 2);
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI FRESATURA FILETTI ${params.threadType === 'internal' ? 'INTERNI' : 'ESTERNI'})
(DIAMETRO: ${params.threadDiameter}mm, PASSO: ${params.threadPitch}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
(POSIZIONAMENTO AL CENTRO)
${params.threadType === 'internal' ? 
  `G00 X${-(helixRadius)}` :
  `G00 X${helixRadius}`}
(AVVICINAMENTO ALLA PROFONDITÀ DI LAVORO)
G01 Z0 F${params.feedrate}
(MOVIMENTO ELICOIDALE)
G17
${params.threadType === 'internal' ?
  `G02 X${helixRadius} Y0 I${helixRadius} J0 Z-${params.depth} F${params.feedrate}` :
  `G03 X${-helixRadius} Y0 I${-helixRadius} J0 Z-${params.depth} F${params.feedrate}`}
(CICLO COMPLETO DEL FILETTO)
${params.threadType === 'internal' ?
  `G02 X${helixRadius} Y0 I${-(helixRadius)} J0 F${params.feedrate}` :
  `G03 X${-helixRadius} Y0 I${helixRadius} J0 F${params.feedrate}`}
(RITORNO AL CENTRO)
${params.threadType === 'internal' ?
  `G01 X0` :
  `G01 X0`}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FRESATURA FILETTI ${params.threadType === 'internal' ? 'INTERNI' : 'ESTERNI'}
; DIAMETRO: ${params.threadDiameter}mm, PASSO: ${params.threadPitch}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 262 FRESATURA FILETTO
  Q335=${params.threadDiameter} ; DIAMETRO NOMINALE
  Q239=${params.threadPitch}    ; PASSO FILETTATURA
  Q201=-${params.depth}         ; PROFONDITA FILETTO
  Q355=${params.threadTurns}    ; FILETTI PER PASSATA
  Q253=750                      ; AVANZ. AVVICINAMENTO
  Q351=+1                       ; MODO FRESATURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
CYCL DEF 264 FRES. FIL. DAL PIENO
  Q335=${params.threadDiameter} ; DIAMETRO NOMINALE
  Q239=${params.threadPitch}    ; PASSO FILETTATURA
  Q201=-${params.depth}         ; PROFONDITA FILETTO
  Q222=${params.threadDiameter + (params.threadType === 'internal' ? -2 : 2) * params.threadDepth} ; DIAMETRO PREFORATURA
  Q355=${params.threadTurns}    ; FILETTI PER PASSATA
  Q253=750                      ; AVANZ. AVVICINAMENTO
  Q351=+1                       ; MODO FRESATURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di fresatura circolare
    {
      id: 'circular-pocket',
      name: 'Tasca Circolare',
      description: 'Ciclo per la fresatura di tasche circolari',
      icon: <CircularPocketIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'pocketDiameter',
          label: 'Diametro Tasca',
          type: 'number',
          defaultValue: 80,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro finale della tasca'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della tasca'
        },
        {
          name: 'stepdown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di passata per ogni incremento'
        },
        {
          name: 'stepover',
          label: 'Incremento Radiale',
          type: 'number',
          defaultValue: 4,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Incremento radiale tra passate'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 800,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 300,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'finishAllowance',
          label: 'Sovrametallo Finitura',
          type: 'number',
          defaultValue: 0.2,
          min: 0,
          max: 10,
          step: 0.05,
          unit: 'mm',
          description: 'Sovrametallo lasciato per la finitura'
        },
        {
          name: 'helicalEntrance',
          label: 'Entrata Elicoidale',
          type: 'checkbox',
          defaultValue: true,
          description: 'Usa entrata elicoidale invece che verticale'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI TASCA CIRCOLARE)
(DIAMETRO: ${params.pocketDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
${params.helicalEntrance ? 
  `(ENTRATA ELICOIDALE)
G17
G03 X0 Y0 I${params.toolDiameter/4} J0 Z-${params.stepdown} F${params.plungeFeedrate}` : 
  `(ENTRATA VERTICALE)
G01 Z-${params.stepdown} F${params.plungeFeedrate}`}

${Array.from({ length: Math.ceil(params.depth / params.stepdown) }).map((_, i) => {
  const currentDepth = Math.min((i + 1) * params.stepdown, params.depth);
  const maxRadius = (params.pocketDiameter - params.toolDiameter) / 2 - params.finishAllowance;
  
  let passCode = `(PASSATA ${i + 1} - PROFONDITA: ${currentDepth}mm)\n`;
  
  // Se non è la prima passata, entra alla nuova profondità
  if (i > 0) {
    passCode += `G01 Z-${currentDepth} F${params.plungeFeedrate}\n`;
  }
  
  // Calcola quante passate radiali sono necessarie
  const numRadialPasses = Math.ceil(maxRadius / params.stepover);
  
  for (let j = 0; j < numRadialPasses; j++) {
    const currentRadius = Math.min((j + 1) * params.stepover, maxRadius);
    passCode += `G03 X0 Y0 I0 J0 R${currentRadius} F${params.feedrate}\n`;
  }
  
  return passCode;
}).join('')}

(FINITURA LATERALE)
G03 X0 Y0 I0 J0 R${(params.pocketDiameter - params.toolDiameter) / 2} F${params.feedrate}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI TASCA CIRCOLARE
; DIAMETRO: ${params.pocketDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 252 TASCA CIRCOLARE
  Q215=0                        ; TIPO LAVORAZIONE
  Q223=${params.pocketDiameter} ; DIAMETRO TASCA
  Q368=${params.finishAllowance}; QUOTA LATERALE CONS.
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q351=+1                       ; MODO FRESATURA
  Q201=-${params.depth}         ; PROFONDITA
  Q202=${params.stepdown}       ; PROF. INCREMENTO
  Q369=0                        ; PROFONDITA' CONSEN.
  Q206=${params.plungeFeedrate} ; AVANZ. INCREMENTO
  Q338=${params.stepover}       ; INCREMENTO FINITURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q370=1                        ; SOVRAPP. TRAIETT.
  Q366=${params.helicalEntrance ? '1' : '0'} ; STRATEGIA PENETRAZIONE
  Q385=${params.feedrate}       ; AVANZAMENTO FINITURA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di fresatura di isole
    {
      id: 'circular-island',
      name: 'Isola Circolare',
      description: 'Ciclo per la fresatura di isole circolari',
      icon: <CircularIslandIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'islandDiameter',
          label: 'Diametro Isola',
          type: 'number',
          defaultValue: 50,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro finale dell\'isola'
        },
        {
          name: 'stockDiameter',
          label: 'Diametro Grezzo',
          type: 'number',
          defaultValue: 60,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro del materiale grezzo'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della lavorazione'
        },
        {
          name: 'stepdown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di passata per ogni incremento'
        },
        {
          name: 'stepover',
          label: 'Incremento Radiale',
          type: 'number',
          defaultValue: 4,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Incremento radiale tra passate'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 800,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 300,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'finishAllowance',
          label: 'Sovrametallo Finitura',
          type: 'number',
          defaultValue: 0.2,
          min: 0,
          max: 10,
          step: 0.05,
          unit: 'mm',
          description: 'Sovrametallo lasciato per la finitura'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI ISOLA CIRCOLARE)
(DIAMETRO ISOLA: ${params.islandDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X${(params.stockDiameter + params.toolDiameter) / 2} Y0
G00 Z5

${Array.from({ length: Math.ceil(params.depth / params.stepdown) }).map((_, i) => {
  const currentDepth = Math.min((i + 1) * params.stepdown, params.depth);
  const finishRadius = (params.islandDiameter + params.toolDiameter) / 2 + params.finishAllowance;
  const startRadius = (params.stockDiameter + params.toolDiameter) / 2;
  
  let passCode = `(PASSATA ${i + 1} - PROFONDITA: ${currentDepth}mm)\n`;
  
  // Entrata alla nuova profondità
  passCode += `G01 Z-${currentDepth} F${params.plungeFeedrate}\n`;
  
  // Prima passata - cerchio completo dal diametro esterno
  passCode += `G03 X${startRadius} Y0 I${-startRadius} J0 F${params.feedrate}\n`;
  
  // Calcola quante passate radiali sono necessarie
  const radialDistance = (startRadius - finishRadius);
  const numRadialPasses = Math.ceil(radialDistance / params.stepover);
  
  for (let j = 1; j <= numRadialPasses; j++) {
    // Calcola il raggio per questa passata
    const currentRadius = startRadius - Math.min(j * params.stepover, radialDistance);
    
    // Sposta all'interno
    passCode += `G01 X${currentRadius} F${params.feedrate}\n`;
    
    // Cerchio completo
    passCode += `G03 X${currentRadius} Y0 I${-currentRadius} J0 F${params.feedrate}\n`;
  }
  
  return passCode;
}).join('')}

(FINITURA LATERALE)
G01 X${(params.islandDiameter + params.toolDiameter) / 2} F${params.feedrate}
G03 X${(params.islandDiameter + params.toolDiameter) / 2} Y0 I${-(params.islandDiameter + params.toolDiameter) / 2} J0 F${params.feedrate}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI ISOLA CIRCOLARE
; DIAMETRO ISOLA: ${params.islandDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 257 ISOLA CIRCOLARE
  Q223=${params.islandDiameter} ; DIAMETRO PEZZO FINITO
  Q222=${params.stockDiameter}  ; DIAMETRO PEZZO GREZZO
  Q368=${params.finishAllowance}; QUOTA LATERALE CONS.
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q351=+1                       ; MODO FRESATURA
  Q201=-${params.depth}         ; PROFONDITA
  Q202=${params.stepdown}       ; PROF. INCREMENTO
  Q206=${params.plungeFeedrate} ; AVANZ. INCREMENTO
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q370=1                        ; SOVRAPP. TRAIETT.
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di foratura con rottura truciolo
    {
      id: 'chip-breaking-drill',
      name: 'Foratura con Rottura Truciolo',
      description: 'Ciclo di foratura con rottura truciolo programmata',
      icon: <ChipBreakingIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'drillDiameter',
          label: 'Diametro Punta',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della punta da utilizzare'
        },
        {
          name: 'depth',
          label: 'Profondità Totale',
          type: 'number',
          defaultValue: 50,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale del foro'
        },
        {
          name: 'incrementDepth',
          label: 'Profondità Incremento',
          type: 'number',
          defaultValue: 5,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di ogni incremento'
        },
        {
          name: 'chipBreakDistance',
          label: 'Distanza Rottura',
          type: 'number',
          defaultValue: 1,
          min: 0.1,
          max: 10,
          step: 0.1,
          unit: 'mm',
          description: 'Distanza di ritorno per rottura truciolo'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 150,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la foratura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 1500,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'returnType',
          label: 'Tipo Ritorno',
          type: 'select',
          defaultValue: 'rapid',
          options: [
            { value: 'rapid', label: 'Rapido' },
            { value: 'feed', label: 'Avanzamento' }
          ],
          description: 'Tipo di movimento di ritorno'
        },
        {
          name: 'chipBreakCount',
          label: 'Conteggi per Passo',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 20,
          step: 1,
          unit: 'rotture',
          description: 'Numero di rotture truciolo per ogni incremento'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI FORATURA CON ROTTURA TRUCIOLO)
(DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
G73 R${params.chipBreakDistance} Z-${params.depth} Q${params.incrementDepth} F${params.feedrate} K${params.chipBreakCount}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FORATURA CON ROTTURA TRUCIOLO
; DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 203 FORATURA UNIVERS
  Q200=2                        ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q202=${params.incrementDepth} ; PROF. INCREMENTO
  Q210=0                        ; TEMPO ATTESA SOPRA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q212=0                        ; VALORE DA TOGLIERE
  Q213=${params.chipBreakCount} ; N. ROTTURE TRUCIOLO
  Q205=1                        ; MIN. PROF. INCREMENTO
  Q211=0                        ; TEMPO ATTESA SOTTO
  Q208=${params.returnType === 'rapid' ? 99999 : params.feedrate} ; AVANZAM. RITORNO
  Q256=${params.chipBreakDistance} ; RITIRO ROTT.TRUCIOLO
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di fresatura di scanalature a T
    {
      id: 't-slot-milling',
      name: 'Scanalatura a T',
      description: 'Ciclo per fresatura di scanalature a T',
      icon: <TSlotIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Utensile',
          type: 'number',
          defaultValue: 12,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa a T'
        },
        {
          name: 'slotWidth',
          label: 'Larghezza Scanalatura',
          type: 'number',
          defaultValue: 16,
          min: 1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza della parte superiore della scanalatura'
        },
        {
          name: 'tSlotWidth',
          label: 'Larghezza T',
          type: 'number',
          defaultValue: 22,
          min: 1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza della parte inferiore a T'
        },
        {
          name: 'slotDepth',
          label: 'Profondità Scanalatura',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità della scanalatura principale'
        },
        {
          name: 'tSlotDepth',
          label: 'Profondità T',
          type: 'number',
          defaultValue: 6,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità aggiuntiva della parte a T'
        },
        {
          name: 'slotLength',
          label: 'Lunghezza Scanalatura',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Lunghezza totale della scanalatura'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 400,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Entrata',
          type: 'number',
          defaultValue: 200,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per l\'entrata in Z'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 2500,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI FRESATURA SCANALATURA A T)
(DIMENSIONI: ${params.slotLength}x${params.slotWidth}/${params.tSlotWidth}mm, PROFONDITA: ${params.slotDepth}+${params.tSlotDepth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8

(PRIMA FASE - SCANALATURA PRINCIPALE CON FRESA NORMALE)
(SOSTITUIRE UTENSILE CON FRESA CILINDRICA DI DIAMETRO ADEGUATO)
T2 M6
G43 Z50 H2
S${params.spindleSpeed} M3

G00 X${-params.slotLength/2} Y0
G00 Z5
G01 Z-${params.slotDepth} F${params.plungeFeedrate}
G01 X${params.slotLength/2} F${params.feedrate}
G00 Z50

(SECONDA FASE - ALLARGAMENTO A T CON FRESA A T)
(SOSTITUIRE UTENSILE CON FRESA A T)
T3 M6
G43 Z50 H3
S${params.spindleSpeed} M3

G00 X${-params.slotLength/2} Y0
G00 Z-${params.slotDepth + 2}
G01 Z-${params.slotDepth + params.tSlotDepth} F${params.plungeFeedrate}
G01 X${params.slotLength/2} F${params.feedrate}
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FRESATURA SCANALATURA A T
; DIMENSIONI: ${params.slotLength}x${params.slotWidth}/${params.tSlotWidth}mm, PROFONDITA: ${params.slotDepth}+${params.tSlotDepth}mm
TOOL CALL 1 Z S${params.spindleSpeed} ; FRESA CILINDRICA

L Z+50 R0 FMAX
; PRIMA FASE - SCANALATURA PRINCIPALE
CYCL DEF 253 FRESATURA SCANALATURE
  Q215=0                        ; TIPO LAVORAZIONE
  Q218=${params.slotLength}     ; LUNGHEZZA SCANALATURA
  Q219=${params.slotWidth}      ; LARGH. SCANALATURA
  Q368=0                        ; QUOTA LATERALE CONS.
  Q374=0                        ; ANGOLO DI ROTAZIONE
  Q367=0                        ; POSIZIONE SCANALATURA
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q351=+1                       ; MODO FRESATURA
  Q201=-${params.slotDepth}     ; PROFONDITA
  Q202=${params.slotDepth}      ; PROF. INCREMENTO
  Q369=0                        ; PROFONDITA' CONSEN.
  Q206=${params.plungeFeedrate} ; AVANZ. INCREMENTO
  Q338=0                        ; INCREMENTO FINITURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q366=0                        ; STRATEGIA PENETRAZIONE
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX

; SECONDA FASE - ALLARGAMENTO A T
TOOL CALL 2 Z S${params.spindleSpeed} ; FRESA A T
L Z+50 R0 FMAX
L X-${params.slotLength/2} Y+0 R0 FMAX
L Z-${params.slotDepth + 2} R0 FMAX
L Z-${params.slotDepth + params.tSlotDepth} F${params.plungeFeedrate}
L X+${params.slotLength/2} F${params.feedrate}
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di centrinatura
    {
      id: 'center-drilling',
      name: 'Centrinatura',
      description: 'Ciclo di centrinatura per preparazione fori',
      icon: <CenterDrillIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Punta',
          type: 'number',
          defaultValue: 6,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della punta da centri'
        },
        {
          name: 'coneAngle',
          label: 'Angolo Conico',
          type: 'number',
          defaultValue: 90,
          min: 60,
          max: 120,
          step: 1,
          unit: 'gradi',
          description: 'Angolo della punta (90° o 60° tipicamente)'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 3,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di centrinatura'
        },
        {
          name: 'chamferDiameter',
          label: 'Diametro Svasatura',
          type: 'number',
          defaultValue: 10,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro superiore della svasatura'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 150,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la centrinatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 2000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'dwellTime',
          label: 'Tempo Sosta',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta sul fondo (0 per nessuna sosta)'
        }
      ],
      generateCode: (params, controllerType) => {
        // Calcola la profondità necessaria per ottenere il diametro di svasatura desiderato
        const tg = Math.tan((params.coneAngle / 2) * Math.PI / 180);
        const calculatedDepth = params.chamferDiameter / (2 * tg);
        const finalDepth = Math.min(params.depth, calculatedDepth); // Usa il valore più piccolo tra quello calcolato e quello richiesto
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI CENTRINATURA)
(DIAMETRO SVASATURA: ${params.chamferDiameter}mm, PROFONDITA: ${finalDepth.toFixed(2)}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z5
G81 R5 Z-${finalDepth.toFixed(2)} F${params.feedrate} P${params.dwellTime * 1000}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI CENTRINATURA
; DIAMETRO SVASATURA: ${params.chamferDiameter}mm, PROFONDITA: ${finalDepth.toFixed(2)}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 240 CENTRATURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q343=0                        ; SELEZ. DIAM./PROF.
  Q201=-${finalDepth.toFixed(2)}; PROFONDITA
  Q344=-${params.chamferDiameter}; DIAMETRO
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q211=${params.dwellTime}      ; TEMPO ATTESA SOTTO
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di smusso
    {
      id: 'chamfering-cycle',
      name: 'Smusso',
      description: 'Ciclo per la fresatura di smussi',
      icon: <ChamferIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Fresa',
          type: 'number',
          defaultValue: 12,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa per smussi'
        },
        {
          name: 'chamferWidth',
          label: 'Larghezza Smusso',
          type: 'number',
          defaultValue: 2,
          min: 0.1,
          max: 50,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza dello smusso'
        },
        {
          name: 'chamferAngle',
          label: 'Angolo Smusso',
          type: 'number',
          defaultValue: 45,
          min: 30,
          max: 60,
          step: 1,
          unit: 'gradi',
          description: 'Angolo dello smusso (tipicamente 45°)'
        },
        {
          name: 'contourLength',
          label: 'Lunghezza Contorno',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Lunghezza del contorno da smussare'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 400,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la fresatura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 3000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'contourType',
          label: 'Tipo Contorno',
          type: 'select',
          defaultValue: 'external',
          options: [
            { value: 'external', label: 'Esterno' },
            { value: 'internal', label: 'Interno' }
          ],
          description: 'Tipo di contorno: esterno o interno'
        }
      ],
      generateCode: (params, controllerType) => {
        // Calcola la profondità dello smusso in base all'angolo
        const chamferDepth = params.chamferWidth * Math.tan((90 - params.chamferAngle) * Math.PI / 180);
        
        // Determina il codice di compensazione in base al tipo di contorno
        const compensationCode = params.contourType === 'external' 
          ? (controllerType === 'fanuc' ? 'G42' : 'RR')
          : (controllerType === 'fanuc' ? 'G41' : 'RL');
        
        if (controllerType === 'fanuc') {
          return `(CICLO DI FRESATURA SMUSSO)
(LARGHEZZA: ${params.chamferWidth}mm, ANGOLO: ${params.chamferAngle}°)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X-10 Y0
G00 Z5
G01 Z-${chamferDepth.toFixed(2)} F100
${compensationCode} D1
G01 X0 Y0 F${params.feedrate}
G01 X${params.contourLength}
G01 Y${params.contourLength}
G01 X0
G01 Y0
G40
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FRESATURA SMUSSO
; LARGHEZZA: ${params.chamferWidth}mm, ANGOLO: ${params.chamferAngle}°
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
; DEFINIZIONE CICLO SMUSSO
CYCL DEF 275 FR. TROC. SCAN. PROF
  Q215=2                        ; TIPO LAVORAZIONE
  Q219=${params.chamferWidth}   ; LARGHEZZA SCANALATURA
  Q368=0                        ; QUOTA LATERALE CONS.
  Q436=${chamferDepth.toFixed(2)} ; INCREMENTO PER GIRO
  Q207=${params.feedrate}       ; AVANZ. FRESATURA
  Q351=+1                       ; MODO FRESATURA
  Q201=-${chamferDepth.toFixed(2)} ; PROFONDITA
  Q202=${chamferDepth.toFixed(2)} ; PROF. INCREMENTO
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q338=0                        ; INCREMENTO FINITURA
  Q385=${params.feedrate}       ; AVANZAMENTO FINITURA
  Q200=2                        ; DISTANZA SICUREZZA
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
  Q366=0                        ; STRATEGIA PENETRAZIONE
  Q369=0                        ; PROFONDITA' CONSEN.
  Q439=0                        ; RIFERIMENTO AVANZAMENTO
; PERCORSO CONTORNO
L X-10 Y+0 R0 FMAX
L Z+5 R0 FMAX
L Z-${chamferDepth.toFixed(2)} F100
L ${compensationCode} R${params.toolDiameter/2}
L X+0 Y+0 F${params.feedrate}
L X+${params.contourLength}
L Y+${params.contourLength}
L X+0
L Y+0
L R0
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di foratura con scarico (G83)
    {
      id: 'peck-drilling',
      name: 'Foratura con Scarico',
      description: 'Ciclo di foratura con ritorno completo per lo scarico',
      icon: <PeckDrillIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'drillDiameter',
          label: 'Diametro Punta',
          type: 'number',
          defaultValue: 12,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della punta da utilizzare'
        },
        {
          name: 'depth',
          label: 'Profondità Totale',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale del foro'
        },
        {
          name: 'peckDepth',
          label: 'Profondità Incremento',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di ogni incremento prima dello scarico'
        },
        {
          name: 'retractHeight',
          label: 'Altezza Ritorno',
          type: 'number',
          defaultValue: 5,
          min: 1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Altezza di ritorno dopo ogni incremento'
        },
        {
          name: 'feedrate',
          label: 'Avanzamento',
          type: 'number',
          defaultValue: 120,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per la foratura'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 1000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        },
        {
          name: 'dwellTime',
          label: 'Tempo Sosta',
          type: 'number',
          defaultValue: 0.2,
          min: 0,
          max: 10,
          step: 0.1,
          unit: 'sec',
          description: 'Tempo di sosta sul fondo di ogni incremento'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          return `(CICLO DI FORATURA CON SCARICO COMPLETO)
(DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm, INCREMENTO: ${params.peckDepth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8
G00 X0 Y0
G00 Z${params.retractHeight}
G83 R${params.retractHeight} Z-${params.depth} Q${params.peckDepth} F${params.feedrate} P${params.dwellTime * 1000}
X10 Y10
X20 Y10
X30 Y10
G80
G00 Z50
M9
M5`;
        } else {
          return `; CICLO DI FORATURA CON SCARICO COMPLETO
; DIAMETRO: ${params.drillDiameter}mm, PROFONDITA: ${params.depth}mm, INCREMENTO: ${params.peckDepth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 201 ALESATURA
  Q200=${params.retractHeight}  ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q206=${params.feedrate}       ; AVANZ. INCREMENTO
  Q211=${params.dwellTime}      ; TEMPO ATTESA SOTTO
  Q208=500                      ; AVANZAM. RITORNO
  Q203=+0                       ; COORD. SUPERFICIE
  Q204=50                       ; 2. DIST. SICUREZZA
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L X+10 Y+10 R0 FMAX M99
L X+20 Y+10 R0 FMAX M99
L X+30 Y+10 R0 FMAX M99
L Z+50 R0 FMAX
M5`;
        }
      }
    },
    
    // Ciclo di fresatura a tuffo (Plunge Milling)
    {
      id: 'plunge-milling',
      name: 'Fresatura a Tuffo',
      description: 'Ciclo di fresatura a tuffo per sgrossatura rapida',
      icon: <PlungeMillingIcon />,
      controllerTypes: ['fanuc', 'heidenhain'],
      parameters: [
        {
          name: 'toolDiameter',
          label: 'Diametro Fresa',
          type: 'number',
          defaultValue: 20,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Diametro della fresa da utilizzare'
        },
        {
          name: 'pocketWidth',
          label: 'Larghezza Area',
          type: 'number',
          defaultValue: 100,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Larghezza dell\'area da sgrossare'
        },
        {
          name: 'pocketLength',
          label: 'Lunghezza Area',
          type: 'number',
          defaultValue: 150,
          min: 1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Lunghezza dell\'area da sgrossare'
        },
        {
          name: 'depth',
          label: 'Profondità',
          type: 'number',
          defaultValue: 20,
          min: 0.1,
          max: 1000,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità totale della lavorazione'
        },
        {
          name: 'stepDown',
          label: 'Incremento Z',
          type: 'number',
          defaultValue: 4,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Profondità di ogni tuffo'
        },
        {
          name: 'stepOver',
          label: 'Passo Laterale',
          type: 'number',
          defaultValue: 15,
          min: 0.1,
          max: 100,
          step: 0.1,
          unit: 'mm',
          description: 'Distanza tra i tuffi'
        },
        {
          name: 'plungeFeedrate',
          label: 'Avanzamento Tuffo',
          type: 'number',
          defaultValue: 250,
          min: 1,
          max: 5000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per il tuffo'
        },
        {
          name: 'traverseFeedrate',
          label: 'Avanzamento Spostamento',
          type: 'number',
          defaultValue: 1000,
          min: 1,
          max: 10000,
          step: 1,
          unit: 'mm/min',
          description: 'Velocità di avanzamento per lo spostamento tra tuffi'
        },
        {
          name: 'spindleSpeed',
          label: 'Velocità Mandrino',
          type: 'number',
          defaultValue: 2000,
          min: 1,
          max: 24000,
          step: 100,
          unit: 'RPM',
          description: 'Velocità di rotazione del mandrino'
        }
      ],
      generateCode: (params, controllerType) => {
        if (controllerType === 'fanuc') {
          // Calcola il numero di passi X e Y
          const stepsX = Math.floor((params.pocketWidth - params.toolDiameter) / params.stepOver) + 1;
          const stepsY = Math.floor((params.pocketLength - params.toolDiameter) / params.stepOver) + 1;
          
          // Calcola il numero di livelli Z
          const zLevels = Math.ceil(params.depth / params.stepDown);
          
          let code = `(CICLO DI FRESATURA A TUFFO)
(AREA: ${params.pocketWidth}x${params.pocketLength}mm, PROFONDITA: ${params.depth}mm)
G90 G54
G00 X0 Y0
G43 Z50 H1
S${params.spindleSpeed} M3
M8\n`;
          
          for (let z = 0; z < zLevels; z++) {
            const currentDepth = Math.min((z + 1) * params.stepDown, params.depth);
            code += `(LIVELLO Z ${z + 1} - PROFONDITA: ${currentDepth}mm)\n`;
            
            // Pattern a zigzag per ridurre i tempi di posizionamento
            for (let y = 0; y < stepsY; y++) {
              const yPos = -params.pocketLength/2 + params.toolDiameter/2 + y * params.stepOver;
              
              if (y % 2 === 0) {
                // Direzione positiva su X
                for (let x = 0; x < stepsX; x++) {
                  const xPos = -params.pocketWidth/2 + params.toolDiameter/2 + x * params.stepOver;
                  code += `G00 X${xPos.toFixed(3)} Y${yPos.toFixed(3)}\n`;
                  code += `G00 Z5\n`;
                  code += `G01 Z-${currentDepth.toFixed(3)} F${params.plungeFeedrate}\n`;
                  code += `G01 Z5 F${params.traverseFeedrate}\n`;
                }
              } else {
                // Direzione negativa su X
                for (let x = stepsX - 1; x >= 0; x--) {
                  const xPos = -params.pocketWidth/2 + params.toolDiameter/2 + x * params.stepOver;
                  code += `G00 X${xPos.toFixed(3)} Y${yPos.toFixed(3)}\n`;
                  code += `G00 Z5\n`;
                  code += `G01 Z-${currentDepth.toFixed(3)} F${params.plungeFeedrate}\n`;
                  code += `G01 Z5 F${params.traverseFeedrate}\n`;
                }
              }
            }
          }
          
          code += `G00 Z50\nM9\nM5`;
          return code;
        } else {
          return `; CICLO DI FRESATURA A TUFFO
; AREA: ${params.pocketWidth}x${params.pocketLength}mm, PROFONDITA: ${params.depth}mm
TOOL CALL 1 Z S${params.spindleSpeed}
L Z+50 R0 FMAX
CYCL DEF 241 FOR. PROF. PUNTE CANN.
  Q200=2                        ; DISTANZA SICUREZZA
  Q201=-${params.depth}         ; PROFONDITA
  Q227=0                        ; PUNTO DI PARTENZA X
  Q228=0                        ; PUNTO DI PARTENZA Y
  Q229=${params.pocketWidth}    ; PUNTO FINALE X
  Q230=${params.pocketLength}   ; PUNTO FINALE Y
  Q231=${Math.floor((params.pocketWidth - params.toolDiameter) / params.stepOver) + 1} ; NUMERO COLONNE
  Q232=${Math.floor((params.pocketLength - params.toolDiameter) / params.stepOver) + 1} ; NUMERO RIGHE
  Q233=0                        ; ALTEZZA SUPERFICIE
  Q240=${Math.ceil(params.depth / params.stepDown)} ; NUMERO ACCOSTAMENTI
  Q351=1                        ; TIPOLOGIA FRESATURA
  Q253=${params.traverseFeedrate} ; PRE-POSIZIONAMENTO F
  Q253=${params.plungeFeedrate} ; AVANZAMENTO PROF.
L X+0 Y+0 R0 FMAX M3
CYCL CALL
L Z+50 R0 FMAX
M5`;
        }
      }
    }
  ];

  // Filtra i cicli in base al tipo di controller
  const availableCycles = cycleTemplates.filter(cycle => 
    cycle.controllerTypes.includes(controllerType)
  );

  // Inizializza i parametri quando viene selezionato un nuovo ciclo
  const handleCycleSelection = (cycleId: string) => {
    setSelectedCycleId(cycleId);
    
    const selectedCycle = cycleTemplates.find(c => c.id === cycleId);
    if (selectedCycle) {
      // Inizializza i parametri con i valori predefiniti
      const initialParams: Record<string, any> = {};
      selectedCycle.parameters.forEach(param => {
        initialParams[param.name] = param.defaultValue;
      });
      setCycleParams(initialParams);
      
      // Genera il codice di anteprima
      const code = selectedCycle.generateCode(initialParams, controllerType);
      setPreviewCode(code);
    }
  };

  // Aggiorna i parametri e rigenera il codice
  const handleParamChange = (paramName: string, value: any) => {
    const newParams = { ...cycleParams, [paramName]: value };
    setCycleParams(newParams);
    
    // Rigenera il codice di anteprima
    const selectedCycle = cycleTemplates.find(c => c.id === selectedCycleId);
    if (selectedCycle) {
      const code = selectedCycle.generateCode(newParams, controllerType);
      setPreviewCode(code);
    }
  };

  // Gestisce l'inserimento del ciclo
  const handleInsertCycle = () => {
    if (previewCode) {
      onCycleCodeGenerated(previewCode);
    }
  };

  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h2 className="text-lg font-medium text-gray-900">Cicli di Lavorazione</h2>
        <p className="text-sm text-gray-500">
          Seleziona e configura cicli predefiniti per {controllerType === 'fanuc' ? 'Fanuc' : 'Heidenhain'}
        </p>
      </div>
      
      <div className="list md:grid-cols-2 gap-4 p-4">
        {/* Pannello di selezione dei cicli */}
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <h3 className="text-md font-medium text-gray-900">Cicli Disponibili</h3>
          </div>
          <div className="p-2 max-h-72 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableCycles.map((cycle) => (
                <button
                  key={cycle.id}
                  className={`p-3 rounded-md text-center hover:bg-gray-50 transition-colors flex flex-col items-center ${
                    selectedCycleId === cycle.id ? 'bg-blue-50 border border-blue-200' : 'border border-gray-200'
                  }`}
                  onClick={() => handleCycleSelection(cycle.id)}
                >
                  <div className="w-10 h-10 flex items-center justify-center mb-2 text-gray-600">
                    {cycle.icon}
                  </div>
                  <span className="text-sm font-medium block">{cycle.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Pannello configurazione e anteprima */}
        <div className="border rounded-md overflow-hidden">
          {selectedCycleId ? (
            <>
              <div className="bg-gray-50 px-4 py-2 border-b">
                <h3 className="text-md font-medium text-gray-900">
                  {cycleTemplates.find(c => c.id === selectedCycleId)?.name || 'Configurazione Ciclo'}
                </h3>
              </div>
              <div className="p-4 max-h-72 overflow-y-auto">
                {cycleTemplates.find(c => c.id === selectedCycleId)?.parameters.map((param) => (
                  <div key={param.name} className="mb-3">
                    <label htmlFor={param.name} className="block text-sm font-medium text-gray-700">
                      {param.label}
                      {param.unit && <span className="text-gray-500 ml-1">({param.unit})</span>}
                    </label>
                    
                    {param.type === 'number' && (
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="number"
                          id={param.name}
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={cycleParams[param.name]}
                          onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
                          className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md sm:text-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}
                    
                    {param.type === 'select' && (
                      <select
                        id={param.name}
                        value={cycleParams[param.name]}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      >
                        {param.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {param.type === 'checkbox' && (
                      <div className="mt-1 flex items-center">
                        <input
                          type="checkbox"
                          id={param.name}
                          checked={cycleParams[param.name]}
                          onChange={(e) => handleParamChange(param.name, e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor={param.name} className="ml-2 block text-sm text-gray-500">
                          {param.description}
                        </label>
                      </div>
                    )}
                    
                    {param.type !== 'checkbox' && param.description && (
                      <p className="mt-1 text-xs text-gray-500">{param.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <div className="my-4">
                <CycleIcon className="mx-auto mb-2 h-12 w-12 text-gray-400" />
                <p>Seleziona un ciclo per configurarlo</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Anteprima del codice */}
      {selectedCycleId && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-md font-medium text-gray-900">Anteprima Codice</h3>
            <button
              onClick={handleInsertCycle}
              className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              Inserisci Ciclo
            </button>
          </div>
          <pre className="bg-gray-50 p-3 rounded-md text-sm font-mono overflow-x-auto max-h-60">
            {previewCode}
          </pre>
        </div>
      )}
    </div>
  );
};

// Componenti icona per i cicli
const DrillIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M14 4V20M8 4V7M8 12V15M4 4H20M4 20H20M12 12V15" />
  </svg>
);

const PocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </svg>
);

const ContourIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M4 4v16M4 4h16M20 4v8a8 8 0 0 1-8 8H4" />
  </svg>
);

const TapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M8 6h8M8 10h8M10 14h4M7 18h10" />
  </svg>
);

const CycleIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="4" x2="12" y2="12" />
    <line x1="12" y1="12" x2="16" y2="16" />
  </svg>
);

// Nuove icone per i cicli aggiunti
const DeepDrillIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 2v20M8 4v4M8 10v4M8 16v4M16 4v4M16 10v4M16 16v4M4 7h16M4 13h16M4 19h16" />
  </svg>
);

const SlotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M4 8h16v8H4z" />
    <path d="M2 12h20" />
  </svg>
);

const BoringIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="12" y1="5" x2="12" y2="19" strokeWidth="4" />
  </svg>
);

const BackBoringIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v16M9 8l6 8M9 16l6-8" />
  </svg>
);

const ThreadMillingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 6v12M12 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2M12 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
  </svg>
);

const CircularPocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4a8 8 0 0 1 0 16 8 8 0 0 1 0-16z" />
  </svg>
);

const CircularIslandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 8a4 4 0 0 1 0 8 4 4 0 0 1 0-8z" />
  </svg>
);

const ChipBreakingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M12 5l-3 3M12 10l-3 3M12 15l-3 3M12 5l3 3M12 10l3 3M12 15l3 3" />
  </svg>
);

const TSlotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M5 12h14M10 7v10M14 7v10M8 9v6M16 9v6" />
  </svg>
);

const CenterDrillIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M8 9l4 4 4-4" />
  </svg>
);

const ChamferIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="4" y="4" width="16" height="16" />
    <path d="M4 4l4 4M20 4l-4 4" />
  </svg>
);

const PeckDrillIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M12 6l-3 3M12 12l-3 3M12 18l-3 3" />
    <path d="M12 6l3 3M12 12l3 3M12 18l3 3" />
  </svg>
);

const PlungeMillingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="2" />
    <path d="M12 8V4M8 12H4M16 12h4M12 16v4M8 8l-2-2M16 8l2-2M16 16l2 2M8 16l-2 2" />
  </svg>
);

export default MachineCycles;