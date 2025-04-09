import * as THREE from "three";

class CanvasPool {
  private static pool: Map<string, HTMLCanvasElement> = new Map();
  private static texturePool: Map<string, THREE.Texture> = new Map();
  private static maxPoolSize = 20; // Limite massimo di canvas in pool
  
  static getCanvas(key: string, width: number, height: number): HTMLCanvasElement {
    if (!this.pool.has(key)) {
      // Se il pool è pieno, rimuovi il canvas più vecchio
      if (this.pool.size >= this.maxPoolSize) {
        const oldestKey = this.pool.keys().next().value;
        this.releaseCanvas(oldestKey as string);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.pool.set(key, canvas);
    }
    return this.pool.get(key)!;
  }
  
  static getTexture(key: string, width: number, height: number): THREE.Texture {
    if (!this.texturePool.has(key)) {
      const canvas = this.getCanvas(key, width, height);
      const texture = new THREE.CanvasTexture(canvas);
      this.texturePool.set(key, texture);
    }
    return this.texturePool.get(key)!;
  }
  
  static releaseCanvas(key: string) {
    if (this.texturePool.has(key)) {
      const texture = this.texturePool.get(key);
      texture?.dispose();
      this.texturePool.delete(key);
    }
    this.pool.delete(key);
  }
  
  static clearPool() {
    this.texturePool.forEach(texture => texture.dispose());
    this.texturePool.clear();
    this.pool.clear();
  }
}

export default CanvasPool;
