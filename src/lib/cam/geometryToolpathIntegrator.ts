/**
 * Integratore tra il processore di geometria e il generatore di G-code unificato
 * Collega le funzionalità di geometryProcessor.ts con unifiedGcodeGenerator.ts
 */

import * as THREE from 'three';
import { GeometryProcessor, BoundingBoxResult, SlicingOptions, Contour } from './geometryProcessor';
import { UnifiedGcodeGenerator, UnifiedGcodeConfig, UnifiedComponentInfo, ZSlice } from './unifiedGcodeGenerator';
import { MillingOperationType, MillingTool, ToolpathPoint } from 'src/types/GCode';
import { calculateComponentDimensions, ElementDimensions } from '../unifiedGeometryCalculator';

/**
 * Opzioni per la conversione di geometria in toolpath
 */
export interface GeometryToolpathOptions {
  // Impostazioni geometria
  zStart?: number;                // Quota Z iniziale (se non specificata, usa il massimo Z del componente)
  zEnd?: number;                  // Quota Z finale (se non specificata, usa il minimo Z del componente)
  stepSize?: number;              // Passo Z (default 1mm)
  includeTop?: boolean;           // Includere la superficie superiore
  includeBottom?: boolean;        // Includere la superficie inferiore
  resolution?: number;            // Risoluzione delle slice (punti per mm, default 10)
  detectIslands?: boolean;        // Rilevare isole interne (default true)
  
  // Impostazioni toolpath
  toolDiameter: number;           // Diametro utensile (mm)
  stepover?: number | string;     // Stepover come valore assoluto o percentuale (es. "40%")
  offset?: 'inside' | 'outside' | 'center'; // Offset percorso utensile
  direction?: 'climb' | 'conventional'; // Direzione di fresatura
  finishingPass?: boolean;        // Includere una passata di finitura
  entryStrategy?: 'direct' | 'ramp' | 'helix' | 'zigzag'; // Strategia di entrata nel materiale
  
  // Impostazioni G-code
  feedRate: number;               // Velocità avanzamento (mm/min)
  plungeRate: number;             // Velocità penetrazione (mm/min)
  spindleSpeed: number;           // Velocità mandrino (RPM)
  safeHeight?: number;            // Altezza di sicurezza (mm, default 5mm)
  
  // Tipo di operazione
  operationType?: MillingOperationType; // Tipo di operazione (default CONTOUR)
}

/**
 * Risultato della conversione di geometria in toolpath
 */
export interface GeometryToolpathResult {
  toolpath: ToolpathPoint[];      // Percorso utensile generato
  gcode: string;                  // G-code generato
  zLevels: number[];              // Livelli Z processati
  slices: ZSlice[];               // Slice generate
  boundingBox: BoundingBoxResult; // Bounding box del componente
  warnings: string[];             // Avvisi
  errors: string[];               // Errori
  estimatedTime: number;          // Tempo stimato (minuti)
  totalDistance: number;          // Distanza totale (mm)
}

/**
 * Classe principale per l'integrazione tra geometria e toolpath
 */
export class GeometryToolpathIntegrator {
  private processor: GeometryProcessor;
  private options: GeometryToolpathOptions;
  
  constructor(options: GeometryToolpathOptions) {
    this.processor = new GeometryProcessor();
    this.options = {
      // Valori predefiniti
      stepSize: 1,
      resolution: 10,
      detectIslands: true,
      offset: 'center',
      direction: 'climb',
      finishingPass: false,
      entryStrategy: 'direct',
      safeHeight: 5,
      operationType: MillingOperationType.CONTOUR,
      // Sovrascritti dai valori forniti
      ...options
    };
  }
  
  /**
   * Genera percorso utensile da un componente
   * @param component Componente da processare
   * @returns Risultato con toolpath e G-code
   */
  public generateToolpath(component: UnifiedComponentInfo): GeometryToolpathResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      // Step 1: Calcola il bounding box del componente
      const boundingBox = GeometryProcessor.calculateBoundingBox(component);
      
      // Step 2: Determina i livelli Z
      const slicingOptions: SlicingOptions = {
        zStart: this.options.zStart !== undefined ? this.options.zStart : boundingBox.box.max.z,
        zEnd: this.options.zEnd !== undefined ? this.options.zEnd : boundingBox.box.min.z,
        stepSize: this.options.stepSize || 1,
        includeTop: this.options.includeTop,
        includeBottom: this.options.includeBottom,
        resolution: this.options.resolution,
        detectIslands: this.options.detectIslands
      };
      
      const zLevels = GeometryProcessor.calculateZLevels(boundingBox.box, slicingOptions.stepSize, {
        includeTop: slicingOptions.includeTop,
        includeBottom: slicingOptions.includeBottom
      });
      
      // Step 3: Per ogni livello Z, calcola la slice
      const slices: ZSlice[] = [];
      for (const zLevel of zLevels) {
        const slice = GeometryProcessor.sliceComponentAtZ(component, zLevel, {
          resolution: slicingOptions.resolution,
          detectIslands: slicingOptions.detectIslands
        });
        slices.push(slice);
      }
      
      // Step 4: Crea configurazione per il generatore di G-code
      const gcodeConfig: UnifiedGcodeConfig = {
        toolDiameter: this.options.toolDiameter,
        spindleSpeed: this.options.spindleSpeed,
        feedRate: this.options.feedRate,
        plungeRate: this.options.plungeRate,
        operationType: this.options.operationType || MillingOperationType.CONTOUR,
        depth: Math.abs(slicingOptions.zStart - slicingOptions.zEnd),
        stepdown: slicingOptions.stepSize,
        stepover: this.options.stepover,
        direction: this.options.direction || 'climb',
        side: this.options.offset === 'center' ? 'on' : this.options.offset,
        entryStrategy: this.options.entryStrategy,
        finishingPass: this.options.finishingPass,
        safeHeight: this.options.safeHeight || 5,
        clearanceHeight: (this.options.safeHeight || 5) + 2
      };
      
      // Step 5: Crea il generatore di G-code
      const gcodeGenerator = new UnifiedGcodeGenerator(gcodeConfig);
      
      // Step 6: Converti le slices in percorso utensile
      const toolpath = this.convertSlicesToToolpath(slices, gcodeConfig);
      
      // Step 7: Genera il G-code
      const gcode = gcodeGenerator.generateGcode(toolpath);
      
      // Step 8: Calcola statistiche
      const stats = this.calculateStatistics(toolpath);
      
      return {
        toolpath,
        gcode,
        zLevels,
        slices,
        boundingBox,
        warnings,
        errors,
        estimatedTime: stats.estimatedTime,
        totalDistance: stats.totalDistance
      };
      
    } catch (error: any) {
      errors.push(`Errore nella generazione del toolpath: ${error.message}`);
      
      // Ritorna un risultato vuoto in caso di errore
      return {
        toolpath: [],
        gcode: '',
        zLevels: [],
        slices: [],
        boundingBox: {
          box: new THREE.Box3(),
          dimensions: new THREE.Vector3(),
          center: new THREE.Vector3(),
          volume: 0,
          surfaceArea: 0
        },
        warnings,
        errors,
        estimatedTime: 0,
        totalDistance: 0
      };
    }
  }
  
  /**
   * Converte le slice in un percorso utensile
   * @param slices Slice del componente
   * @param config Configurazione G-code
   * @returns Array di punti del percorso utensile
   */
  private convertSlicesToToolpath(slices: ZSlice[], config: UnifiedGcodeConfig): ToolpathPoint[] {
    const toolpath: ToolpathPoint[] = [];
    const toolRadius = config.toolDiameter / 2;
    const safeHeight = config.safeHeight;
    
    // Posizione corrente dell'utensile (inizializzata con valori non validi)
    let currentPosition = { x: Number.MIN_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER, z: safeHeight };
    
    // Per ogni slice, in ordine di Z decrescente (dall'alto verso il basso)
    for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
      const slice = slices[sliceIndex];
      const zLevel = slice.zLevel;
      
      // Se la slice non ha contorni, passa alla successiva
      if (slice.contours.length === 0) {
        continue;
      }
      
      // Per ogni contorno nella slice
      for (let contourIndex = 0; contourIndex < slice.contours.length; contourIndex++) {
        const contour = slice.contours[contourIndex];
        
        // Verifica se il contorno è valido
        if (!contour || contour.length < 3) {
          continue;
        }
        
        // Trova il punto di inizio del contorno (per ottimizzare il percorso)
        const startPoint = this.findOptimalStartPoint(contour, currentPosition);
        
        // Movimento di posizionamento rapido alla quota di sicurezza
        toolpath.push({
          x: startPoint.x,
          y: startPoint.y,
          z: safeHeight,
          type: 'rapid'
        });
        
        // Movimento di discesa controllata
        toolpath.push({
          x: startPoint.x,
          y: startPoint.y,
          z: zLevel,
          type: 'linear',
          feedRate: config.plungeRate
        });
        
        // Segue il contorno con punti equidistanti
        for (let i = 1; i <= contour.length; i++) {
          // Usa modulo per chiudere il loop
          const pointIndex = i % contour.length;
          const point = contour[pointIndex];
          
          // In base alla configurazione di offset, calcola la posizione dell'utensile
          let offsetPoint = { x: point.x, y: point.y };
          
          if (config.side === 'inside' || config.side === 'outside') {
            // Calcola la normale in questo punto
            const prevPointIndex = (pointIndex + contour.length - 1) % contour.length;
            const nextPointIndex = (pointIndex + 1) % contour.length;
            
            const prev = contour[prevPointIndex];
            const next = contour[nextPointIndex];
            
            const normal = this.calculateNormal(prev, point, next);
            
            // Applica l'offset
            const offsetDirection = config.side === 'inside' ? -1 : 1;
            offsetPoint.x += normal.x * toolRadius * offsetDirection;
            offsetPoint.y += normal.y * toolRadius * offsetDirection;
          }
          
          // Aggiunge il punto al toolpath
          toolpath.push({
            x: offsetPoint.x,
            y: offsetPoint.y,
            z: zLevel,
            type: 'linear',
            feedRate: config.feedRate
          });
          
          // Aggiorna la posizione corrente
          currentPosition = { x: offsetPoint.x, y: offsetPoint.y, z: zLevel };
        }
        
        // Movimento di risalita alla quota di sicurezza
        toolpath.push({
          x: currentPosition.x,
          y: currentPosition.y,
          z: safeHeight,
          type: 'linear',
          feedRate: config.plungeRate
        });
      }
      
      // Processa le isole (se presenti)
      if (slice.islands.length > 0) {
        for (let islandIndex = 0; islandIndex < slice.islands.length; islandIndex++) {
          const island = slice.islands[islandIndex];
          
          // Verifica se l'isola è valida
          if (!island || island.length < 3) {
            continue;
          }
          
          // Trova il punto di inizio dell'isola
          const startPoint = this.findOptimalStartPoint(island, currentPosition);
          
          // Movimento di posizionamento rapido alla quota di sicurezza
          toolpath.push({
            x: startPoint.x,
            y: startPoint.y,
            z: safeHeight,
            type: 'rapid'
          });
          
          // Movimento di discesa controllata
          toolpath.push({
            x: startPoint.x,
            y: startPoint.y,
            z: zLevel,
            type: 'linear',
            feedRate: config.plungeRate
          });
          
          // Segue l'isola con punti equidistanti
          for (let i = 1; i <= island.length; i++) {
            // Usa modulo per chiudere il loop
            const pointIndex = i % island.length;
            const point = island[pointIndex];
            
            // Per le isole, l'offset è sempre esterno
            let offsetPoint = { x: point.x, y: point.y };
            
            if (config.side !== 'on') {
              // Calcola la normale in questo punto
              const prevPointIndex = (pointIndex + island.length - 1) % island.length;
              const nextPointIndex = (pointIndex + 1) % island.length;
              
              const prev = island[prevPointIndex];
              const next = island[nextPointIndex];
              
              const normal = this.calculateNormal(prev, point, next);
              
              // Applica l'offset (sempre esterno per le isole)
              offsetPoint.x += normal.x * toolRadius;
              offsetPoint.y += normal.y * toolRadius;
            }
            
            // Aggiunge il punto al toolpath
            toolpath.push({
              x: offsetPoint.x,
              y: offsetPoint.y,
              z: zLevel,
              type: 'linear',
              feedRate: config.feedRate
            });
            
            // Aggiorna la posizione corrente
            currentPosition = { x: offsetPoint.x, y: offsetPoint.y, z: zLevel };
          }
          
          // Movimento di risalita alla quota di sicurezza
          toolpath.push({
            x: currentPosition.x,
            y: currentPosition.y,
            z: safeHeight,
            type: 'linear',
            feedRate: config.plungeRate
          });
        }
      }
    }
    
    return toolpath;
  }
  
  /**
   * Trova il punto ottimale per iniziare la lavorazione di un contorno
   * @param contour Contorno da lavorare
   * @param currentPosition Posizione corrente dell'utensile
   * @returns Punto ottimale per iniziare
   */
  private findOptimalStartPoint(contour: THREE.Vector2[], currentPosition: { x: number, y: number, z: number }): { x: number, y: number } {
    // Trova il punto più vicino alla posizione corrente
    let minDistance = Number.MAX_VALUE;
    let closestPointIndex = 0;
    
    for (let i = 0; i < contour.length; i++) {
      const point = contour[i];
      const distance = Math.sqrt(
        Math.pow(point.x - currentPosition.x, 2) + Math.pow(point.y - currentPosition.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPointIndex = i;
      }
    }
    
    return {
      x: contour[closestPointIndex].x,
      y: contour[closestPointIndex].y
    };
  }
  
  /**
   * Calcola il vettore normale in un punto del contorno
   * @param prev Punto precedente
   * @param current Punto corrente
   * @param next Punto successivo
   * @returns Vettore normale normalizzato
   */
  private calculateNormal(prev: THREE.Vector2, current: THREE.Vector2, next: THREE.Vector2): { x: number, y: number } {
    // Calcola i vettori direzione
    const v1 = { x: current.x - prev.x, y: current.y - prev.y };
    const v2 = { x: next.x - current.x, y: next.y - current.y };
    
    // Normalizza i vettori
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    v1.x /= len1; v1.y /= len1;
    v2.x /= len2; v2.y /= len2;
    
    // Calcola le normali
    const n1 = { x: -v1.y, y: v1.x };
    const n2 = { x: -v2.y, y: v2.x };
    
    // Media delle normali
    let nx = (n1.x + n2.x) / 2;
    let ny = (n1.y + n2.y) / 2;
    
    // Normalizza
    const len = Math.sqrt(nx * nx + ny * ny);
    nx /= len; ny /= len;
    
    return { x: nx, y: ny };
  }
  
  /**
   * Calcola statistiche dal percorso utensile
   * @param toolpath Percorso utensile
   * @returns Statistiche calcolate
   */
  private calculateStatistics(toolpath: ToolpathPoint[]): { estimatedTime: number, totalDistance: number } {
    let totalDistance = 0;
    let rapidDistance = 0;
    let linearDistance = 0;
    
    for (let i = 1; i < toolpath.length; i++) {
      const prev = toolpath[i - 1];
      const current = toolpath[i];
      
      const distance = Math.sqrt(
        Math.pow(current.x - prev.x, 2) +
        Math.pow(current.y - prev.y, 2) +
        Math.pow(current.z - prev.z, 2)
      );
      
      totalDistance += distance;
      
      if (current.type === 'rapid') {
        rapidDistance += distance;
      } else {
        linearDistance += distance;
      }
    }
    
    // Stima del tempo (semplificata)
    const rapidFeedRate = 5000; // mm/min, valore tipico per movimenti rapidi
    const rapidTime = rapidDistance / rapidFeedRate;
    
    let linearTime = 0;
    for (let i = 1; i < toolpath.length; i++) {
      const prev = toolpath[i - 1];
      const current = toolpath[i];
      
      if (current.type !== 'rapid') {
        const distance = Math.sqrt(
          Math.pow(current.x - prev.x, 2) +
          Math.pow(current.y - prev.y, 2) +
          Math.pow(current.z - prev.z, 2)
        );
        
        const feedRate = current.feedRate || this.options.feedRate;
        linearTime += distance / feedRate;
      }
    }
    
    const totalTime = (rapidTime + linearTime) * 60; // Converti in minuti
    
    return {
      estimatedTime: totalTime,
      totalDistance
    };
  }
}

/**
 * Crea un componente unificato da un oggetto elemento qualsiasi
 * @param element Elemento da convertire
 * @returns Componente unificato
 */
export function createUnifiedComponentFromElement(element: any): UnifiedComponentInfo {
  // Converte le coordinate e le dimensioni
  const position = new THREE.Vector3(
    element.x || 0,
    element.y || 0,
    element.z || 0
  );
  
  // Crea un ID univoco se non presente
  const id = element.id || `element_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  // Oggetto componente di base
  const component: UnifiedComponentInfo = {
    id,
    type: element.type || 'unknown',
    position,
    name: element.name
  };
  
  // Aggiungi dimensioni o raggio in base al tipo
  switch (element.type) {
    case 'cube':
    case 'box':
    case 'rectangle':
      component.dimensions = new THREE.Vector3(
        element.width || 0,
        element.height || 0,
        element.depth || element.height || 0
      );
      break;
      
    case 'sphere':
    case 'hemisphere':
    case 'cylinder':
    case 'cone':
    case 'capsule':
      component.radius = element.radius || 0;
      if (element.height) {
        component.dimensions = new THREE.Vector3(
          element.radius * 2,
          element.height,
          element.radius * 2
        );
      }
      break;
      
    case 'component':
      // Se è un componente con elementi, elabora ricorsivamente
      if (element.elements && Array.isArray(element.elements)) {
        component.elements = element.elements.map(createUnifiedComponentFromElement);
      }
      break;
  }
  
  // Aggiungi parametri aggiuntivi specifici per tipo
  if (element.parameters) {
    component.parameters = { ...element.parameters };
  }
  
  return component;
}

/**
 * Helper per convertire direttamente un elemento in G-code
 * @param element Elemento da convertire
 * @param options Opzioni per la generazione del toolpath
 * @returns G-code generato
 */
export function generateGcodeFromElement(element: any, options: GeometryToolpathOptions): string {
  // Converti l'elemento in un componente unificato
  const component = createUnifiedComponentFromElement(element);
  
  // Genera il toolpath
  const integrator = new GeometryToolpathIntegrator(options);
  const result = integrator.generateToolpath(component);
  
  return result.gcode;
} 