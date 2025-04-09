// src/workers/threeWorker.ts
// This file will be used as a Web Worker to offload heavy Three.js calculations

import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

// Types for serialized geometry and mesh
interface SerializedBufferAttribute {
  array: ArrayBufferLike;
  itemSize: number;
  normalized: boolean;
}

interface SerializedBufferGeometry {
  uuid: string;
  type: string;
  attributes: {
    position: SerializedBufferAttribute;
    normal?: SerializedBufferAttribute;
    uv?: SerializedBufferAttribute;
  };
  index?: {
    array: ArrayBufferLike;
    itemSize: number;
  };
}

interface SerializedMaterial {
  uuid: string;
  type: string;
  color: number;
  opacity: number;
  transparent: boolean;
}

interface SerializedMesh {
  uuid: string;
  type: string;
  geometry: SerializedBufferGeometry;
  material: SerializedMaterial;
  matrix: number[];
}

// Type definitions for messages
type WorkerMessageData = {
  type: string;
  id: number;
  payload: any;
};

/**
 * Serialize a THREE.BufferGeometry to a transferable object
 */
function serializeGeometry(geometry: THREE.BufferGeometry): SerializedBufferGeometry {
  const result: SerializedBufferGeometry = {
    uuid: geometry.uuid,
    type: 'BufferGeometry',
    attributes: {
      position: {
        array: geometry.attributes.position.array.buffer,
        itemSize: geometry.attributes.position.itemSize,
        normalized: geometry.attributes.position.normalized
      }
    }
  };
  
  // Add normal attribute if it exists
  if (geometry.attributes.normal) {
    result.attributes.normal = {
      array: geometry.attributes.normal.array.buffer,
      itemSize: geometry.attributes.normal.itemSize,
      normalized: geometry.attributes.normal.normalized
    };
  }
  
  // Add UV attribute if it exists
  if (geometry.attributes.uv) {
    result.attributes.uv = {
      array: geometry.attributes.uv.array.buffer,
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
 * Deserialize a SerializedBufferGeometry to THREE.BufferGeometry
 */
function deserializeGeometry(serialized: SerializedBufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Add position attribute
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      new Float32Array(serialized.attributes.position.array),
      serialized.attributes.position.itemSize,
      serialized.attributes.position.normalized
    )
  );
  
  // Add normal attribute if it exists
  if (serialized.attributes.normal) {
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        new Float32Array(serialized.attributes.normal.array),
        serialized.attributes.normal.itemSize,
        serialized.attributes.normal.normalized
      )
    );
  }
  
  // Add UV attribute if it exists
  if (serialized.attributes.uv) {
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        new Float32Array(serialized.attributes.uv.array),
        serialized.attributes.uv.itemSize,
        serialized.attributes.uv.normalized
      )
    );
  }
  
  // Add index if it exists
  if (serialized.index) {
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint16Array(serialized.index.array),
        serialized.index.itemSize
      )
    );
  }
  
  // Set UUID
  geometry.uuid = serialized.uuid;
  
  return geometry;
}

/**
 * Serialize a THREE.Material to a transferable object
 */
function serializeMaterial(material: THREE.Material): SerializedMaterial {
  // This is a simplified serializer for basic materials
  // A full implementation would handle all material types and properties
  return {
    uuid: material.uuid,
    type: material.type,
    color: (material as any).color?.getHex() || 0xffffff,
    opacity: material.opacity,
    transparent: material.transparent
  };
}

/**
 * Deserialize a SerializedMaterial to THREE.Material
 */
function deserializeMaterial(serialized: SerializedMaterial): THREE.Material {
  let material: THREE.Material;
  
  // Create appropriate material based on type
  switch (serialized.type) {
    case 'MeshBasicMaterial':
      material = new THREE.MeshBasicMaterial({
        color: serialized.color,
        opacity: serialized.opacity,
        transparent: serialized.transparent
      });
      break;
      
    case 'MeshStandardMaterial':
      material = new THREE.MeshStandardMaterial({
        color: serialized.color,
        opacity: serialized.opacity,
        transparent: serialized.transparent
      });
      break;
      
    case 'MeshPhongMaterial':
      material = new THREE.MeshPhongMaterial({
        color: serialized.color,
        opacity: serialized.opacity,
        transparent: serialized.transparent
      });
      break;
      
    default:
      // Default to basic material
      material = new THREE.MeshBasicMaterial({
        color: serialized.color,
        opacity: serialized.opacity,
        transparent: serialized.transparent
      });
  }
  
  // Set UUID
  material.uuid = serialized.uuid;
  
  return material;
}

/**
 * Serialize a THREE.Mesh to a transferable object
 */
function serializeMesh(mesh: THREE.Mesh): SerializedMesh {
  return {
    uuid: mesh.uuid,
    type: 'Mesh',
    geometry: serializeGeometry(mesh.geometry as THREE.BufferGeometry),
    material: serializeMaterial(mesh.material as THREE.Material),
    matrix: Array.from(mesh.matrix.elements)
  };
}

/**
 * Deserialize a SerializedMesh to THREE.Mesh
 */
function deserializeMesh(serialized: SerializedMesh): THREE.Mesh {
  // Create geometry and material
  const geometry = deserializeGeometry(serialized.geometry);
  const material = deserializeMaterial(serialized.material);
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  
  // Set UUID
  mesh.uuid = serialized.uuid;
  
  // Set matrix
  mesh.matrix.fromArray(serialized.matrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  
  return mesh;
}

// Handle messages from main thread
self.onmessage = function(event: MessageEvent<WorkerMessageData>) {
  const { type, id, payload } = event.data;
  
  try {
    let result;
    let transferables: Transferable[] = [];
    
    switch (type) {
      case 'CSG_OPERATION':
        result = handleCSGOperation(payload);
        // Add buffer attributes to transferables for better performance
        if (result.geometry.attributes.position) {
          transferables.push(result.geometry.attributes.position.array as unknown as ArrayBuffer);
        }
        if (result.geometry.attributes.normal) {
          transferables.push(result.geometry.attributes.normal.array as unknown as ArrayBuffer);
        }
        if (result.geometry.attributes.uv) {
          transferables.push(result.geometry.attributes.uv.array as unknown as ArrayBuffer);
        }
        if (result.geometry.index) {
          transferables.push(result.geometry.index.array as unknown as ArrayBuffer);
        }
        break;
        
      case 'MESH_SIMPLIFICATION':
        result = handleMeshSimplification(payload);
        if (result.geometry.attributes.position) {
          transferables.push(result.geometry.attributes.position.array as unknown as ArrayBuffer);
        }
        break;
        
      case 'BOOLEAN_OPERATION':
        result = handleBooleanOperation(payload);
        if (result.geometry.attributes.position) {
          transferables.push(result.geometry.attributes.position.array as unknown as ArrayBuffer);
        }
        break;
        
      case 'COMPUTE_NORMALS':
        result = handleComputeNormals(payload);
        if (result.attributes.normal) {
          transferables.push(result.attributes.normal.array as unknown as ArrayBuffer);
        }
        break;
        
      case 'EXTRUDE_SHAPE':
        result = handleExtrudeShape(payload);
        if (result.attributes.position) {
          transferables.push(result.attributes.position.array as unknown as ArrayBuffer);
        }
        break;
        
      case 'LATHE_GEOMETRY':
        result = handleLatheGeometry(payload);
        if (result.attributes.position) {
          transferables.push(result.attributes.position.array as unknown as ArrayBuffer);
        }
        break;
        
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
    
    // Send success response back to main thread with transferables
    self.postMessage({
      type: 'SUCCESS',
      id,
      result
    }, { transfer: transferables });
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      type: 'ERROR',
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

/**
 * Handle CSG (Constructive Solid Geometry) operations
 */
function handleCSGOperation(payload: {
  operation: 'union' | 'subtract' | 'intersect';
  meshA: SerializedMesh;
  meshB: SerializedMesh;
}) {
  // Deserialize meshes
  const meshA = deserializeMesh(payload.meshA);
  const meshB = deserializeMesh(payload.meshB);
  
  // Perform CSG operation
  let resultMesh;
  
  switch (payload.operation) {
    case 'union':
      resultMesh = CSG.union(meshA, meshB);
      break;
    case 'subtract':
      resultMesh = CSG.subtract(meshA, meshB);
      break;
    case 'intersect':
      resultMesh = CSG.intersect(meshA, meshB);
      break;
    default:
      throw new Error(`Unknown CSG operation: ${payload.operation}`);
  }
  
  // Return serialized result
  return serializeMesh(resultMesh);
}

/**
 * Handle mesh simplification
 */
function handleMeshSimplification(payload: {
  mesh: SerializedMesh;
  targetReduction: number;
}) {
  // Deserialize mesh
  const mesh = deserializeMesh(payload.mesh);
  
  // In a real implementation, you would use a simplification library here
  // This is just a dummy implementation
  const geometry = mesh.geometry;
  
  // Create a simplified version by sampling vertices
  // (Not a real simplification algorithm, just for demonstration)
  const positions = geometry.attributes.position.array;
  const newPositions = [];
  
  const stride = Math.max(2, Math.floor(1 / (1 - payload.targetReduction)));
  
  for (let i = 0; i < positions.length; i += 3 * stride) {
    if (i < positions.length) {
      newPositions.push(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      );
    }
  }
  
  // Create new geometry
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(newPositions, 3)
  );
  newGeometry.computeVertexNormals();
  
  // Create new mesh
  const newMesh = new THREE.Mesh(newGeometry, mesh.material);
  
  // Return serialized result
  return serializeMesh(newMesh);
}

/**
 * Handle boolean operations between geometries
 */
function handleBooleanOperation(payload: {
  operation: 'union' | 'subtract' | 'intersect';
  meshA: SerializedMesh;
  meshB: SerializedMesh;
}) {
  // This is a duplicate of CSG operation but kept for API compatibility
  return handleCSGOperation(payload);
}

/**
 * Handle normal computation for a geometry
 */
function handleComputeNormals(payload: {
  geometry: SerializedBufferGeometry;
}) {
  // Deserialize geometry
  const geometry = deserializeGeometry(payload.geometry);
  
  // Compute vertex normals
  geometry.computeVertexNormals();
  
  // Return serialized geometry
  return serializeGeometry(geometry);
}

/**
 * Handle shape extrusion
 */
function handleExtrudeShape(payload: {
  shape: any; // Points defining the shape
  options: THREE.ExtrudeGeometryOptions;
}) {
  // Create shape from points
  const shape = new THREE.Shape();
  const points = payload.shape.points;
  
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  
  // Create extruded geometry
  const geometry = new THREE.ExtrudeGeometry(shape, payload.options);
  
  // Return serialized geometry
  return serializeGeometry(geometry);
}

/**
 * Handle lathe operation (revolved geometry)
 */
function handleLatheGeometry(payload: {
  points: any[]; // Points to revolve
  segments: number;
  phiStart: number;
  phiLength: number;
}) {
  // Convert points to Vector2
  const points = payload.points.map(
    p => new THREE.Vector2(p.x, p.y)
  );
  
  // Create lathe geometry
  const geometry = new THREE.LatheGeometry(
    points,
    payload.segments,
    payload.phiStart,
    payload.phiLength
  );
  
  // Return serialized geometry
  return serializeGeometry(geometry);
}