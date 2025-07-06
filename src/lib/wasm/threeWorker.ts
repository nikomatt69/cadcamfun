// Three.js Worker per computazioni WASM pesanti
import {
  initWasmOptimizer,
  optimizeMesh,
  performCSGOperation,
  calculateNormals,
  parseGCode,
  optimizeToolpath,
  frustumCull,
  MeshDataInterface,
  GCodePointInterface
} from "./enhanced/wasmOptimizer";

// Tipologie di messaggi supportati
interface WorkerMessage {
  id: string;
  type:
    | "init"
    | "optimizeMesh"
    | "csgOperation"
    | "calculateNormals"
    | "parseGCode"
    | "optimizeToolpath"
    | "frustumCull";
  data?: any;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

let isInitialized = false;

// Gestione messaggi dal thread principale
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data;

  try {
    let result: any;

    // Inizializza WASM se necessario
    if (!isInitialized && type !== "init") {
      await initWasmOptimizer();
      isInitialized = true;
    }

    switch (type) {
      case "init":
        await initWasmOptimizer();
        isInitialized = true;
        result = { initialized: true };
        break;

      case "optimizeMesh":
        const { vertices, indices, reductionFactor } = data;
        result = await optimizeMesh(new Float32Array(vertices), new Uint32Array(indices), reductionFactor);
        break;

      case "csgOperation":
        const { operation, meshA, meshB } = data;
        result = await performCSGOperation(operation, meshA, meshB);
        break;

      case "calculateNormals":
        const { vertices: v, indices: i } = data;
        result = await calculateNormals(new Float32Array(v), new Uint32Array(i));
        break;

      case "parseGCode":
        const { gcode } = data;
        result = await parseGCode(gcode);
        break;

      case "optimizeToolpath":
        const { points } = data;
        result = await optimizeToolpath(points);
        break;

      case "frustumCull":
        const { viewProjectionMatrix, boundingBoxes } = data;
        result = await frustumCull(new Float32Array(viewProjectionMatrix), boundingBoxes);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    // Invia il risultato al thread principale
    const response: WorkerResponse = {
      id,
      success: true,
      data: result
    };

    self.postMessage(response);
  } catch (error) {
    // Invia l'errore al thread principale
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };

    self.postMessage(response);
  }
};

// Helper per logging nel worker
function workerLog(message: string, ...args: any[]) {
  console.log(`[ThreeWorker] ${message}`, ...args);
}

// Inizializzazione del worker
workerLog("Three.js WASM Worker initialized");

export {};
