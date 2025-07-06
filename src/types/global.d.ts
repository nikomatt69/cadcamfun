import * as THREE from "three";

interface Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
  };
}

declare global {
  interface Window {
    __CAD_APP__: any; // Replace 'any' with a more specific type if available
    toolpathVisualizerScene?: THREE.Scene;
    toolpathVisualizerCamera?: THREE.Camera;
    __THREEJS_RENDERER__?: THREE.WebGLRenderer; // For the renderer lookup
    exposeToolpathVisualizerAPI?: boolean;
  }
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
    };
  }
}

export {}; // Ensure this file is treated as a module
