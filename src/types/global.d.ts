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
}

export {}; // Ensure this file is treated as a module