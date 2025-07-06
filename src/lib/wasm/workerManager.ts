// Manager per gestire comunicazioni con Worker WASM
import { MeshDataInterface, GCodePointInterface } from "./enhanced/wasmOptimizer";

interface PendingOperation {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class WasmWorkerManager {
  private worker: Worker | null = null;
  private pendingOperations: Map<string, PendingOperation> = new Map();
  private operationCounter = 0;
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      // Crea il worker
      this.worker = new Worker(new URL("./threeWorker.ts", import.meta.url), { type: "module" });

      // Gestisci le risposte del worker
      this.worker.onmessage = event => {
        const { id, success, data, error } = event.data;
        const pendingOp = this.pendingOperations.get(id);

        if (pendingOp) {
          this.pendingOperations.delete(id);

          if (success) {
            pendingOp.resolve(data);
          } else {
            pendingOp.reject(new Error(error || "Worker operation failed"));
          }
        }
      };

      // Gestisci gli errori del worker
      this.worker.onerror = error => {
        console.error("Worker error:", error);
        this.rejectAllPending("Worker error occurred");
      };

      // Gestisci la terminazione del worker
      this.worker.onmessageerror = error => {
        console.error("Worker message error:", error);
        this.rejectAllPending("Worker message error");
      };

      console.log("✅ WASM Worker Manager initialized");
    } catch (error) {
      console.error("❌ Failed to initialize WASM Worker:", error);
    }
  }

  private rejectAllPending(reason: string) {
    for (const [id, operation] of Array.from(this.pendingOperations.entries())) {
      operation.reject(new Error(reason));
    }
    this.pendingOperations.clear();
  }

  private async sendMessage<T = any>(type: string, data?: any): Promise<T> {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }

    const id = `op_${++this.operationCounter}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingOperations.delete(id);
        reject(new Error("Worker operation timeout"));
      }, 30000); // 30 secondi di timeout

      this.pendingOperations.set(id, {
        resolve: value => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now()
      });

      this.worker!.postMessage({ id, type, data });
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.sendMessage("init");
      this.isInitialized = true;
      console.log("✅ WASM Worker initialized");
    } catch (error) {
      console.error("❌ Failed to initialize WASM Worker:", error);
      throw error;
    }
  }

  async optimizeMesh(
    vertices: Float32Array,
    indices: Uint32Array,
    reductionFactor: number
  ): Promise<MeshDataInterface> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendMessage("optimizeMesh", {
      vertices: Array.from(vertices),
      indices: Array.from(indices),
      reductionFactor
    });
  }

  async performCSGOperation(
    operation: "union" | "subtract" | "intersect",
    meshA: MeshDataInterface,
    meshB: MeshDataInterface
  ): Promise<MeshDataInterface> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendMessage("csgOperation", {
      operation,
      meshA,
      meshB
    });
  }

  async calculateNormals(vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const result = await this.sendMessage("calculateNormals", {
      vertices: Array.from(vertices),
      indices: Array.from(indices)
    });

    return new Float32Array(result);
  }

  async parseGCode(gcode: string): Promise<GCodePointInterface[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendMessage("parseGCode", { gcode });
  }

  async optimizeToolpath(points: GCodePointInterface[]): Promise<GCodePointInterface[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendMessage("optimizeToolpath", { points });
  }

  async frustumCull(
    viewProjectionMatrix: Float32Array,
    boundingBoxes: Array<{ min: [number, number, number]; max: [number, number, number] }>
  ): Promise<boolean[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendMessage("frustumCull", {
      viewProjectionMatrix: Array.from(viewProjectionMatrix),
      boundingBoxes
    });
  }

  // Cleanup e gestione dello stato
  getStats() {
    return {
      isInitialized: this.isInitialized,
      pendingOperations: this.pendingOperations.size,
      workerAvailable: !!this.worker
    };
  }

  dispose() {
    if (this.worker) {
      this.rejectAllPending("Worker disposed");
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    console.log("🧹 WASM Worker Manager disposed");
  }
}

// Singleton instance
let globalWorkerManager: WasmWorkerManager | null = null;

export function getWasmWorkerManager(): WasmWorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WasmWorkerManager();
  }
  return globalWorkerManager;
}

export function disposeWasmWorkerManager() {
  if (globalWorkerManager) {
    globalWorkerManager.dispose();
    globalWorkerManager = null;
  }
}
