interface Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
  }
}

declare global {
  interface Window {
    __CAD_APP__: any; // Replace 'any' with a more specific type if available
  }
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
    }
  }
}

export {}; // Ensure this file is treated as a module