// src/lib/canvas/SmartRenderer.ts

import * as THREE from 'three';

interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

class SmartRenderer {
  private static frustum = new THREE.Frustum();
  private static projScreenMatrix = new THREE.Matrix4();
  private static boundingSphere = new THREE.Sphere();
  private static boundingBox = new THREE.Box3();
  
  static getViewportBounds(camera: THREE.Camera): ViewportBounds {
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    return {
      left: this.frustum.planes[0].constant,
      right: this.frustum.planes[1].constant,
      top: this.frustum.planes[2].constant,
      bottom: this.frustum.planes[3].constant,
      near: this.frustum.planes[4].constant,
      far: this.frustum.planes[5].constant
    };
  }
  
  static isInViewport(object: THREE.Object3D, camera: THREE.Camera): boolean {
    // Calcola la bounding sphere dell'oggetto
    this.boundingBox.setFromObject(object);
    this.boundingBox.getBoundingSphere(this.boundingSphere);
    
    // Aggiorna la matrice di proiezione
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    // Controlla se l'oggetto è nel frustum della camera
    return this.frustum.intersectsSphere(this.boundingSphere);
  }
  
  static needsUpdate(object: THREE.Object3D): boolean {
    // Verifica se l'oggetto è stato modificato
    if (object.userData.lastUpdateTime === undefined) {
      object.userData.lastUpdateTime = Date.now();
      return true;
    }
    
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - object.userData.lastUpdateTime;
    
    // Aggiorna oggetti modificati di recente più frequentemente
    if (object.userData.isModified) {
      return timeSinceLastUpdate > 16; // ~60fps per oggetti modificati
    }
    
    // Aggiorna oggetti statici meno frequentemente
    return timeSinceLastUpdate > 100; // ~10fps per oggetti statici
  }
  
  static smartRender(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    options = {
      cullDistance: 1000,
      updateThreshold: 16,
      forceUpdate: false
    }
  ) {
    const viewportBounds = this.getViewportBounds(camera);
    const visibleObjects: THREE.Object3D[] = [];
    
    // Raccogli oggetti visibili
    scene.traverse((object) => {
      if (object.visible && this.isInViewport(object, camera)) {
        if (options.forceUpdate || this.needsUpdate(object)) {
          visibleObjects.push(object);
          object.userData.lastUpdateTime = Date.now();
        }
      }
    });
    
    // Ottimizza il rendering
    visibleObjects.sort((a, b) => {
      // Renderizza prima gli oggetti opachi
      const aMaterial = (a as any).material;
      const bMaterial = (b as any).material;
      if (aMaterial && bMaterial) {
        if (!aMaterial.transparent && bMaterial.transparent) return -1;
        if (aMaterial.transparent && !bMaterial.transparent) return 1;
      }
      return 0;
    });
    
    // Aggiorna solo gli oggetti necessari
    visibleObjects.forEach(object => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry.attributes.position) {
          object.geometry.attributes.position.needsUpdate = true;
        }
      }
    });
    
    // Esegui il rendering
    renderer.render(scene, camera);
  }
}

export default SmartRenderer;