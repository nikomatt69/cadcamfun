// src/plugins/core/host/iframe-host.ts
import { PluginManifest, PluginPermission } from "../registry/pluginManifest";
import { PluginHostBase } from "./pluginHost";
import { PluginState } from "../registry";
import { SandboxOptions, PluginSandbox } from "./sandbox";
import { IPluginConnection } from "./pluginBridge";
import path from "path";

/**
 * Connection implementation for iFrames using PostMessage
 */
class IFrameConnection implements IPluginConnection {
  constructor(
    private iframe: HTMLIFrameElement,
    private targetOrigin: string
  ) {}

  send(message: any, transferables?: Transferable[]): void {
    // Ensure that the iframe is fully loaded before sending messages
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(message, this.targetOrigin, transferables || []);
    } else {
      console.warn("Cannot send message: iframe contentWindow is not available");
    }
  }

  onMessage(handler: (message: any) => void): void {
    const messageListener = (event: MessageEvent) => {
      // Validate the message origin
      if (event.origin !== this.targetOrigin && this.targetOrigin !== "*") {
        console.warn(`Ignored message from unauthorized origin: ${event.origin}`);
        return;
      }

      // Ensure the message is from our iframe
      if (event.source !== this.iframe.contentWindow) {
        return;
      }

      handler(event.data);
    };

    window.addEventListener("message", messageListener);

    // Store the listener for cleanup
    (this as any)._messageListener = messageListener;
  }

  close(): void {
    // Remove the message listener
    if ((this as any)._messageListener) {
      window.removeEventListener("message", (this as any)._messageListener);
      delete (this as any)._messageListener;
    }

    // Cleanup is handled by the host during unload, not the connection itself
    // this.cleanupIFrame();
  }

  // Moved cleanupIFrame here for use in close() and unload() - Correction: cleanupIFrame is on Host, not Connection
  /* Remove this cleanup from connection, it belongs to the host 
  private cleanupIFrame(): void {
    if (this.iframe) {
      if (this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;
      // this.targetElement = null; // Cannot access targetElement here
    }
  } 
  */
}

/**
 * Plugin host implementation using iFrames for isolation
 * This implementation is suitable for plugins with UI requirements
 */
export class IFramePluginHost extends PluginHostBase {
  private iframe: HTMLIFrameElement | null = null;
  private sandbox: PluginSandbox;
  // private container: HTMLElement | null = null; // Removed - use targetElement
  private allowedOrigin: string;
  private targetElement: HTMLElement | null = null; // Element to append iframe to

  constructor(manifest: PluginManifest, sandboxOptions: SandboxOptions) {
    super(manifest, sandboxOptions);
    this.sandbox = new PluginSandbox(manifest, sandboxOptions);

    // Determine the allowed origin for postMessage security
    this.allowedOrigin = this.determineAllowedOrigin();
  }

  /**
   * Sets the target HTML element where the plugin's iframe should be rendered.
   * This should be called *before* load() or show().
   * @param element The container element.
   */
  public setTargetElement(element: HTMLElement | null): void {
    console.log(`[IFrameHost ${this.manifest.id}] Setting target element:`, element);
    this.targetElement = element;
    // If iframe already exists and is not in the DOM, append it now?
    // Or rely on load() to append it. Let's rely on load().
  }

  /**
   * Load the plugin in an iFrame
   */
  public async load(): Promise<void> {
    if (this.state !== PluginState.INSTALLED) {
      throw new Error(`Cannot load plugin ${this.manifest.id} in state ${this.state}`);
    }
    if (this.iframe) {
      console.warn(`[IFrameHost ${this.manifest.id}] Load called but iframe already exists.`);
      return; // Already loaded or loading
    }

    try {
      console.log(`[IFrameHost ${this.manifest.id}] Starting load...`);
      // Create an iframe element
      this.iframe = document.createElement("iframe");

      // Set sandbox attributes for security
      this.iframe.setAttribute("sandbox", this.sandbox.getSandboxAttributes());

      // Set other attributes
      this.iframe.style.border = "none";
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.display = "none"; // Initially hidden
      this.iframe.title = `Plugin: ${this.manifest.name}`;
      this.iframe.allow = this.getAllowAttribute();

      // Generate a unique name for the iframe for targeting
      const frameName = `plugin-${this.manifest.id}-${Date.now()}`;
      this.iframe.name = frameName;

      // Find or create the container for the iframe - REMOVED
      // this.container = this.findOrCreateContainer();

      // Create the iframe content with the bootstrap code
      const iframeContent = this.createIFrameContent();

      // Load the iframe with the content
      this.iframe.srcdoc = iframeContent;

      // Append the iframe to the TARGET element
      if (!this.targetElement) {
        console.warn(
          `[IFrameHost ${this.manifest.id}] No target element set before load. Appending iframe might fail or be delayed.`
        );
        // Optional: Fallback to old behavior or throw error
        // For now, we rely on setTargetElement being called before/during activation
        // and show() potentially re-appending if needed. Or error here?
        throw new Error(
          `[IFrameHost ${this.manifest.id}] Target element must be set via setTargetElement() before load.`
        );
      } else {
        // Ensure target is empty before appending? Or allow multiple? Let's clear it.
        this.targetElement.innerHTML = "";
        this.targetElement.appendChild(this.iframe);
        console.log(`[IFrameHost ${this.manifest.id}] Appended iframe to target element.`);
      }

      // Set up the connection for the bridge
      const connection = new IFrameConnection(this.iframe, this.allowedOrigin);
      this.bridge.setConnection(connection);

      // Wait for the iframe to load and initialize
      await new Promise<void>((resolve, reject) => {
        // Handle initialization message
        const messageHandler = (event: MessageEvent) => {
          if (!event.data || event.data.type !== "plugin-init-result") return;

          window.removeEventListener("message", messageHandler);

          if (event.data.success) {
            resolve();
          } else {
            reject(new Error(event.data.error || "Failed to initialize plugin"));
          }
        };

        window.addEventListener("message", messageHandler);

        // Handle load errors
        const errorHandler = (errorEvent: ErrorEvent) => {
          // Get more details if possible
          console.error(`[IFrameHost ${this.manifest.id}] Iframe load error:`, errorEvent);
          window.removeEventListener("message", messageHandler);
          this.iframe?.removeEventListener("error", errorHandler as EventListener); // Cast needed
          reject(
            new Error(
              `Failed to load plugin iframe content. Check Content-Security-Policy and script URLs. Error: ${errorEvent.message}`
            )
          );
        };

        this.iframe?.addEventListener("error", errorHandler as EventListener); // Cast needed

        // Set a timeout for initialization
        setTimeout(() => {
          window.removeEventListener("message", messageHandler);
          this.iframe?.removeEventListener("error", errorHandler as EventListener); // Cast needed
          reject(new Error("Plugin initialization timed out"));
        }, 15000); // Increased timeout slightly
      });

      // Update state to loaded
      this.state = PluginState.LOADED;
      console.log(`Plugin ${this.manifest.id} loaded successfully in iframe`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, "load");
      this.cleanupIFrame(); // Ensure cleanup on error
      throw err;
    }
  }

  /**
   * Unload the plugin and remove the iframe
   */
  public async unload(): Promise<void> {
    console.log(`[IFrameHost ${this.manifest.id}] Unloading... Current state: ${this.state}`);
    if (this.state === PluginState.INSTALLED) {
      return;
    }

    try {
      // Deactivate first if active
      if (this.state === PluginState.ACTIVATED) {
        await this.deactivate(); // Deactivate should ideally message the plugin first
      }

      // Clean up the bridge
      this.bridge.dispose();

      // Remove the iframe
      this.cleanupIFrame(); // Use the class method

      this.state = PluginState.INSTALLED;
      console.log(`Plugin ${this.manifest.id} unloaded successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, "unload");
      this.cleanupIFrame(); // Ensure cleanup on error
      throw err;
    }
  }

  /**
   * Show the plugin UI
   */
  public show(): void {
    if (!this.iframe) {
      console.warn(`[IFrameHost ${this.manifest.id}] Cannot show: iframe not created yet (call load first).`);
      return;
    }
    // Ensure iframe is in the correct target element if it was somehow removed
    if (this.targetElement && this.iframe.parentNode !== this.targetElement) {
      console.warn(`[IFrameHost ${this.manifest.id}] Iframe was not in target element during show(). Re-appending.`);
      // Ensure target is empty before appending? Or allow multiple? Let's clear it.
      this.targetElement.innerHTML = "";
      this.targetElement.appendChild(this.iframe);
    } else if (!this.targetElement) {
      console.error(`[IFrameHost ${this.manifest.id}] Cannot show: No target element set.`);
      return;
    }

    // Make iframe visible
    this.iframe.style.display = "block";
    // Also ensure target element is visible (though host component should manage this)
    // this.targetElement.style.display = 'block'; // Or manage via host component className
    console.log(`[IFrameHost ${this.manifest.id}] UI shown.`);
  }

  /**
   * Hide the plugin UI
   */
  public hide(): void {
    if (this.iframe) {
      this.iframe.style.display = "none";
      console.log(`[IFrameHost ${this.manifest.id}] UI hidden.`);
      // Also hide target element? Let host component manage visibility
      // if (this.targetElement) {
      //   this.targetElement.style.display = 'none';
      // }
    }
  }

  // Moved cleanupIFrame to be accessible by close() and unload()
  private cleanupIFrame(): void {
    if (this.iframe) {
      console.log(`[IFrameHost ${this.manifest.id}] Cleaning up iframe.`);
      if (this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;
      this.targetElement = null; // Also clear target element ref
    }
  }

  // REMOVED findOrCreateContainer method entirely

  /**
   * Determine the allowed origin for postMessage security
   */
  private determineAllowedOrigin(): string {
    // Determine the origin from which the plugin code will be served
    // This is crucial for postMessage security
    const pluginUrlPath = this.getPluginUrl(); // Keep this as the relative path
    try {
      // Construct URL using the current window's origin as the base
      if (typeof window === "undefined") {
        // Handle server-side or worker context where window is not available
        // This host type is likely client-only anyway, but good practice.
        throw new Error("Cannot determine origin: window object is not available.");
      }
      const base = window.location.origin;
      const absoluteUrl = new URL(pluginUrlPath, base);
      console.log(`[IFrameHost ${this.manifest.id}] Determined allowed origin: ${absoluteUrl.origin}`);
      return absoluteUrl.origin;
    } catch (e) {
      console.error(
        `[IFrameHost ${this.manifest.id}] Failed to construct URL from plugin path: ${pluginUrlPath} with base ${window?.location?.origin}`,
        e
      );
      // Re-throw the error, as falling back is insecure and hides the root cause.
      throw new Error(`Failed to determine plugin origin. Invalid path: ${pluginUrlPath}. Error: ${e}`);
    }
  }

  /**
   * Get the URL to load the plugin code from via the serving API
   */
  private getPluginUrl(): string {
    // L'endpoint API per servire i file è /api/plugins/serve
    // Ha bisogno dell'ID del plugin e del percorso relativo del file (manifest.main)

    if (!this.manifest.main || typeof this.manifest.main !== "string") {
      throw new Error(`Plugin ${this.manifest.id} manifest does not specify a valid \'main\' entry point.`);
    }

    // Corrected path normalization regex
    const relativeMainPath = path.normalize(this.manifest.main).replace(/^(\.\.(\/|\\))+/, "");
    if (relativeMainPath.includes("..")) {
      throw new Error(`Invalid 'main' path in manifest for plugin ${this.manifest.id}: ${this.manifest.main}`);
    }

    const apiUrl = `/api/plugins/serve?id=${encodeURIComponent(this.manifest.id)}&file=${encodeURIComponent(relativeMainPath)}`;

    console.log(`[IFrameHost] Generated plugin code URL for ${this.manifest.id}: ${apiUrl}`);
    return apiUrl;
  }

  /**
   * Generate the 'allow' attribute for the iframe
   */
  private getAllowAttribute(): string {
    const permissions = [];

    // Add permissions based on the plugin's manifest using enum members
    if (this.manifest.permissions?.includes(PluginPermission.UI_FULLSCREEN)) {
      permissions.push("fullscreen");
    }

    if (this.manifest.permissions?.includes(PluginPermission.DEVICE_CAMERA)) {
      permissions.push("camera");
    }

    if (this.manifest.permissions?.includes(PluginPermission.DEVICE_MICROPHONE)) {
      permissions.push("microphone");
    }

    return permissions.join("; ");
  }

  /**
   * Create minimal iframe HTML content that loads the bootstrap script from an API endpoint.
   */
  private createIFrameContent(): string {
    // Get the plugin ID for the script URL
    const pluginId = encodeURIComponent(this.manifest.id);
    const cspPolicy = this.sandbox.getCSP(); // Still use CSP defined by sandbox

    // Simple HTML structure loading the external bootstrap script
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=0.8">
  <meta http-equiv="Content-Security-Policy" content="${cspPolicy}">
  <title>Plugin Loader: ${this.manifest.name}</title>
  <style>
    body { margin: 0; padding: 0; font-family: sans-serif; overflow: hidden; height: 100%; } /* Ensure body takes height */
    html { height: 100%; } /* Ensure html takes height */
    #plugin-root { width: 100%; height: 100%; overflow: auto; }
    .plugin-loading { display: flex; align-items: center; justify-content: center; height: 100vh; width: 100%; }
    .plugin-error-state { color: red; padding: 10px; text-align: center; }
    /* Removed container styles as iframe is appended directly */
  </style>
</head>
<body>
  <div id="plugin-root">
    <div class="plugin-loading">Loading plugin bootstrap...</div>
  </div>
  
  <script src="/api/plugins/bootstrap.js?id=${pluginId}" async defer></script>
</body>
</html>
    `;
  }
}
