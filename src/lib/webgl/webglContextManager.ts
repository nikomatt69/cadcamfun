/**
 * WebGL Context Manager
 *
 * Prevents "Too many active WebGL contexts" warnings by managing
 * and reusing WebGL contexts efficiently.
 */

import * as THREE from "three";

interface ContextInfo {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  lastUsed: number;
  isShared: boolean;
  owner?: string;
}

export class WebGLContextManager {
  private static instance: WebGLContextManager;
  private contexts: Map<string, ContextInfo> = new Map();
  private maxContexts = 8; // Browser limit is usually 16, keep buffer
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Only initialize in browser environment
    if (typeof window !== "undefined") {
      // Cleanup unused contexts every 30 seconds
      this.cleanupInterval = setInterval(() => {
        this.cleanupUnusedContexts();
      }, 30000);

      // Cleanup on page unload
      window.addEventListener("beforeunload", () => {
        this.disposeAllContexts();
      });
    }
  }

  public static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }

  /**
   * Get or create a WebGL renderer with context reuse
   */
  public getRenderer(
    options: {
      contextId?: string;
      canvas?: HTMLCanvasElement;
      antialias?: boolean;
      alpha?: boolean;
      preserveDrawingBuffer?: boolean;
      powerPreference?: string;
      shared?: boolean;
    } = {}
  ): THREE.WebGLRenderer {
    const {
      contextId = "default",
      canvas,
      antialias = true,
      alpha = true,
      preserveDrawingBuffer = true,
      powerPreference = "high-performance",
      shared = false
    } = options;

    // Try to reuse existing context
    const existingContext = this.contexts.get(contextId);
    if (existingContext && (!canvas || existingContext.canvas === canvas)) {
      existingContext.lastUsed = Date.now();
      return existingContext.renderer;
    }

    // Check if we're approaching context limit
    if (this.contexts.size >= this.maxContexts) {
      console.warn("⚠️ Approaching WebGL context limit, cleaning up unused contexts...");
      this.cleanupUnusedContexts(true);
    }

    // Create new renderer
    let newCanvas = canvas;
    if (!newCanvas) {
      newCanvas = document.createElement("canvas");
    }

    const renderer = new THREE.WebGLRenderer({
      canvas: newCanvas,
      antialias,
      alpha,
      preserveDrawingBuffer,
      powerPreference: powerPreference as WebGLPowerPreference
    });

    // Store context info
    const contextInfo: ContextInfo = {
      renderer,
      canvas: newCanvas,
      lastUsed: Date.now(),
      isShared: shared,
      owner: contextId
    };

    this.contexts.set(contextId, contextInfo);

    console.log(`✅ Created WebGL context '${contextId}' (total: ${this.contexts.size})`);
    return renderer;
  }

  /**
   * Release a specific context
   */
  public releaseContext(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      if (!context.isShared) {
        context.renderer.dispose();
        this.contexts.delete(contextId);
        console.log(`🗑️ Released WebGL context '${contextId}' (remaining: ${this.contexts.size})`);
      } else {
        console.log(`🔒 Context '${contextId}' is shared, not disposing`);
      }
    }
  }

  /**
   * Mark context as used (prevents cleanup)
   */
  public markContextUsed(contextId: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.lastUsed = Date.now();
    }
  }

  /**
   * Get context statistics
   */
  public getStats(): {
    activeContexts: number;
    maxContexts: number;
    contexts: { id: string; owner?: string; lastUsed: number; isShared: boolean }[];
  } {
    return {
      activeContexts: this.contexts.size,
      maxContexts: this.maxContexts,
      contexts: Array.from(this.contexts.entries()).map(([id, info]) => ({
        id,
        owner: info.owner,
        lastUsed: info.lastUsed,
        isShared: info.isShared
      }))
    };
  }

  /**
   * Check WebGL capabilities without creating persistent context
   */
  public static checkWebGLCapabilities(): {
    hasWebGL: boolean;
    hasWebGL2: boolean;
    maxTextureSize: number;
    maxRenderbufferSize: number;
  } {
    // Use a temporary canvas that gets cleaned up immediately
    const tempCanvas = document.createElement("canvas");
    let hasWebGL = false;
    let hasWebGL2 = false;
    let maxTextureSize = 0;
    let maxRenderbufferSize = 0;

    try {
      // Test WebGL2 first
      const gl2 = tempCanvas.getContext("webgl2");
      if (gl2) {
        hasWebGL2 = true;
        hasWebGL = true;
        maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE);
        maxRenderbufferSize = gl2.getParameter(gl2.MAX_RENDERBUFFER_SIZE);

        // Force context loss to cleanup immediately
        const loseContext = gl2.getExtension("WEBGL_lose_context");
        if (loseContext) {
          loseContext.loseContext();
        }
      } else {
        // Fallback to WebGL1
        const gl =
          (tempCanvas.getContext("webgl") as WebGLRenderingContext) ||
          (tempCanvas.getContext("experimental-webgl") as WebGLRenderingContext);
        if (gl) {
          hasWebGL = true;
          maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
          maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

          // Force context loss to cleanup immediately
          const loseContext = gl.getExtension("WEBGL_lose_context");
          if (loseContext) {
            loseContext.loseContext();
          }
        }
      }
    } catch (e) {
      console.warn("WebGL capability check failed:", e);
    }

    return {
      hasWebGL,
      hasWebGL2,
      maxTextureSize,
      maxRenderbufferSize
    };
  }

  /**
   * Cleanup unused contexts
   */
  private cleanupUnusedContexts(force: boolean = false): void {
    const now = Date.now();
    const maxAge = force ? 0 : 5 * 60 * 1000; // 5 minutes for normal cleanup, immediate for force

    const toRemove: string[] = [];

    this.contexts.forEach((context, id) => {
      const age = now - context.lastUsed;

      // Don't cleanup shared contexts unless forced and very old
      if (context.isShared && !force) {
        return;
      }

      if (age > maxAge) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => {
      this.releaseContext(id);
    });

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} unused WebGL contexts`);
    }
  }

  /**
   * Dispose all contexts (emergency cleanup)
   */
  public disposeAllContexts(): void {
    console.log("🚨 Disposing all WebGL contexts...");

    this.contexts.forEach((context, id) => {
      try {
        context.renderer.dispose();
      } catch (e) {
        console.warn(`Failed to dispose context ${id}:`, e);
      }
    });

    this.contexts.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const webglContextManager = WebGLContextManager.getInstance();

// Utility function for easy renderer creation
export function createManagedRenderer(
  options: {
    contextId?: string;
    canvas?: HTMLCanvasElement;
    antialias?: boolean;
    alpha?: boolean;
    preserveDrawingBuffer?: boolean;
    powerPreference?: string;
    shared?: boolean;
  } = {}
): THREE.WebGLRenderer {
  return webglContextManager.getRenderer(options);
}

/**
 * Detect WebGL capabilities without creating persistent contexts
 * Safe to call multiple times without context accumulation
 */
export function detectWebGLCapabilities(): {
  hasWebGL: boolean;
  hasWebGL2: boolean;
  maxTextureSize: number;
  maxRenderbufferSize: number;
} {
  return WebGLContextManager.checkWebGLCapabilities();
}
