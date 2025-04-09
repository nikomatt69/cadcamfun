import * as THREE from 'three';

/**
 * Configurazioni avanzate per la conversione Three.js -> G-code FANUC
 */
interface GCodeOptions {
  // Parametri macchina
  feedRate: number;               // Velocità di avanzamento (mm/min)
  plungeRate: number;             // Velocità di penetrazione (mm/min)
  rapidRate: number;              // Velocità di movimento rapido (mm/min)
  spindleSpeed: number;           // Velocità del mandrino (RPM)
  toolNumber: number;             // Numero utensile
  toolDiameter: number;           // Diametro dell'utensile (mm)
  
  // Parametri di lavorazione
  safeHeight: number;             // Altezza di sicurezza (mm)
  clearanceHeight: number;        // Altezza di clearance per movimenti rapidi (mm)
  stockSurface: number;           // Quota superiore del pezzo grezzo (mm)
  finalDepth: number;             // Profondità finale di lavorazione (mm)
  stepDown: number;               // Incremento di profondità per ogni passata (mm)
  stepOver: number;               // Sovrapposizione laterale per percorsi paralleli (% del diametro utensile)
  
  // Parametri di ottimizzazione
  tolerance: number;              // Tolleranza per la semplificazione delle curve (mm)
  arcTolerance: number;           // Tolleranza per la conversione di segmenti in archi (mm)
  optimizationLevel: number;      // Livello di ottimizzazione del percorso (1-5)
  
  // Parametri di output
  precision: number;              // Precisione decimale per il G-code
  useArcCommands: boolean;        // Usa comandi G2/G3 per gli archi invece di segmenti lineari
  useSubprograms: boolean;        // Usa sottoprogrammi per pattern ripetitivi
  fanucDialect: string;           // Dialetto specifico del controllo FANUC (0i, 30i, 31i, ecc.)
  includeComments: boolean;       // Includi commenti nel G-code
  
  // Strategie di lavorazione
  strategy: 'contour' | 'pocket' | 'parallel' | 'spiral' | 'waterline' | 'hybrid';
  
  // Compensazione utensile
  toolCompensation: 'none' | 'left' | 'right';
  
  // Trasformazioni
  machineOrigin: THREE.Vector3;   // Posizione dell'origine macchina nel sistema di coordinate Three.js
  workpieceOrigin: THREE.Vector3; // Posizione dell'origine pezzo nel sistema di coordinate Three.js
  rotation: THREE.Euler;          // Rotazione da applicare
  scale: THREE.Vector3;           // Scala da applicare
  mirror: boolean[];              // Specchiatura sugli assi [X, Y, Z]
}

/**
 * Struttura dati per un percorso di lavorazione
 */
interface MachinePath {
  type: 'rapid' | 'linear' | 'arc' | 'plunge';
  points: THREE.Vector3[];
  startPoint?: THREE.Vector3;
  endPoint?: THREE.Vector3;
  centerPoint?: THREE.Vector3;
  radius?: number;
  clockwise?: boolean;
  feedRate?: number;
}

/**
 * Struttura per una feature di lavorazione
 */
interface MachiningFeature {
  type: 'profile' | 'pocket' | 'drill' | 'surface';
  geometry: THREE.BufferGeometry;
  depth: number;
  paths: MachinePath[];
  operation: MachiningOperation;
}

/**
 * Parametri di operazione di lavorazione
 */
interface MachiningOperation {
  type: 'roughing' | 'finishing' | 'semi-finishing';
  stepDown: number;
  stepOver: number;
  feedRate: number;
  plungeRate: number;
  spindleSpeed: number;
  toolNumber: number;
}

/**
 * Class per la conversione avanzata di geometrie Three.js in G-code FANUC
 */
class ThreeToGCode {
  private options: GCodeOptions;
  private gcode: string[] = [];
  private subprograms: Map<string, string[]> = new Map();
  private currentSubprogramId: number = 1;
  private machiningFeatures: MachiningFeature[] = [];
  private debugInfo: any = {};
  
  /**
   * Costruttore con opzioni predefinite
   */
  constructor(options?: Partial<GCodeOptions>) {
    // Valori predefiniti
    this.options = {
      feedRate: 200,
      plungeRate: 100,
      rapidRate: 5000,
      spindleSpeed: 10000,
      toolNumber: 1,
      toolDiameter: 6,
      
      safeHeight: 30,
      clearanceHeight: 10,
      stockSurface: 0,
      finalDepth: -10,
      stepDown: 1,
      stepOver: 0.4,
      
      tolerance: 0.01,
      arcTolerance: 0.1,
      optimizationLevel: 3,
      
      precision: 4,
      useArcCommands: true,
      useSubprograms: true,
      fanucDialect: '30i',
      includeComments: true,
      
      strategy: 'contour',
      toolCompensation: 'none',
      
      machineOrigin: new THREE.Vector3(0, 0, 0),
      workpieceOrigin: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      mirror: [false, false, false]
    };
    
    // Sovrascrivi con le opzioni fornite
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }
  
  /**
   * Genera il G-code per un'intera scena Three.js
   * @param scene La scena Three.js da convertire
   */
  convertScene(scene: THREE.Scene): string {
    this.reset();
    
    // Analizza la scena per estrarre le feature di lavorazione
    this.extractMachiningFeatures(scene);
    
    // Ottimizza la sequenza di lavorazione
    this.optimizeMachiningSequence();
    
    // Genera il G-code
    this.addHeader();
    
    // Processo ogni feature
    for (const feature of this.machiningFeatures) {
      this.processMachiningFeature(feature);
    }
    
    this.addFooter();
    
    // Aggiungi i sottoprogrammi se abilitati
    if (this.options.useSubprograms) {
      this.appendSubprograms();
    }
    
    return this.gcode.join('\n');
  }
  
  /**
   * Converte una singola mesh Three.js
   * @param mesh La mesh da convertire
   */
  convertMesh(mesh: THREE.Mesh): string {
    this.reset();
    
    // Clona la geometria per non modificare l'originale
    const geometry = mesh.geometry.clone();
    
    // Applica le trasformazioni della mesh alla geometria
    geometry.applyMatrix4(mesh.matrixWorld);
    
    // Crea una feature di lavorazione basata sulla mesh
    const feature: MachiningFeature = {
      type: 'profile',
      geometry: geometry,
      depth: this.options.finalDepth,
      paths: [],
      operation: {
        type: 'roughing',
        stepDown: this.options.stepDown,
        stepOver: this.options.stepOver,
        feedRate: this.options.feedRate,
        plungeRate: this.options.plungeRate,
        spindleSpeed: this.options.spindleSpeed,
        toolNumber: this.options.toolNumber
      }
    };
    
    // Genera i percorsi di lavorazione in base alla strategia selezionata
    switch (this.options.strategy) {
      case 'contour':
        this.generateContourPaths(feature);
        break;
      case 'pocket':
        this.generatePocketPaths(feature);
        break;
      case 'parallel':
        this.generateParallelPaths(feature);
        break;
      case 'spiral':
        this.generateSpiralPaths(feature);
        break;
      case 'waterline':
        this.generateWaterlinePaths(feature);
        break;
      case 'hybrid':
        this.generateHybridPaths(feature);
        break;
      default:
        this.generateContourPaths(feature);
    }
    
    // Aggiungi la feature alla lista
    this.machiningFeatures.push(feature);
    
    // Genera il G-code
    this.addHeader();
    this.processMachiningFeature(feature);
    this.addFooter();
    
    return this.gcode.join('\n');
  }
  
  /**
   * Converte oggetti 3D importati (STL, OBJ, STEP, ecc.)
   * @param buffer Il buffer dell'oggetto importato
   * @param format Il formato dell'oggetto ('stl', 'obj', 'step', ecc.)
   */
  convertImportedObject(buffer: ArrayBuffer, format: string): string {
    this.reset();
    
    let geometry: THREE.BufferGeometry;
    
    // Converti il buffer nel formato appropriato
    switch (format.toLowerCase()) {
      case 'stl':
        geometry = this.parseSTL(buffer);
        break;
      case 'obj':
        geometry = this.parseOBJ(buffer);
        break;
      case 'step':
      case 'stp':
        geometry = this.parseSTEP(buffer);
        break;
      default:
        throw new Error(`Formato non supportato: ${format}`);
    }
    
    // Applica le trasformazioni globali
    this.applyGlobalTransformations(geometry);
    
    // Crea una feature di lavorazione
    const feature: MachiningFeature = {
      type: 'profile',
      geometry: geometry,
      depth: this.options.finalDepth,
      paths: [],
      operation: {
        type: 'roughing',
        stepDown: this.options.stepDown,
        stepOver: this.options.stepOver,
        feedRate: this.options.feedRate,
        plungeRate: this.options.plungeRate,
        spindleSpeed: this.options.spindleSpeed,
        toolNumber: this.options.toolNumber
      }
    };
    
    // Genera i percorsi di lavorazione in base alla strategia selezionata
    this.generateMachiningPaths(feature);
    
    // Aggiungi la feature alla lista
    this.machiningFeatures.push(feature);
    
    // Genera il G-code
    this.addHeader();
    this.processMachiningFeature(feature);
    this.addFooter();
    
    return this.gcode.join('\n');
  }
  
  /**
   * Processa un CSG (Constructive Solid Geometry)
   * @param csg L'oggetto CSG da processare
   * @param operation Il tipo di operazione CSG ('union', 'subtract', 'intersect')
   */
  processCSG(meshA: THREE.Mesh, meshB: THREE.Mesh, operation: 'union' | 'subtract' | 'intersect'): THREE.BufferGeometry {
    // Implementazione di CSG con Three.js
    // Questa è una versione semplificata, in un ambiente reale
    // utilizzeremmo una libreria CSG completa
    
    const geometryA = meshA.geometry.clone();
    const geometryB = meshB.geometry.clone();
    
    // Applica le trasformazioni delle mesh alle geometrie
    geometryA.applyMatrix4(meshA.matrixWorld);
    geometryB.applyMatrix4(meshB.matrixWorld);
    
    // Implementazione base delle operazioni CSG
    // In realtà, questo richiederebbe una libreria CSG completa
    let resultGeometry: THREE.BufferGeometry;
    
    switch (operation) {
      case 'union':
        // Unione: Combina le due geometrie
        resultGeometry = this.mergeGeometries([geometryA, geometryB]);
        break;
      case 'subtract':
        // Sottrazione: Implementazione complessa, qui semplificata
        resultGeometry = this.subtractGeometries(geometryA, geometryB);
        break;
      case 'intersect':
        // Intersezione: Implementazione complessa, qui semplificata
        resultGeometry = this.intersectGeometries(geometryA, geometryB);
        break;
      default:
        throw new Error(`Operazione CSG non supportata: ${operation}`);
    }
    
    return resultGeometry;
  }
  
  /**
   * Estrae feature di lavorazione da una scena Three.js
   */
  private extractMachiningFeatures(scene: THREE.Scene): void {
    // Resetta le feature
    this.machiningFeatures = [];
    
    // Analizza ricorsivamente tutti gli oggetti nella scena
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // Controlla se l'oggetto ha metadati di lavorazione
        const machiningData = (object as any).userData.machining;
        
        if (machiningData) {
          // Usa i metadati dell'oggetto
          const feature: MachiningFeature = {
            type: machiningData.type || 'profile',
            geometry: object.geometry.clone(),
            depth: machiningData.depth || this.options.finalDepth,
            paths: [],
            operation: {
              type: machiningData.operationType || 'roughing',
              stepDown: machiningData.stepDown || this.options.stepDown,
              stepOver: machiningData.stepOver || this.options.stepOver,
              feedRate: machiningData.feedRate || this.options.feedRate,
              plungeRate: machiningData.plungeRate || this.options.plungeRate,
              spindleSpeed: machiningData.spindleSpeed || this.options.spindleSpeed,
              toolNumber: machiningData.toolNumber || this.options.toolNumber
            }
          };
          
          // Applica le trasformazioni dell'oggetto alla geometria
          feature.geometry.applyMatrix4(object.matrixWorld);
          
          // Genera i percorsi di lavorazione
          this.generateMachiningPaths(feature);
          
          // Aggiungi la feature alla lista
          this.machiningFeatures.push(feature);
        } else {
          // Crea una feature predefinita
          const feature: MachiningFeature = {
            type: 'profile',
            geometry: object.geometry.clone(),
            depth: this.options.finalDepth,
            paths: [],
            operation: {
              type: 'roughing',
              stepDown: this.options.stepDown,
              stepOver: this.options.stepOver,
              feedRate: this.options.feedRate,
              plungeRate: this.options.plungeRate,
              spindleSpeed: this.options.spindleSpeed,
              toolNumber: this.options.toolNumber
            }
          };
          
          // Applica le trasformazioni dell'oggetto alla geometria
          feature.geometry.applyMatrix4(object.matrixWorld);
          
          // Genera i percorsi di lavorazione in base alla strategia globale
          this.generateMachiningPaths(feature);
          
          // Aggiungi la feature alla lista
          this.machiningFeatures.push(feature);
        }
      }
    });
  }
  
  /**
   * Genera percorsi di lavorazione in base alla strategia selezionata
   */
  private generateMachiningPaths(feature: MachiningFeature): void {
    switch (this.options.strategy) {
      case 'contour':
        this.generateContourPaths(feature);
        break;
      case 'pocket':
        this.generatePocketPaths(feature);
        break;
      case 'parallel':
        this.generateParallelPaths(feature);
        break;
      case 'spiral':
        this.generateSpiralPaths(feature);
        break;
      case 'waterline':
        this.generateWaterlinePaths(feature);
        break;
      case 'hybrid':
        this.generateHybridPaths(feature);
        break;
      default:
        this.generateContourPaths(feature);
    }
  }
  
  /**
   * Genera percorsi di contorno (profilo esterno)
   */
  private generateContourPaths(feature: MachiningFeature): void {
    // Ottieni il contorno esterno della geometria
    const contours = this.extractContours(feature.geometry);
    
    // Crea percorsi di lavorazione per ogni contorno
    for (const contour of contours) {
      const path: MachinePath = {
        type: 'linear',
        points: contour
      };
      
      feature.paths.push(path);
      
      // Se abilitato, converti segmenti lineari in archi dove possibile
      if (this.options.useArcCommands) {
        this.detectAndConvertArcs(path);
      }
    }
    
    // Ottimizza i percorsi
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Genera percorsi per lavorazione a tasca
   */
  private generatePocketPaths(feature: MachiningFeature): void {
    // Ottieni il contorno esterno
    const contours = this.extractContours(feature.geometry);
    
    // Calcola i percorsi offset interni (tasca)
    const pocketPaths = this.generateOffsetPaths(contours, -this.options.toolDiameter * this.options.stepOver);
    
    // Aggiungi i percorsi alla feature
    feature.paths = feature.paths.concat(pocketPaths);
    
    // Ottimizza i percorsi
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Genera percorsi paralleli
   */
  private generateParallelPaths(feature: MachiningFeature): void {
    // Calcola il bounding box della geometria
    const boundingBox = new THREE.Box3().setFromBufferAttribute(
      feature.geometry.getAttribute('position') as THREE.BufferAttribute
    );
    
    // Genera una serie di linee parallele che coprono il bounding box
    const parallelPaths: MachinePath[] = [];
    
    // Direzione delle linee (X o Y)
    const direction = 'x'; // o 'y'
    
    if (direction === 'x') {
      // Linee parallele all'asse X
      const step = this.options.toolDiameter * this.options.stepOver;
      for (let y = boundingBox.min.y; y <= boundingBox.max.y; y += step) {
        const path: MachinePath = {
          type: 'linear',
          points: [
            new THREE.Vector3(boundingBox.min.x, y, 0),
            new THREE.Vector3(boundingBox.max.x, y, 0)
          ]
        };
        
        // Clip il percorso con la geometria
        const clippedPath = this.clipPathWithGeometry(path, feature.geometry);
        if (clippedPath && clippedPath.points.length > 0) {
          parallelPaths.push(clippedPath);
        }
      }
    } else {
      // Linee parallele all'asse Y
      const step = this.options.toolDiameter * this.options.stepOver;
      for (let x = boundingBox.min.x; x <= boundingBox.max.x; x += step) {
        const path: MachinePath = {
          type: 'linear',
          points: [
            new THREE.Vector3(x, boundingBox.min.y, 0),
            new THREE.Vector3(x, boundingBox.max.y, 0)
          ]
        };
        
        // Clip il percorso con la geometria
        const clippedPath = this.clipPathWithGeometry(path, feature.geometry);
        if (clippedPath && clippedPath.points.length > 0) {
          parallelPaths.push(clippedPath);
        }
      }
    }
    
    // Aggiungi i percorsi alla feature
    feature.paths = feature.paths.concat(parallelPaths);
    
    // Ottimizza i percorsi
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Genera percorsi a spirale
   */
  private generateSpiralPaths(feature: MachiningFeature): void {
    // Calcola il bounding box della geometria
    const boundingBox = new THREE.Box3().setFromBufferAttribute(
      feature.geometry.getAttribute('position') as THREE.BufferAttribute
    );
    
    // Calcola il centro del bounding box
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    // Calcola il raggio massimo
    const maxDimension = Math.max(
      boundingBox.max.x - boundingBox.min.x,
      boundingBox.max.y - boundingBox.min.y
    ) / 2;
    
    // Genera una spirale
    const spiralPoints: THREE.Vector3[] = [];
    const step = this.options.toolDiameter * this.options.stepOver;
    const turns = Math.ceil(maxDimension / step);
    
    // Numero di punti per giro
    const pointsPerTurn = 36;
    
    for (let i = 0; i <= turns * pointsPerTurn; i++) {
      const angle = (i / pointsPerTurn) * Math.PI * 2;
      const radius = (i / pointsPerTurn) * step;
      
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      
      spiralPoints.push(new THREE.Vector3(x, y, 0));
    }
    
    // Crea il percorso a spirale
    const spiralPath: MachinePath = {
      type: 'linear',
      points: spiralPoints
    };
    
    // Clip il percorso con la geometria
    const clippedSpiralPath = this.clipPathWithGeometry(spiralPath, feature.geometry);
    
    if (clippedSpiralPath && clippedSpiralPath.points.length > 0) {
      feature.paths.push(clippedSpiralPath);
    }
    
    // Ottimizza il percorso
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Genera percorsi waterline (seguendo le curve di livello)
   */
  private generateWaterlinePaths(feature: MachiningFeature): void {
    // Questa è una tecnica avanzata che richiede un'analisi 3D completa
    // Per semplicità, qui implementiamo una versione base
    
    // Ottieni i contorni a varie altezze Z
    const waterlinePaths: MachinePath[] = [];
    
    // Calcola il bounding box della geometria
    const boundingBox = new THREE.Box3().setFromBufferAttribute(
      feature.geometry.getAttribute('position') as THREE.BufferAttribute
    );
    
    // Calcola il numero di livelli Z
    const zRange = boundingBox.max.z - boundingBox.min.z;
    const numLevels = Math.ceil(zRange / this.options.stepDown);
    
    // Genera contorni a ogni livello Z
    for (let level = 0; level <= numLevels; level++) {
      const z = boundingBox.min.z + level * this.options.stepDown;
      
      // Interseca la geometria con un piano a quota Z
      const contours = this.intersectGeometryWithPlane(feature.geometry, z);
      
      for (const contour of contours) {
        const path: MachinePath = {
          type: 'linear',
          points: contour
        };
        
        waterlinePaths.push(path);
      }
    }
    
    // Aggiungi i percorsi alla feature
    feature.paths = feature.paths.concat(waterlinePaths);
    
    // Ottimizza i percorsi
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Genera percorsi ibridi (combinazione di strategie)
   */
  private generateHybridPaths(feature: MachiningFeature): void {
    // Per una lavorazione ibrida, combiniamo sgrossatura e finitura
    
    // Prima sgrossiamo con percorsi a tasca
    this.generatePocketPaths(feature);
    
    // Poi finiamo con percorsi di contorno
    this.generateContourPaths(feature);
    
    // Ottimizza l'insieme dei percorsi
    this.optimizePaths(feature.paths);
  }
  
  /**
   * Estrae i contorni esterni dalla geometria
   */
  private extractContours(geometry: THREE.BufferGeometry): THREE.Vector3[][] {
    const contours: THREE.Vector3[][] = [];
    
    // Calcola i bordi della geometria
    const edges = this.computeEdges(geometry);
    
    // Raggruppa gli spigoli in contorni chiusi
    const groupedEdges = this.groupEdgesIntoContours(edges);
    
    // Converti gli spigoli raggruppati in percorsi
    for (const edgeGroup of groupedEdges) {
      const contour: THREE.Vector3[] = [];
      
      for (const edge of edgeGroup) {
        contour.push(edge.start.clone());
      }
      
      if (contour.length > 0) {
        contours.push(contour);
      }
    }
    
    return contours;
  }
  
  /**
   * Calcola gli spigoli di una geometria
   */
  private computeEdges(geometry: THREE.BufferGeometry): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    const edgesHelper = new THREE.EdgesGeometry(geometry);
    const position = edgesHelper.getAttribute('position') as THREE.BufferAttribute;
    
    const edges: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
    
    for (let i = 0; i < position.count; i += 2) {
      const start = new THREE.Vector3(
        position.getX(i),
        position.getY(i),
        position.getZ(i)
      );
      
      const end = new THREE.Vector3(
        position.getX(i + 1),
        position.getY(i + 1),
        position.getZ(i + 1)
      );
      
      edges.push({ start, end });
    }
    
    return edges;
  }
  
  /**
   * Raggruppa gli spigoli in contorni chiusi
   */
  private groupEdgesIntoContours(edges: { start: THREE.Vector3, end: THREE.Vector3 }[]): { start: THREE.Vector3, end: THREE.Vector3 }[][] {
    const contours: { start: THREE.Vector3, end: THREE.Vector3 }[][] = [];
    const usedEdges = new Set<number>();
    
    // Tolleranza per considerare due punti coincidenti
    const tolerance = this.options.tolerance;
    
    // Funzione per trovare un edge che inizia vicino a un punto dato
    const findEdgeStartingAt = (point: THREE.Vector3) => {
      for (let i = 0; i < edges.length; i++) {
        if (usedEdges.has(i)) continue;
        
        const edge = edges[i];
        if (point.distanceTo(edge.start) < tolerance) {
          usedEdges.add(i);
          return { edge, reversed: false };
        }
        
        if (point.distanceTo(edge.end) < tolerance) {
          usedEdges.add(i);
          return { edge, reversed: true };
        }
      }
      
      return null;
    };
    
    // Cerca contorni finché ci sono edge non utilizzati
    let startIndex = 0;
    while (usedEdges.size < edges.length) {
      // Trova il primo edge non utilizzato
      while (startIndex < edges.length && usedEdges.has(startIndex)) {
        startIndex++;
      }
      
      if (startIndex >= edges.length) break;
      
      // Inizia un nuovo contorno
      const contour: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
      const startEdge = edges[startIndex];
      contour.push(startEdge);
      usedEdges.add(startIndex);
      
      let currentPoint = startEdge.end.clone();
      let closed = false;
      
      // Aggiungi edge al contorno finché non si chiude
      while (!closed) {
        const nextEdge = findEdgeStartingAt(currentPoint);
        
        if (!nextEdge) {
          // Non è possibile chiudere il contorno
          break;
        }
        
        const { edge, reversed } = nextEdge;
        
        if (reversed) {
          // Inverti l'edge se necessario
          contour.push({
            start: edge.end.clone(),
            end: edge.start.clone()
          });
          
          currentPoint = edge.start.clone();
        } else {
          contour.push(edge);
          currentPoint = edge.end.clone();
        }
        
        // Controlla se il contorno è chiuso
        if (currentPoint.distanceTo(startEdge.start) < tolerance) {
          closed = true;
        }
      }
      
      if (contour.length > 0) {
        contours.push(contour);
      }
    }
    
    return contours;
  }
  
  /**
   * Genera percorsi offset per tasca
   */
  private generateOffsetPaths(contours: THREE.Vector3[][], offset: number): MachinePath[] {
    // Implementazione semplificata per generare percorsi offset
    // In un'applicazione reale, utilizzeremmo una libreria come ClipperLib
    
    const offsetPaths: MachinePath[] = [];
    
    // Per ogni contorno originale
    for (const contour of contours) {
      let currentOffset = offset;
      let currentContour = contour;
      
      // Genera percorsi offset interni finché possibile
      let validOffset = true;
      while (validOffset) {
        // Calcola il contorno offset
        const offsetContour = this.offsetContour(currentContour, currentOffset);
        
        // Verifica se il contorno offset è valido
        if (offsetContour.length > 2) {
          // Crea un percorso con il contorno offset
          const path: MachinePath = {
            type: 'linear',
            points: offsetContour
          };
          
          offsetPaths.push(path);
          
          // Prepara per il prossimo offset
          currentContour = offsetContour;
          currentOffset = offset;
        } else {
          // Non è più possibile generare offset validi
          validOffset = false;
        }
      }
    }
    
    return offsetPaths;
  }
  
  /**
   * Offset di un contorno
   * @param contour Il contorno da offsettare
   * @param offset Valore di offset (negativo per interno, positivo per esterno)
   */
  private offsetContour(contour: THREE.Vector3[], offset: number): THREE.Vector3[] {
    const offsetContour: THREE.Vector3[] = [];
    
    // Per ogni punto nel contorno originale
    for (let i = 0; i < contour.length; i++) {
      const prev = contour[(i - 1 + contour.length) % contour.length];
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      
      // Calcola i vettori normalizzati dei segmenti
      const v1 = new THREE.Vector3().subVectors(current, prev).normalize();
      const v2 = new THREE.Vector3().subVectors(next, current).normalize();
      
      // Calcola le normali (perpendicolari) ai segmenti
      const n1 = new THREE.Vector3(-v1.y, v1.x, 0).normalize();
      const n2 = new THREE.Vector3(-v2.y, v2.x, 0).normalize();
      
      // Calcola la bisettrice
      const bisector = new THREE.Vector3().addVectors(n1, n2).normalize();
      
      // Calcola il fattore di scala per la bisettrice
      // L'angolo tra n1 e bisector è la metà dell'angolo tra n1 e n2
      const angle = Math.acos(n1.dot(n2));
      const scale = Math.abs(offset) / Math.sin(angle / 2);
      
      // Punto offset
      const offsetPoint = new THREE.Vector3().addScaledVector(bisector, offset > 0 ? scale : -scale);
      offsetPoint.add(current);
      
      offsetContour.push(offsetPoint);
    }
    
    return offsetContour;
  }
  
  /**
   * Ottimizza i percorsi di lavorazione
   */
  private optimizePaths(paths: MachinePath[]): void {
    // Riordina i percorsi per minimizzare i movimenti a vuoto
    this.optimizePathOrder(paths);
    
    // Per ciascun percorso
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      
      // Rileva archi nei percorsi lineari
      if (path.type === 'linear' && this.options.useArcCommands) {
        this.detectAndConvertArcs(path);
      }
      
      // Semplifica i percorsi rimuovendo punti non necessari
      if (path.type === 'linear') {
        path.points = this.simplifyPath(path.points, this.options.tolerance);
      }
    }
  }
  
  /**
   * Riordina i percorsi per minimizzare i movimenti a vuoto
   */
  private optimizePathOrder(paths: MachinePath[]): void {
    if (paths.length <= 1) return;
    
    // Crea una copia dell'array di percorsi
    const unorderedPaths = [...paths];
    const orderedPaths: MachinePath[] = [];
    
    // Inizia dal primo percorso
    orderedPaths.push(unorderedPaths.shift()!);
    
    // Ultimo punto del percorso corrente
    let lastPoint = this.getLastPointOfPath(orderedPaths[0]);
    
    // Continua finché ci sono percorsi non ordinati
    while (unorderedPaths.length > 0) {
      let bestIndex = -1;
      let minDistance = Number.MAX_VALUE;
      
      // Trova il percorso più vicino
      for (let i = 0; i < unorderedPaths.length; i++) {
        const path = unorderedPaths[i];
        
        // Calcola la distanza dal primo punto del percorso
        const firstPoint = path.points[0];
        const distance = lastPoint.distanceTo(firstPoint);
        
        if (distance < minDistance) {
          minDistance = distance;
          bestIndex = i;
        }
        
        // Calcola anche la distanza dall'ultimo punto del percorso (inverso)
        const lastPointOfPath = this.getLastPointOfPath(path);
        const distanceReversed = lastPoint.distanceTo(lastPointOfPath);
        
        if (distanceReversed < minDistance) {
          minDistance = distanceReversed;
          bestIndex = i;
          
          // Inverti il percorso
          path.points = path.points.slice().reverse();
        }
      }
      
      // Aggiungi il percorso migliore all'array ordinato
      const bestPath = unorderedPaths.splice(bestIndex, 1)[0];
      orderedPaths.push(bestPath);
      
      // Aggiorna l'ultimo punto
      lastPoint = this.getLastPointOfPath(bestPath);
    }
    
    // Sostituisci i percorsi originali con quelli ordinati
    paths.length = 0;
    paths.push(...orderedPaths);
  }
  
  /**
   * Restituisce l'ultimo punto di un percorso
   */
  private getLastPointOfPath(path: MachinePath): THREE.Vector3 {
    if (path.type === 'arc') {
      return path.endPoint!.clone();
    } else {
      return path.points[path.points.length - 1].clone();
    }
  }
  
  /**
   * Semplifica un percorso rimuovendo punti non necessari
   * Implementazione del Ramer-Douglas-Peucker algorithm
   */
  private simplifyPath(points: THREE.Vector3[], tolerance: number): THREE.Vector3[] {
    if (points.length <= 2) return points;
    
    // Trova il punto più lontano dalla linea tra il primo e l'ultimo punto
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    
    let maxDistance = 0;
    let maxIndex = 0;
    
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.pointToLineDistance(points[i], firstPoint, lastPoint);
      
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    
    // Se la massima distanza è maggiore della tolleranza, divide e ripeti
    if (maxDistance > tolerance) {
      // Semplifica ricorsivamente le due parti
      const firstPart = this.simplifyPath(points.slice(0, maxIndex + 1), tolerance);
      const secondPart = this.simplifyPath(points.slice(maxIndex), tolerance);
      
      // Concatena le due parti (senza duplicare il punto in comune)
      return firstPart.slice(0, -1).concat(secondPart);
    } else {
      // Tutti i punti intermedi possono essere rimossi
      return [firstPoint, lastPoint];
    }
  }
  
  /**
   * Calcola la distanza di un punto da una linea
   */
  private pointToLineDistance(point: THREE.Vector3, lineStart: THREE.Vector3, lineEnd: THREE.Vector3): number {
    const line = new THREE.Vector3().subVectors(lineEnd, lineStart);
    const len = line.length();
    
    if (len === 0) return point.distanceTo(lineStart);
    
    // Calcola la proiezione del punto sulla linea
    const t = Math.max(0, Math.min(1, point.clone().sub(lineStart).dot(line) / (len * len)));
    
    const projection = new THREE.Vector3().addVectors(
      lineStart,
      line.clone().multiplyScalar(t)
    );
    
    return point.distanceTo(projection);
  }
  
  /**
   * Rileva e converte segmenti lineari in archi dove appropriato
   */
  private detectAndConvertArcs(path: MachinePath): void {
    if (path.points.length < 3) return;
    
    const newPaths: MachinePath[] = [];
    let currentPath: THREE.Vector3[] = [path.points[0]];
    
    for (let i = 2; i < path.points.length; i++) {
      const p1 = path.points[i - 2];
      const p2 = path.points[i - 1];
      const p3 = path.points[i];
      
      // Verifica se i tre punti possono formare un arco
      const arcInfo = this.fitArcToPoints(p1, p2, p3);
      
      if (arcInfo && arcInfo.error < this.options.arcTolerance) {
        // Crea un percorso lineare fino al punto p1
        if (currentPath.length > 1) {
          newPaths.push({
            type: 'linear',
            points: [...currentPath]
          });
          
          currentPath = [];
        }
        
        // Crea un percorso ad arco
        newPaths.push({
          type: 'arc',
          points: [p1, p2, p3],
          startPoint: p1,
          endPoint: p3,
          centerPoint: arcInfo.center,
          radius: arcInfo.radius,
          clockwise: arcInfo.clockwise
        });
        
        // Imposta il punto iniziale per il prossimo segmento
        currentPath = [p3];
        i++; // Salta il prossimo punto
      } else {
        // Aggiungi il punto al percorso lineare corrente
        if (currentPath.length === 0) {
          currentPath.push(p1);
        }
        currentPath.push(p2);
      }
    }
    
    // Aggiungi l'ultimo punto
    if (path.points.length > 0) {
      currentPath.push(path.points[path.points.length - 1]);
    }
    
    // Aggiungi l'ultimo percorso lineare
    if (currentPath.length > 1) {
      newPaths.push({
        type: 'linear',
        points: [...currentPath]
      });
    }
    
    // Sostituisci il percorso originale con i nuovi percorsi
    path.type = 'linear';
    path.points = newPaths.length > 0 ? newPaths[0].points : path.points;
    
    // Aggiungi i percorsi aggiuntivi
    for (let i = 1; i < newPaths.length; i++) {
      path.points.push(...newPaths[i].points);
    }
  }
  
  /**
   * Calcola un arco che passa per tre punti
   */
  private fitArcToPoints(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): { center: THREE.Vector3, radius: number, error: number, clockwise: boolean } | null {
    // Verifica che i punti non siano collineari
    const v1 = new THREE.Vector3().subVectors(p2, p1);
    const v2 = new THREE.Vector3().subVectors(p3, p2);
    
    const cross = new THREE.Vector3().crossVectors(v1, v2);
    
    if (cross.length() < 1e-6) {
      return null; // Punti collineari
    }
    
    // Calcola il centro del cerchio usando il metodo delle perpendicolari
    const c1 = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const c2 = new THREE.Vector3().addVectors(p2, p3).multiplyScalar(0.5);
    
    // Vettori perpendicolari ai segmenti
    const n1 = new THREE.Vector3(-v1.y, v1.x, 0).normalize();
    const n2 = new THREE.Vector3(-v2.y, v2.x, 0).normalize();
    
    // Risolvi l'intersezione delle due linee perpendicolari
    // (c1 + t1*n1 = c2 + t2*n2)
    // Questo risolve per t1
    const d = n1.x * n2.y - n1.y * n2.x;
    
    if (Math.abs(d) < 1e-6) {
      return null; // Linee perpendicolari parallele (non dovrebbe accadere)
    }
    
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    
    const t1 = (dx * n2.y - dy * n2.x) / d;
    
    // Calcola il centro del cerchio
    const center = new THREE.Vector3(
      c1.x + t1 * n1.x,
      c1.y + t1 * n1.y,
      p1.z // Mantieni la stessa quota Z
    );
    
    // Calcola il raggio
    const radius = center.distanceTo(p1);
    
    // Calcola l'errore (deviazione massima dal cerchio)
    const error = Math.abs(center.distanceTo(p2) - radius);
    
    // Determina se l'arco è in senso orario o antiorario
    // Prodotto vettoriale tra (p1-centro) e (p3-centro)
    const v1c = new THREE.Vector3().subVectors(p1, center);
    const v3c = new THREE.Vector3().subVectors(p3, center);
    const clockwise = v1c.cross(v3c).z < 0;
    
    return { center, radius, error, clockwise };
  }
  
  /**
   * Clip un percorso con una geometria
   */
  private clipPathWithGeometry(path: MachinePath, geometry: THREE.BufferGeometry): MachinePath | null {
    // Questo è un problema complesso di intersezione 2D/3D
    // In un'implementazione reale, utilizzeremmo algoritmi specializzati
    
    // Per semplicità, qui implementiamo un approccio semplificato
    // che verifica se i punti del percorso sono all'interno della proiezione
    // della geometria sul piano XY
    
    const clippedPoints: THREE.Vector3[] = [];
    const points = path.points;
    
    // Proietta la geometria sul piano XY
    const projectedContours = this.projectGeometryToXY(geometry);
    
    // Per ogni segmento del percorso
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      
      // Interseca il segmento con i contorni proiettati
      const intersections = this.intersectSegmentWithContours(start, end, projectedContours);
      
      // Ordina le intersezioni per distanza dal punto iniziale
      intersections.sort((a, b) => {
        const distA = start.distanceTo(a);
        const distB = start.distanceTo(b);
        return distA - distB;
      });
      
      // Aggiungi i punti di intersezione
      let inside = this.isPointInsideContours(start, projectedContours);
      
      if (inside) {
        clippedPoints.push(start.clone());
      }
      
      for (const intersection of intersections) {
        clippedPoints.push(intersection.clone());
        inside = !inside; // Cambia stato dentro/fuori
      }
    }
    
    // Aggiungi l'ultimo punto se è all'interno
    const lastPoint = points[points.length - 1];
    if (this.isPointInsideContours(lastPoint, projectedContours)) {
      clippedPoints.push(lastPoint.clone());
    }
    
    // Se non ci sono punti clippati, restituisci null
    if (clippedPoints.length === 0) {
      return null;
    }
    
    // Crea un nuovo percorso con i punti clippati
    return {
      type: 'linear',
      points: clippedPoints
    };
  }
  
  /**
   * Proietta una geometria sul piano XY
   */
  private projectGeometryToXY(geometry: THREE.BufferGeometry): THREE.Vector3[][] {
    // Estrai i contorni della geometria
    return this.extractContours(geometry).map(contour => 
      contour.map(point => new THREE.Vector3(point.x, point.y, 0))
    );
  }
  
  /**
   * Verifica se un punto è all'interno di contorni 2D
   */
  private isPointInsideContours(point: THREE.Vector3, contours: THREE.Vector3[][]): boolean {
    // Implementazione del ray casting algorithm per point-in-polygon
    let inside = false;
    
    for (const contour of contours) {
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const pi = contour[i];
        const pj = contour[j];
        
        // Verifica se il raggio orizzontale verso destra interseca il segmento
        if (((pi.y > point.y) !== (pj.y > point.y)) &&
            (point.x < pi.x + (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y))) {
          inside = !inside;
        }
      }
    }
    
    return inside;
  }
  
  /**
   * Trova le intersezioni tra un segmento e contorni 2D
   */
  private intersectSegmentWithContours(start: THREE.Vector3, end: THREE.Vector3, contours: THREE.Vector3[][]): THREE.Vector3[] {
    const intersections: THREE.Vector3[] = [];
    
    for (const contour of contours) {
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const pi = contour[i];
        const pj = contour[j];
        
        // Verifica se i due segmenti si intersecano
        const intersection = this.intersectSegments(start, end, pi, pj);
        if (intersection) {
          intersections.push(intersection);
        }
      }
    }
    
    return intersections;
  }
  
  /**
   * Trova l'intersezione tra due segmenti 2D
   */
  private intersectSegments(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.Vector3 | null {
    // Calcola i determinanti
    const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    
    if (Math.abs(det) < 1e-6) {
      return null; // Segmenti paralleli
    }
    
    const t1 = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / det;
    const t2 = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / det;
    
    if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
      // Calcola il punto di intersezione
      return new THREE.Vector3(
        a.x + t1 * (b.x - a.x),
        a.y + t1 * (b.y - a.y),
        0
      );
    }
    
    return null; // Nessuna intersezione
  }
  
  /**
   * Interseca una geometria con un piano a quota Z
   */
  private intersectGeometryWithPlane(geometry: THREE.BufferGeometry, z: number): THREE.Vector3[][] {
    const contours: THREE.Vector3[][] = [];
    
    // Estrai i triangoli dalla geometria
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.getIndex();
    
    const triangles: THREE.Vector3[][] = [];
    
    if (index) {
      // Geometria indicizzata
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [
          new THREE.Vector3(
            position.getX(index.getX(i)),
            position.getY(index.getX(i)),
            position.getZ(index.getX(i))
          ),
          new THREE.Vector3(
            position.getX(index.getX(i + 1)),
            position.getY(index.getX(i + 1)),
            position.getZ(index.getX(i + 1))
          ),
          new THREE.Vector3(
            position.getX(index.getX(i + 2)),
            position.getY(index.getX(i + 2)),
            position.getZ(index.getX(i + 2))
          )
        ];
        
        triangles.push(triangle);
      }
    } else {
      // Geometria non indicizzata
      for (let i = 0; i < position.count; i += 3) {
        const triangle = [
          new THREE.Vector3(
            position.getX(i),
            position.getY(i),
            position.getZ(i)
          ),
          new THREE.Vector3(
            position.getX(i + 1),
            position.getY(i + 1),
            position.getZ(i + 1)
          ),
          new THREE.Vector3(
            position.getX(i + 2),
            position.getY(i + 2),
            position.getZ(i + 2)
          )
        ];
        
        triangles.push(triangle);
      }
    }
    
    // Interseca ogni triangolo con il piano Z
    const segments: [THREE.Vector3, THREE.Vector3][] = [];
    
    for (const triangle of triangles) {
      const segment = this.intersectTriangleWithPlaneZ(triangle, z);
      if (segment) {
        segments.push(segment);
      }
    }
    
    // Connetti i segmenti in contorni chiusi
    if (segments.length > 0) {
      const connectedContours = this.connectSegmentsIntoContours(segments);
      contours.push(...connectedContours);
    }
    
    return contours;
  }
  
  /**
   * Interseca un triangolo con un piano a quota Z
   */
  private intersectTriangleWithPlaneZ(triangle: THREE.Vector3[], z: number): [THREE.Vector3, THREE.Vector3] | null {
    const intersections: THREE.Vector3[] = [];
    
    // Controlla ogni spigolo del triangolo
    for (let i = 0; i < 3; i++) {
      const v1 = triangle[i];
      const v2 = triangle[(i + 1) % 3];
      
      // Verifica se lo spigolo attraversa il piano Z
      if ((v1.z <= z && v2.z >= z) || (v1.z >= z && v2.z <= z)) {
        // Calcola il punto di intersezione
        const t = (z - v1.z) / (v2.z - v1.z);
        
        const intersection = new THREE.Vector3(
          v1.x + t * (v2.x - v1.x),
          v1.y + t * (v2.y - v1.y),
          z
        );
        
        intersections.push(intersection);
      }
    }
    
    // Se ci sono esattamente 2 intersezioni, restituisci il segmento
    if (intersections.length === 2) {
      return [intersections[0], intersections[1]];
    }
    
    return null;
  }
  
  /**
   * Connette segmenti in contorni chiusi
   */
  private connectSegmentsIntoContours(segments: [THREE.Vector3, THREE.Vector3][]): THREE.Vector3[][] {
    const contours: THREE.Vector3[][] = [];
    const usedSegments = new Set<number>();
    
    // Tolleranza per considerare due punti coincidenti
    const tolerance = this.options.tolerance;
    
    // Funzione per trovare un segmento che inizia vicino a un punto dato
    const findSegmentStartingAt = (point: THREE.Vector3) => {
      for (let i = 0; i < segments.length; i++) {
        if (usedSegments.has(i)) continue;
        
        const segment = segments[i];
        
        if (point.distanceTo(segment[0]) < tolerance) {
          usedSegments.add(i);
          return { segment, reversed: false };
        }
        
        if (point.distanceTo(segment[1]) < tolerance) {
          usedSegments.add(i);
          return { segment, reversed: true };
        }
      }
      
      return null;
    };
    
    // Cerca contorni finché ci sono segmenti non utilizzati
    while (usedSegments.size < segments.length) {
      // Trova il primo segmento non utilizzato
      let startIndex = 0;
      while (startIndex < segments.length && usedSegments.has(startIndex)) {
        startIndex++;
      }
      
      if (startIndex >= segments.length) break;
      
      // Inizia un nuovo contorno
      const contour: THREE.Vector3[] = [];
      const startSegment = segments[startIndex];
      
      contour.push(startSegment[0].clone());
      contour.push(startSegment[1].clone());
      
      usedSegments.add(startIndex);
      
      let currentPoint = startSegment[1].clone();
      let closed = false;
      
      // Aggiungi segmenti al contorno finché non si chiude
      while (!closed) {
        const nextSegment = findSegmentStartingAt(currentPoint);
        
        if (!nextSegment) {
          // Non è possibile chiudere il contorno
          break;
        }
        
        const { segment, reversed } = nextSegment;
        
        if (reversed) {
          currentPoint = segment[0].clone();
          contour.push(currentPoint);
        } else {
          currentPoint = segment[1].clone();
          contour.push(currentPoint);
        }
        
        // Controlla se il contorno è chiuso
        if (currentPoint.distanceTo(startSegment[0]) < tolerance) {
          closed = true;
          // Rimuovi l'ultimo punto per evitare duplicati
          contour.pop();
        }
      }
      
      if (contour.length > 2) {
        contours.push(contour);
      }
    }
    
    return contours;
  }
  
  /**
   * Applica trasformazioni globali a una geometria
   */
  private applyGlobalTransformations(geometry: THREE.BufferGeometry): void {
    // Crea una matrice di trasformazione
    const matrix = new THREE.Matrix4();
    
    // Applica traslazione per l'origine del pezzo
    matrix.makeTranslation(
      -this.options.workpieceOrigin.x,
      -this.options.workpieceOrigin.y,
      -this.options.workpieceOrigin.z
    );
    
    // Applica rotazione
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(this.options.rotation);
    matrix.multiply(rotationMatrix);
    
    // Applica scala
    const scaleMatrix = new THREE.Matrix4().makeScale(
      this.options.scale.x,
      this.options.scale.y,
      this.options.scale.z
    );
    matrix.multiply(scaleMatrix);
    
    // Applica specchiatura
    if (this.options.mirror[0] || this.options.mirror[1] || this.options.mirror[2]) {
      const mirrorMatrix = new THREE.Matrix4().makeScale(
        this.options.mirror[0] ? -1 : 1,
        this.options.mirror[1] ? -1 : 1,
        this.options.mirror[2] ? -1 : 1
      );
      matrix.multiply(mirrorMatrix);
    }
    
    // Applica traslazione per l'origine macchina
    const originMatrix = new THREE.Matrix4().makeTranslation(
      this.options.machineOrigin.x,
      this.options.machineOrigin.y,
      this.options.machineOrigin.z
    );
    matrix.multiply(originMatrix);
    
    // Applica la matrice alla geometria
    geometry.applyMatrix4(matrix);
  }
  
  /**
   * Processa una feature di lavorazione
   */
  private processMachiningFeature(feature: MachiningFeature): void {
    // Aggiungi commento per la feature
    if (this.options.includeComments) {
      this.gcode.push(`(Machining feature: ${feature.type})`);
      this.gcode.push(`(Operation: ${feature.operation.type})`);
      this.gcode.push(`(Tool: T${feature.operation.toolNumber})`);
    }
    
    // Seleziona l'utensile
    this.gcode.push(`T${feature.operation.toolNumber} M6`);
    this.gcode.push(`S${feature.operation.spindleSpeed} M3`);
    
    // Attiva la compensazione utensile se richiesta
    if (this.options.toolCompensation !== 'none') {
      const compensationCode = this.options.toolCompensation === 'left' ? 'G41' : 'G42';
      this.gcode.push(`${compensationCode} D${feature.operation.toolNumber}`);
    }
    
    // Calcola il numero di passate di profondità
    const numDepthPasses = Math.ceil(Math.abs(feature.depth) / feature.operation.stepDown);
    
    // Per ogni passata di profondità
    for (let pass = 0; pass < numDepthPasses; pass++) {
      const currentDepth = Math.max(feature.depth, -pass * feature.operation.stepDown - feature.operation.stepDown);
      
      if (this.options.includeComments) {
        this.gcode.push(`(Depth pass ${pass + 1}/${numDepthPasses}, Z=${currentDepth.toFixed(this.options.precision)})`);
      }
      
      // Processa i percorsi di lavorazione a questa profondità
      for (let pathIndex = 0; pathIndex < feature.paths.length; pathIndex++) {
        const path = feature.paths[pathIndex];
        
        if (this.options.includeComments) {
          this.gcode.push(`(Path ${pathIndex + 1}/${feature.paths.length})`);
        }
        
        // Vai in posizione sicura
        this.gcode.push(`G0 Z${this.options.safeHeight.toFixed(this.options.precision)}`);
        
        if (path.type === 'linear') {
          // Processa percorso lineare
          this.processLinearPath(path, currentDepth, feature.operation.feedRate, feature.operation.plungeRate);
        } else if (path.type === 'arc') {
          // Processa percorso ad arco
          this.processArcPath(path, currentDepth, feature.operation.feedRate, feature.operation.plungeRate);
        }
      }
    }
    
    // Disattiva la compensazione utensile
    if (this.options.toolCompensation !== 'none') {
      this.gcode.push('G40');
    }
    
    // Torna in posizione sicura
    this.gcode.push(`G0 Z${this.options.safeHeight.toFixed(this.options.precision)}`);
  }
  
  /**
   * Processa un percorso lineare
   */
  private processLinearPath(path: MachinePath, depth: number, feedRate: number, plungeRate: number): void {
    if (path.points.length === 0) return;
    
    // Vai al primo punto in rapido
    const firstPoint = path.points[0];
    this.gcode.push(`G0 X${firstPoint.x.toFixed(this.options.precision)} Y${firstPoint.y.toFixed(this.options.precision)}`);
    
    // Scendi alla profondità di taglio
    this.gcode.push(`G1 Z${depth.toFixed(this.options.precision)} F${plungeRate.toFixed(0)}`);
    
    // Percorri tutti gli altri punti
    for (let i = 1; i < path.points.length; i++) {
      const point = path.points[i];
      this.gcode.push(`G1 X${point.x.toFixed(this.options.precision)} Y${point.y.toFixed(this.options.precision)} F${feedRate.toFixed(0)}`);
    }
    
    // Torna all'altezza di sicurezza
    this.gcode.push(`G0 Z${this.options.clearanceHeight.toFixed(this.options.precision)}`);
  }
  
  /**
   * Processa un percorso ad arco
   */
  private processArcPath(path: MachinePath, depth: number, feedRate: number, plungeRate: number): void {
    if (!path.startPoint || !path.endPoint || !path.centerPoint || !path.radius) return;
    
    // Vai al punto iniziale in rapido
    this.gcode.push(`G0 X${path.startPoint.x.toFixed(this.options.precision)} Y${path.startPoint.y.toFixed(this.options.precision)}`);
    
    // Scendi alla profondità di taglio
    this.gcode.push(`G1 Z${depth.toFixed(this.options.precision)} F${plungeRate.toFixed(0)}`);
    
    // Calcola gli offset dal punto corrente al centro dell'arco (formato I/J)
    const iValue = path.centerPoint.x - path.startPoint.x;
    const jValue = path.centerPoint.y - path.startPoint.y;
    
    // Genera il comando per l'arco
    const arcCommand = path.clockwise ? 'G2' : 'G3';
    this.gcode.push(
      `${arcCommand} X${path.endPoint.x.toFixed(this.options.precision)} ` +
      `Y${path.endPoint.y.toFixed(this.options.precision)} ` +
      `I${iValue.toFixed(this.options.precision)} ` +
      `J${jValue.toFixed(this.options.precision)} ` +
      `F${feedRate.toFixed(0)}`
    );
    
    // Torna all'altezza di sicurezza
    this.gcode.push(`G0 Z${this.options.clearanceHeight.toFixed(this.options.precision)}`);
  }
  
  /**
   * Aggiunge l'intestazione del programma G-code
   */
  private addHeader(): void {
    this.gcode.push('%');
    this.gcode.push('O0001 (THREE.JS TO FANUC G-CODE)');
    
    if (this.options.includeComments) {
      this.gcode.push('(Generated by THREE.js to G-code Converter)');
      this.gcode.push(`(Date: ${new Date().toISOString()})`);
      this.gcode.push('(Machine: FANUC)');
      this.gcode.push(`(Control: ${this.options.fanucDialect})`);
      this.gcode.push('');
    }
    
    // Impostazioni iniziali
    this.gcode.push('G90'); // Programmazione assoluta
    this.gcode.push('G17'); // Piano XY
    this.gcode.push('G21'); // Unità in millimetri
    this.gcode.push('G40'); // Annulla compensazione utensile
    this.gcode.push('G49'); // Annulla compensazione lunghezza utensile
    this.gcode.push('G54'); // Seleziona sistema di coordinate pezzo 1
    
    // Vai alla posizione sicura
    this.gcode.push(`G0 Z${this.options.safeHeight.toFixed(this.options.precision)}`);
  }
  
  /**
   * Aggiunge il footer del programma G-code
   */
  private addFooter(): void {
    // Vai alla posizione sicura
    this.gcode.push(`G0 Z${this.options.safeHeight.toFixed(this.options.precision)}`);
    
    // Ferma il mandrino
    this.gcode.push('M5');
    
    // Funzioni di fine programma specifiche FANUC
    switch (this.options.fanucDialect) {
      case '0i':
      case '0i-TD':
        this.gcode.push('M30');
        break;
      case '30i':
      case '31i':
      case '32i':
        this.gcode.push('M30');
        break;
      default:
        this.gcode.push('M30');
    }
    
    this.gcode.push('%');
  }
  
  /**
   * Append sottoprogrammi al G-code principale
   */
  private appendSubprograms(): void {
    if (this.subprograms.size === 0) return;
    
    this.gcode.push('');
    this.gcode.push('(SUBPROGRAMS)');
    
    this.subprograms.forEach((lines, id) => {
      this.gcode.push('');
      this.gcode.push(`O${id} (SUBPROGRAM)`);
      
      // Aggiungi le linee del sottoprogramma
      for (const line of lines) {
        this.gcode.push(line);
      }
      
      // Fine sottoprogramma
      this.gcode.push('M99');
    });
  }
  
  /**
   * Crea un sottoprogramma per percorsi ripetitivi
   */
  private createSubprogram(paths: MachinePath[], depth: number, feedRate: number, plungeRate: number): string {
    const subprogramId = `1000${this.currentSubprogramId++}`;
    const subprogramLines: string[] = [];
    
    // Processa i percorsi nel sottoprogramma
    for (const path of paths) {
      if (path.type === 'linear') {
        // Crea un percorso lineare nel sottoprogramma
        if (path.points.length === 0) continue;
        
        const firstPoint = path.points[0];
        subprogramLines.push(`G0 X${firstPoint.x.toFixed(this.options.precision)} Y${firstPoint.y.toFixed(this.options.precision)}`);
        subprogramLines.push(`G1 Z${depth.toFixed(this.options.precision)} F${plungeRate.toFixed(0)}`);
        
        for (let i = 1; i < path.points.length; i++) {
          const point = path.points[i];
          subprogramLines.push(`G1 X${point.x.toFixed(this.options.precision)} Y${point.y.toFixed(this.options.precision)} F${feedRate.toFixed(0)}`);
        }
        
        subprogramLines.push(`G0 Z${this.options.clearanceHeight.toFixed(this.options.precision)}`);
      } else if (path.type === 'arc' && path.startPoint && path.endPoint && path.centerPoint) {
        // Crea un percorso ad arco nel sottoprogramma
        subprogramLines.push(`G0 X${path.startPoint.x.toFixed(this.options.precision)} Y${path.startPoint.y.toFixed(this.options.precision)}`);
        subprogramLines.push(`G1 Z${depth.toFixed(this.options.precision)} F${plungeRate.toFixed(0)}`);
        
        const iValue = path.centerPoint.x - path.startPoint.x;
        const jValue = path.centerPoint.y - path.startPoint.y;
        
        const arcCommand = path.clockwise ? 'G2' : 'G3';
        subprogramLines.push(
          `${arcCommand} X${path.endPoint.x.toFixed(this.options.precision)} ` +
          `Y${path.endPoint.y.toFixed(this.options.precision)} ` +
          `I${iValue.toFixed(this.options.precision)} ` +
          `J${jValue.toFixed(this.options.precision)} ` +
          `F${feedRate.toFixed(0)}`
        );
        
        subprogramLines.push(`G0 Z${this.options.clearanceHeight.toFixed(this.options.precision)}`);
      }
    }
    
    // Memorizza il sottoprogramma
    this.subprograms.set(subprogramId, subprogramLines);
    
    return subprogramId;
  }
  
  /**
   * Ottimizza la sequenza di lavorazione
   */
  private optimizeMachiningSequence(): void {
    if (this.machiningFeatures.length <= 1) return;
    
    // Raggruppa le feature per utensile
    const featuresByTool = new Map<number, MachiningFeature[]>();
    
    for (const feature of this.machiningFeatures) {
      const toolNumber = feature.operation.toolNumber;
      
      if (!featuresByTool.has(toolNumber)) {
        featuresByTool.set(toolNumber, []);
      }
      
      featuresByTool.get(toolNumber)!.push(feature);
    }
    
    // Ottimizza l'ordine delle feature per ogni utensile
    const optimizedFeatures: MachiningFeature[] = [];
    
    // Ordina per numero utensile
    const sortedToolNumbers = Array.from(featuresByTool.keys()).sort((a, b) => a - b);
    
    for (const toolNumber of sortedToolNumbers) {
      const features = featuresByTool.get(toolNumber)!;
      
      // Ordina le feature per tipo di operazione (sgrossatura, semifinitura, finitura)
      features.sort((a, b) => {
        const operationOrder = {
          'roughing': 0,
          'semi-finishing': 1,
          'finishing': 2
        };
        
        return operationOrder[a.operation.type] - operationOrder[b.operation.type];
      });
      
      // Aggiungi le feature ottimizzate alla lista
      optimizedFeatures.push(...features);
    }
    
    // Sostituisci la lista di feature originale con quella ottimizzata
    this.machiningFeatures = optimizedFeatures;
  }
  
  /**
   * Resetta lo stato interno
   */
  private reset(): void {
    this.gcode = [];
    this.subprograms.clear();
    this.currentSubprogramId = 1;
    this.machiningFeatures = [];
    this.debugInfo = {};
  }
  
  /**
   * Parser STL
   */
  private parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
    // Implementazione semplificata del parser STL
    // In un'applicazione reale, utilizzeremmo la classe STLLoader di Three.js
    
    const geometry = new THREE.BufferGeometry();
    
    // Determina se il file è ASCII o binario
    const isBinary = this.isSTLBinary(buffer);
    
    if (isBinary) {
      // Parse STL binario
      const stlLoader = new THREE.BufferGeometryLoader();
      // Nota: Qui in realtà dovremmo convertire il buffer in geometria
      // Ma per semplicità assumiamo che il buffer sia già convertito
      return stlLoader.parse({} as any); // simulazione
    } else {
      // Parse STL ASCII
      const text = new TextDecoder().decode(buffer);
      return this.parseSTLString(text);
    }
  }
  
  /**
   * Verifica se un buffer STL è in formato binario
   */
  private isSTLBinary(buffer: ArrayBuffer): boolean {
    // Verifica euristico per determinare se un file STL è binario
    // Un file STL binario tipicamente ha dimensione = 84 + (50 * numFacce)
    
    const fileSize = buffer.byteLength;
    
    // Leggi il numero di facce (a 80 byte dall'inizio)
    const view = new DataView(buffer);
    const numFaces = view.getUint32(80, true);
    
    // Calcola la dimensione attesa per un file binario
    const expectedSize = 84 + (numFaces * 50);
    
    // Se la dimensione corrisponde, è probabilmente binario
    return Math.abs(fileSize - expectedSize) < 4; // Tolleranza di alcuni byte
  }
  
  /**
   * Parse STL ASCII
   */
  private parseSTLString(text: string): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    
    // Espressioni regolari per estrarre dati
    const vertexRegExp = /vertex\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/g;
    const normalRegExp = /normal\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/g;
    
    // Estrai tutte le coordinate dei vertici
    let match;
    while ((match = vertexRegExp.exec(text)) !== null) {
      vertices.push(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
      );
    }
    
    // Estrai tutte le normali
    while ((match = normalRegExp.exec(text)) !== null) {
      normals.push(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
      );
      
      // Ripeti la normale per tutti e tre i vertici del triangolo
      normals.push(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
      );
      
      normals.push(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
      );
    }
    
    // Crea gli attributi della geometria
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    return geometry;
  }
  
  /**
   * Parser OBJ
   */
  private parseOBJ(buffer: ArrayBuffer): THREE.BufferGeometry {
    // Implementazione semplificata del parser OBJ
    // In un'applicazione reale, utilizzeremmo la classe OBJLoader di Three.js
    
    const text = new TextDecoder().decode(buffer);
    const geometry = new THREE.BufferGeometry();
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    const vertexCoords: number[] = [];
    const normalCoords: number[] = [];
    const uvCoords: number[] = [];
    
    // Parse delle linee del file OBJ
    const lines = text.split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      
      if (parts.length === 0) continue;
      
      const prefix = parts[0];
      
      if (prefix === 'v') {
        // Vertice
        vertexCoords.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      } else if (prefix === 'vn') {
        // Normale
        normalCoords.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      } else if (prefix === 'vt') {
        // Coordinata UV
        uvCoords.push(
          parseFloat(parts[1]),
          parseFloat(parts[2])
        );
      } else if (prefix === 'f') {
        // Faccia
        for (let i = 1; i < parts.length; i++) {
          const indices = parts[i].split('/');
          
          // Indice vertice (1-based in OBJ)
          const vertexIndex = parseInt(indices[0]) - 1;
          vertices.push(
            vertexCoords[vertexIndex * 3],
            vertexCoords[vertexIndex * 3 + 1],
            vertexCoords[vertexIndex * 3 + 2]
          );
          
          // Indice UV (se presente)
          if (indices[1] && indices[1].length > 0) {
            const uvIndex = parseInt(indices[1]) - 1;
            uvs.push(
              uvCoords[uvIndex * 2],
              uvCoords[uvIndex * 2 + 1]
            );
          }
          
          // Indice normale (se presente)
          if (indices[2] && indices[2].length > 0) {
            const normalIndex = parseInt(indices[2]) - 1;
            normals.push(
              normalCoords[normalIndex * 3],
              normalCoords[normalIndex * 3 + 1],
              normalCoords[normalIndex * 3 + 2]
            );
          }
        }
      }
    }
    
    // Crea gli attributi della geometria
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    if (normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    
    if (uvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    
    return geometry;
  }
  
  /**
   * Parser STEP (semplificato)
   */
  private parseSTEP(buffer: ArrayBuffer): THREE.BufferGeometry {
    // Implementazione di un parser STEP è molto complessa
    // In un'applicazione reale, utilizzeremmo una libreria esterna come occt.js
    
    // Per semplicità, qui restituiamo una geometria vuota
    // e mostriamo un warning nel G-code
    
    const geometry = new THREE.BufferGeometry();
    
    if (this.options.includeComments) {
      this.debugInfo.warnings = this.debugInfo.warnings || [];
      this.debugInfo.warnings.push('STEP parsing is not fully implemented. Please use STL or OBJ files.');
    }
    
    return geometry;
  }
  
  /**
   * Merge di geometrie
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    // Implementazione semplificata di unione geometrie
    // In un'applicazione reale, utilizzeremmo una libreria CSG
    
    // Per semplicità, qui restituiamo solo la prima geometria
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    return geometries[0].clone();
  }
  
  /**
   * Sottrazione di geometrie
   */
  private subtractGeometries(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
    // Implementazione di sottrazione di geometrie è complessa
    // In un'applicazione reale, utilizzeremmo una libreria CSG
    
    // Per semplicità, qui restituiamo solo la prima geometria
    if (this.options.includeComments) {
      this.debugInfo.warnings = this.debugInfo.warnings || [];
      this.debugInfo.warnings.push('CSG subtract operation is not fully implemented. Returning first geometry only.');
    }
    
    return a.clone();
  }
  
  /**
   * Intersezione di geometrie
   */
  private intersectGeometries(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
    // Implementazione di intersezione di geometrie è complessa
    // In un'applicazione reale, utilizzeremmo una libreria CSG
    
    // Per semplicità, qui restituiamo solo la prima geometria
    if (this.options.includeComments) {
      this.debugInfo.warnings = this.debugInfo.warnings || [];
      this.debugInfo.warnings.push('CSG intersect operation is not fully implemented. Returning first geometry only.');
    }
    
    return a.clone();
  }
  
  /**
   * Restituisce le informazioni di debug
   */
  getDebugInfo(): any {
    return this.debugInfo;
  }
}

export { ThreeToGCode };
export type { GCodeOptions, MachinePath, MachiningFeature, MachiningOperation };