// Helper per integrazione WASM in CADCanvas
import * as THREE from "three";
import {
  WasmOptimizer,
  optimizeMesh,
  performCSGOperation,
  calculateNormals,
  calculateSnapPoints,
  frustumCull,
  MeshDataInterface,
  initWasmOptimizer
} from "../wasm/enhanced/wasmOptimizer";

export class CADWasmHelper {
  private wasmOptimizer: WasmOptimizer | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      await initWasmOptimizer();
      this.wasmOptimizer = new WasmOptimizer();
      await this.wasmOptimizer.init();
      this.initialized = true;
      console.log("✅ CAD WASM Helper initialized");
    } catch (error) {
      console.error("❌ Failed to initialize CAD WASM Helper:", error);
      throw error;
    }
  }

  isInitialized() {
    return this.initialized && this.wasmOptimizer !== null;
  }

  // Ottimizza mesh per performance
  async optimizeMesh(geometry: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;

    if (!indices) {
      console.warn("Mesh has no indices, skipping optimization");
      return geometry;
    }

    try {
      // Calcola le normali ottimizzate
      const normals = await calculateNormals(positions, indices);

      // Applica la decimazione se necessario
      const vertexCount = positions.length / 3;
      if (vertexCount > 10000) {
        const reductionFactor = 0.5; // 50% reduction
        const decimated = await optimizeMesh(positions, indices, reductionFactor);

        // Crea nuova geometria con mesh decimata
        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute("position", new THREE.BufferAttribute(decimated.vertices, 3));
        newGeometry.setIndex(new THREE.BufferAttribute(decimated.indices, 1));
        newGeometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

        return newGeometry;
      }

      // Applica solo le normali se non serve decimazione
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      return geometry;
    } catch (error) {
      console.error("Mesh optimization failed:", error);
      return geometry;
    }
  }

  // Calcola snap points ottimizzati
  async calculateSnapPoints(geometry: THREE.BufferGeometry): Promise<THREE.Vector3[]> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    try {
      const positions = geometry.attributes.position.array as Float32Array;
      const indices = (geometry.index?.array as Uint32Array) || new Uint32Array(0);

      const threshold = 0.1; // Threshold for snap points
      const snapPointsData = await calculateSnapPoints(positions, threshold);

      // Converti in Vector3 (ogni 3 valori rappresentano x,y,z)
      const snapPoints: THREE.Vector3[] = [];
      for (let i = 0; i < snapPointsData.length; i += 3) {
        snapPoints.push(new THREE.Vector3(snapPointsData[i], snapPointsData[i + 1], snapPointsData[i + 2]));
      }
      return snapPoints;
    } catch (error) {
      console.error("Snap points calculation failed:", error);
      return [];
    }
  }

  // Esegui operazioni CSG ottimizzate
  async performCSG(
    meshA: THREE.BufferGeometry,
    meshB: THREE.BufferGeometry,
    operation: "union" | "subtract" | "intersect"
  ): Promise<THREE.BufferGeometry> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    try {
      const meshDataA = this.geometryToMeshData(meshA);
      const meshDataB = this.geometryToMeshData(meshB);

      const result = await performCSGOperation(operation, meshDataA, meshDataB);

      return this.meshDataToGeometry(result);
    } catch (error) {
      console.error("CSG operation failed:", error);
      throw error;
    }
  }

  // Frustum culling ottimizzato
  async performFrustumCulling(
    objects: Array<{ id: string; bounds: THREE.Box3 }>,
    camera: THREE.PerspectiveCamera
  ): Promise<string[]> {
    if (!this.wasmOptimizer) throw new Error("WASM not initialized");

    try {
      // Estrai matrice view-projection
      const viewMatrix = camera.matrixWorldInverse.elements;
      const projMatrix = camera.projectionMatrix.elements;

      // Converti bounds in formato WASM
      const bounds = objects.map(obj => ({
        min: [obj.bounds.min.x, obj.bounds.min.y, obj.bounds.min.z] as [number, number, number],
        max: [obj.bounds.max.x, obj.bounds.max.y, obj.bounds.max.z] as [number, number, number]
      }));

      const visibleMask = await frustumCull(
        new Float32Array(Array.from(viewMatrix).concat(Array.from(projMatrix))),
        bounds
      );

      // Ritorna gli ID degli oggetti visibili
      return visibleMask
        .map((isVisible: boolean, index: number) => (isVisible ? objects[index].id : null))
        .filter((id: string | null) => id !== null) as string[];
    } catch (error) {
      console.error("Frustum culling failed:", error);
      return objects.map(o => o.id); // Fallback: tutti visibili
    }
  }

  // Helper: converti THREE.BufferGeometry in MeshData
  private geometryToMeshData(geometry: THREE.BufferGeometry): MeshDataInterface {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;

    if (!indices) {
      throw new Error("Geometry must have indices for CSG operations");
    }

    return {
      vertices: positions,
      indices: indices
    };
  }

  // Helper: converti MeshData in THREE.BufferGeometry
  private meshDataToGeometry(meshData: MeshDataInterface): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(meshData.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

    if (meshData.normals) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    return geometry;
  }

  // Cleanup
  dispose() {
    this.wasmOptimizer = null;
    this.initialized = false;
  }
}
