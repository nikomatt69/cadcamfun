export interface GCodeCommand {
    command: string;
    parameters: Record<string, number>;
    comment?: string;
  }
  
  export interface GCodeValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
  }
  
  export interface GCodeMetrics {
    travelDistance: number;
    estimatedTime: number;
    rapidMoves: number;
    feedMoves: number;
    toolChanges: number;
    maxZ: number;
    minZ: number;
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  }

  /**
   * Tipi di operazioni di fresatura supportati
   */
  export enum MillingOperationType {
    CONTOUR = 'contour',        // Contornatura (profilo esterno)
    POCKET = 'pocket',          // Tasca (svuotamento area interna)
    DRILL = 'drill',            // Foratura
    FACE = 'face',              // Spianatura
    CHAMFER = 'chamfer',        // Smusso
    FILLET = 'fillet',          // Raccordo
    ENGRAVE = 'engrave',        // Incisione
    THREAD_MILL = 'thread_mill', // Filettatura con fresa
    SURFACE = 'surface',        // Lavorazione superficie 3D
    V_CARVE = 'v_carve'         // Incisione con punta V
  }

  /**
   * Interfaccia per descrivere un utensile da fresatura
   */
  export interface MillingTool {
    id: number;                 // ID utensile
    name: string;               // Nome utensile
    type: string;               // Tipo utensile (endmill, ballnose, v-bit, ecc.)
    diameter: number;           // Diametro (mm)
    numberOfFlutes: number;     // Numero di taglienti
    fluteLength: number;        // Lunghezza taglienti (mm)
    shankDiameter: number;      // Diametro gambo (mm)
    overallLength: number;      // Lunghezza totale (mm)
    
    // Parametri di taglio consigliati
    spindleSpeed: number;       // Velocità mandrino (RPM)
    feedRate: number;           // Velocità avanzamento (mm/min)
    plungeRate: number;         // Velocità penetrazione (mm/min)
    
    // Parametri opzionali
    cornerRadius?: number;      // Raggio angolo (per frese a spigolo arrotondato)
    taperAngle?: number;        // Angolo conicità (gradi, per punte coniche)
    material?: string;          // Materiale utensile (HSS, carbide, ecc.)
    coating?: string;           // Rivestimento (TiN, AlTiN, ecc.)
  }

  /**
   * Interfaccia per un punto del percorso utensile
   */
  export interface ToolpathPoint {
    x: number;                  // Coordinata X
    y: number;                  // Coordinata Y
    z: number;                  // Coordinata Z
    type: 'rapid' | 'linear' | 'arc_cw' | 'arc_ccw' | 'dwell'; // Tipo di movimento
    feedRate?: number;          // Velocità avanzamento (mm/min)
    
    // Per archi
    i?: number;                 // Offset X dal punto iniziale al centro dell'arco
    j?: number;                 // Offset Y dal punto iniziale al centro dell'arco
    k?: number;                 // Offset Z dal punto iniziale al centro dell'arco
    r?: number;                 // Raggio arco (alternativa a i,j,k)
    
    // Per sosta
    dwell?: number;             // Tempo di sosta (secondi)
    
    // Metadati
    toolId?: number;            // ID utensile usato
    comment?: string;           // Commento
  }