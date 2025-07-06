// Helper per integrazione WASM in ToolpathVisualizer
import * as THREE from "three";
import { WasmOptimizer, GCodePointInterface } from "@/src/lib/wasm/enhanced/wasmOptimizer";

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedRate?: number;
  spindleSpeed?: number;
  toolNumber?: number;
}

export interface OptimizedToolpath {
  points: ToolpathPoint[];
  segments: Array<{
    start: number;
    end: number;
    type: "rapid" | "linear" | "arc";
  }>;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

export class ToolpathWasmHelper {
  private wasmOptimizer: WasmOptimizer | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      this.wasmOptimizer = new WasmOptimizer();
      await this.wasmOptimizer.init();
      this.initialized = true;
      console.log("✅ Toolpath WASM Helper initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Toolpath WASM Helper:", error);
      throw error;
    }
  }

  isInitialized() {
    return this.initialized && this.wasmOptimizer !== null;
  }

  // Parsing G-Code ottimizzato
  async parseGCode(gcode: string): Promise<OptimizedToolpath> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    try {
      console.log("🔄 Parsing G-Code with WASM...");
      const startTime = performance.now();

      // Parse G-Code
      const gcodePoints = await this.wasmOptimizer.parseGCode(gcode);

      // Ottimizza il percorso
      const optimized = await this.wasmOptimizer.optimizeToolpath(gcodePoints);

      // Converti da GCodePointInterface a ToolpathPoint
      const toolpathPoints: ToolpathPoint[] = optimized.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z,
        feedRate: p.feedRate,
        spindleSpeed: undefined,
        toolNumber: undefined
      }));

      // Calcola i bounds
      const bounds = this.calculateBounds(toolpathPoints);

      const endTime = performance.now();
      console.log(`✅ G-Code parsed in ${(endTime - startTime).toFixed(2)}ms`);

      return {
        points: toolpathPoints,
        segments: this.identifySegments(toolpathPoints),
        bounds
      };
    } catch (error) {
      console.error("G-Code parsing failed:", error);
      throw error;
    }
  }

  // Processa cicli fissi (G81-G86)
  async processFixedCycles(gcode: string): Promise<ToolpathPoint[]> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    try {
      const expandedPoints = await this.wasmOptimizer.expandFixedCycles(gcode);
      return expandedPoints.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z,
        feedRate: p.feedRate,
        spindleSpeed: undefined,
        toolNumber: undefined
      }));
    } catch (error) {
      console.error("Fixed cycles processing failed:", error);
      return [];
    }
  }

  // Crea geometria Three.js ottimizzata per il toolpath
  createToolpathGeometry(toolpath: OptimizedToolpath): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < toolpath.segments.length; i++) {
      const segment = toolpath.segments[i];
      const startPoint = toolpath.points[segment.start];
      const endPoint = toolpath.points[segment.end];

      // Aggiungi posizioni
      positions.push(startPoint.x, startPoint.y, startPoint.z);
      positions.push(endPoint.x, endPoint.y, endPoint.z);

      // Colori basati sul tipo di movimento
      const color = this.getSegmentColor(segment.type);
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    return geometry;
  }

  // Crea mesh per visualizzazione tool
  async createToolVisualization(
    toolDiameter: number,
    toolLength: number,
    position: THREE.Vector3
  ): Promise<THREE.Mesh> {
    const geometry = new THREE.CylinderGeometry(toolDiameter / 2, toolDiameter / 2, toolLength, 16);

    // Ottimizza la mesh se WASM è disponibile
    if (this.wasmOptimizer) {
      try {
        const positions = geometry.attributes.position.array as Float32Array;
        const indices = new Uint32Array(geometry.index!.array);

        const normals = await this.wasmOptimizer.calculateNormals(positions, indices);
        geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      } catch (error) {
        console.warn("Tool mesh optimization skipped:", error);
      }
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2;

    return mesh;
  }

  // Analizza il toolpath per statistiche
  async analyzeToolpath(toolpath: OptimizedToolpath): Promise<{
    totalDistance: number;
    rapidDistance: number;
    cuttingDistance: number;
    estimatedTime: number;
    heightMap: Float32Array;
  }> {
    let totalDistance = 0;
    let rapidDistance = 0;
    let cuttingDistance = 0;

    for (const segment of toolpath.segments) {
      const start = toolpath.points[segment.start];
      const end = toolpath.points[segment.end];
      const distance = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2) + Math.pow(end.z - start.z, 2)
      );

      totalDistance += distance;
      if (segment.type === "rapid") {
        rapidDistance += distance;
      } else {
        cuttingDistance += distance;
      }
    }

    // Stima tempo basato su feed rates
    const avgFeedRate = 1000; // mm/min default
    const rapidFeedRate = 5000; // mm/min
    const estimatedTime = (cuttingDistance / avgFeedRate + rapidDistance / rapidFeedRate) * 60; // secondi

    // Genera height map per visualizzazione
    const heightMap = await this.generateHeightMap(toolpath);

    return {
      totalDistance,
      rapidDistance,
      cuttingDistance,
      estimatedTime,
      heightMap
    };
  }

  // Helper: calcola bounds del toolpath
  private calculateBounds(points: ToolpathPoint[]) {
    const bounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };

    for (const point of points) {
      bounds.min.x = Math.min(bounds.min.x, point.x);
      bounds.min.y = Math.min(bounds.min.y, point.y);
      bounds.min.z = Math.min(bounds.min.z, point.z);
      bounds.max.x = Math.max(bounds.max.x, point.x);
      bounds.max.y = Math.max(bounds.max.y, point.y);
      bounds.max.z = Math.max(bounds.max.z, point.z);
    }

    return bounds;
  }

  // Helper: identifica segmenti del toolpath
  private identifySegments(points: ToolpathPoint[]) {
    const segments = [];

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];

      // Determina il tipo di movimento basato su feedrate o Z
      const isRapid =
        !current.feedRate || current.feedRate > 1000 || (next.z > current.z && Math.abs(next.x - current.x) < 0.001);

      segments.push({
        start: i,
        end: i + 1,
        type: isRapid ? "rapid" : ("linear" as "rapid" | "linear")
      });
    }

    return segments;
  }

  // Helper: colore per tipo di segmento
  private getSegmentColor(type: "rapid" | "linear" | "arc") {
    switch (type) {
      case "rapid":
        return { r: 1, g: 0.5, b: 0 }; // Arancione
      case "linear":
        return { r: 0, g: 1, b: 0 }; // Verde
      case "arc":
        return { r: 0, g: 0.5, b: 1 }; // Blu
    }
  }

  // Genera height map per visualizzazione
  private async generateHeightMap(toolpath: OptimizedToolpath): Promise<Float32Array> {
    // Placeholder - implementazione futura
    const size = 256;
    const heightMap = new Float32Array(size * size);

    // Per ora ritorna una height map vuota
    return heightMap;
  }

  // Cleanup
  dispose() {
    this.wasmOptimizer = null;
    this.initialized = false;
  }
}
