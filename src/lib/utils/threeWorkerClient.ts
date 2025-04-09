// src/utils/threeWorkerClient.ts
import * as THREE from 'three';

// Type definitions matching the worker
type WorkerRequestType = 
  | 'CSG_OPERATION'
  | 'MESH_SIMPLIFICATION'
  | 'BOOLEAN_OPERATION'
  | 'COMPUTE_NORMALS'
  | 'EXTRUDE_SHAPE'
  | 'LATHE_GEOMETRY';

type WorkerResponseType = 'SUCCESS' | 'ERROR';

interface WorkerResponse {
  type: WorkerResponseType;
  id: number;
  result?: any;
  error?: string;
}

/**
 * Client for interacting with the Three.js Web Worker
 */
export class ThreeWorkerClient {
  private worker: Worker;
  private messageId = 0;
  private pendingPromises: Map<number, { 
    resolve: (value: any) => void; 
    reject: (reason: any) => void;
  }> = new Map();
  
  /**
   * Create a new Three.js worker client
   */
  constructor() {
    // Create worker
    this.worker = new Worker(new URL('../workers/threeWorker.ts', import.meta.url), {
      type: 'module'
    });
    
    // Setup message handler
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }
  
  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const { type, id, result, error } = event.data;
    
    // Get promise handlers
    const promise = this.pendingPromises.get(id);
    if (!promise) {
      console.warn(`Received response for unknown request ID: ${id}`);
      return;
    }
    
    // Remove from pending promises
    this.pendingPromises.delete(id);
    
    // Resolve or reject the promise
    if (type === 'SUCCESS') {
      promise.resolve(result);
    } else {
      promise.reject(new Error(error));
    }
  }
  
  /**
   * Send a request to the worker
   */
  private sendRequest<T>(type: WorkerRequestType, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      
      // Store promise handlers
      this.pendingPromises.set(id, { resolve, reject });
      
      // Send message to worker
      this.worker.postMessage({ type, id, payload });
    });
  }
  
  /**
   * Perform CSG operation between two meshes
   */
  performCSGOperation(
    operation: 'union' | 'subtract' | 'intersect',
    meshA: THREE.Mesh,
    meshB: THREE.Mesh
  ): Promise<any> {
    return this.sendRequest('CSG_OPERATION', {
      operation,
      meshA: this.serializeMesh(meshA),
      meshB: this.serializeMesh(meshB)
    });
  }
  
  /**
   * Simplify a mesh to reduce geometry complexity
   */
  simplifyMesh(
    mesh: THREE.Mesh,
    targetReduction: number
  ): Promise<any> {
    return this.sendRequest('MESH_SIMPLIFICATION', {
      mesh: this.serializeMesh(mesh),
      targetReduction
    });
  }
  
  /**
   * Perform boolean operation between two meshes
   */
  performBooleanOperation(
    operation: 'union' | 'subtract' | 'intersect',
    meshA: THREE.Mesh,
    meshB: THREE.Mesh
  ): Promise<any> {
    return this.sendRequest('BOOLEAN_OPERATION', {
      operation,
      meshA: this.serializeMesh(meshA),
      meshB: this.serializeMesh(meshB)
    });
  }
  
  /**
   * Compute normals for a geometry
   */
  computeNormals(
    geometry: THREE.BufferGeometry
  ): Promise<any> {
    return this.sendRequest('COMPUTE_NORMALS', {
      geometry: this.serializeGeometry(geometry)
    });
  }
  
  /**
   * Create an extruded shape
   */
  createExtrudedShape(
    shape: THREE.Shape | { points: { x: number; y: number }[] },
    options: THREE.ExtrudeGeometryOptions
  ): Promise<any> {
    const shapeData = shape instanceof THREE.Shape ? {
      points: shape.getPoints().map(p => ({ x: p.x, y: p.y }))
    } : shape;
    
    return this.sendRequest('EXTRUDE_SHAPE', {
      shape: shapeData,
      options
    });
  }
  
  /**
   * Create a lathe geometry (revolved around an axis)
   */
  createLatheGeometry(
    points: THREE.Vector2[] | { x: number; y: number }[],
    segments: number = 12,
    phiStart: number = 0,
    phiLength: number = Math.PI * 2
  ): Promise<any> {
    const pointsData = points.map(p => {
      if (p instanceof THREE.Vector2) {
        return { x: p.x, y: p.y };
      }
      return p;
    });
    
    return this.sendRequest('LATHE_GEOMETRY', {
      points: pointsData,
      segments,
      phiStart,
      phiLength
    });
  }
  
  /**
   * Helper method to serialize a mesh for transfer to worker
   */
  private serializeMesh(mesh: THREE.Mesh): any {
    return {
      uuid: mesh.uuid,
      type: 'Mesh',
      geometry: this.serializeGeometry(mesh.geometry as THREE.BufferGeometry),
      material: this.serializeMaterial(mesh.material as THREE.Material),
      matrix: Array.from(mesh.matrix.elements)
    };
  }
  
  /**
   * Helper method to serialize a geometry for transfer to worker
   */
  private serializeGeometry(geometry: THREE.BufferGeometry): any {
    const result: any = {
      uuid: geometry.uuid,
      type: 'BufferGeometry',
      attributes: {
        position: {
          array: (geometry.attributes.position.array as Float32Array).buffer,
          itemSize: geometry.attributes.position.itemSize,
          normalized: geometry.attributes.position.normalized
        }
      }
    };
    
    // Add normal attribute if it exists
    if (geometry.attributes.normal) {
      result.attributes.normal = {
        array: (geometry.attributes.normal.array as Float32Array).buffer,
        itemSize: geometry.attributes.normal.itemSize,
        normalized: geometry.attributes.normal.normalized
      };
    }
    
    // Add UV attribute if it exists
    if (geometry.attributes.uv) {
      result.attributes.uv = {
        array: (geometry.attributes.uv.array as Float32Array).buffer,
        itemSize: geometry.attributes.uv.itemSize,
        normalized: geometry.attributes.uv.normalized
      };
    }
    
    // Add index if it exists
    if (geometry.index) {
      result.index = {
        array: geometry.index.array.buffer,
        itemSize: 1
      };
    }
    
    return result;
  }
  
  /**
   * Helper method to serialize a material for transfer to worker
   */
  private serializeMaterial(material: THREE.Material): any {
    // Simplified material serialization
    return {
      uuid: material.uuid,
      type: material.type,
      color: (material as any).color?.getHex() || 0xffffff,
      opacity: material.opacity,
      transparent: material.transparent
    };
  }
  
  /**
   * Terminate the worker when no longer needed
   */
  dispose(): void {
    // Reject any pending promises
    this.pendingPromises.forEach(({ reject }) => {
      reject(new Error('Worker was disposed'));
    });
    this.pendingPromises.clear();
    
    // Terminate worker
    this.worker.terminate();
  }
}

// Export singleton instance
export default new ThreeWorkerClient();