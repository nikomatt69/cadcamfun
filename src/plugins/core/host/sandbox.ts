// src/plugins/core/host/sandbox.ts
import { PluginManifest, PluginPermission } from '../registry/pluginManifest';

/**
 * Permissions that can be requested by plugins
 */

/**
 * Content Security Policy configuration for the sandbox
 */
export interface CSPOptions {
  /** Allow scripts from these sources */
  scriptSrc?: string[];
  
  /** Allow styles from these sources */
  styleSrc?: string[];
  
  /** Allow images from these sources */
  imgSrc?: string[];
  
  /** Allow fonts from these sources */
  fontSrc?: string[];
  
  /** Allow connect to these destinations */
  connectSrc?: string[];
  
  /** Allow frames from these sources */
  frameSrc?: string[];
}

/**
 * Options for sandbox configuration
 */
export interface SandboxOptions {
  /** Content Security Policy options */
  csp: CSPOptions;
  
  /** Allow plugins to use eval and similar functions */
  allowEval: boolean;
  
  /** Allow plugins to access the parent window */
  allowParentAccess: boolean;
  
  /** Maximum memory limit for the plugin (WebWorkers only) */
  memoryLimit?: number;
  
  /** Maximum CPU time for synchronous operations (ms) */
  cpuLimit?: number;
}

/**
 * Builds a Content Security Policy string from options
 */
export function buildCSP(options: CSPOptions): string {
  const directives: string[] = [
    // Default restrictive policy
    "default-src 'none'",
    
    // Add configured sources
    options.scriptSrc ? `script-src ${options.scriptSrc.join(' ')}` : '',
    options.styleSrc ? `style-src ${options.styleSrc.join(' ')}` : '',
    options.imgSrc ? `img-src ${options.imgSrc.join(' ')}` : '',
    options.fontSrc ? `font-src ${options.fontSrc.join(' ')}` : '',
    options.connectSrc ? `connect-src ${options.connectSrc.join(' ')}` : '',
    options.frameSrc ? `frame-src ${options.frameSrc.join(' ')}` : '',
  ].filter(Boolean);
  
  return directives.join('; ');
}

/**
 * Sandbox class to manage security restrictions for plugins
 */
export class PluginSandbox {
  private options: SandboxOptions;
  
  constructor(
    private manifest: PluginManifest,
    options?: Partial<SandboxOptions>
  ) {
    // Set default options
    this.options = {
      csp: {
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
      allowEval: false,
      allowParentAccess: false,
      memoryLimit: 128 * 1024 * 1024, // 128MB
      cpuLimit: 1000, // 1 second
      ...options
    };
    
    // Adjust options based on manifest permissions
    this.adjustOptionsBasedOnPermissions();
  }
  
  /**
   * Adjust sandbox options based on the manifest permissions
   */
  private adjustOptionsBasedOnPermissions(): void {
    const permissions = this.manifest.permissions || [];
    
    // Allow network requests if the plugin has the permission
    if (permissions.includes(PluginPermission.NETWORK_EXTERNAL)) {
      this.options.csp.connectSrc = [
        "'self'",
        "https://*"
      ];
    }
    
    // Add UI related permissions
    if (permissions.includes(PluginPermission.UI_SIDEBAR) ||
        permissions.includes(PluginPermission.UI_TOOLBAR) ||
        permissions.includes(PluginPermission.UI_PROPERTY_PANEL)) {
      // Allow more style sources for UI components
      this.options.csp.styleSrc = [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ];
      
      // Allow loading fonts for UI
      this.options.csp.fontSrc = [
        "'self'",
        "https://fonts.gstatic.com"
      ];
    }
  }
  
  /**
   * Get the sandbox attribute string for iframes
   */
  public getSandboxAttributes(): string {
    const attributes = [
      'allow-scripts', // Always allow scripts
      'allow-same-origin', // Needed for postMessage communication
    ];
    
    // Add additional permissions as needed
    if (this.options.allowEval) {
      attributes.push('allow-eval');
    }
    
    if (this.manifest.permissions?.includes(PluginPermission.FILE_READ) ||
        this.manifest.permissions?.includes(PluginPermission.FILE_WRITE)) {
      attributes.push('allow-downloads');
    }
    
    if (this.manifest.permissions?.some(p => p.startsWith('ui:'))) {
      attributes.push('allow-forms');
      attributes.push('allow-popups');
    }
    
    return attributes.join(' ');
  }
  
  /**
   * Get the Content Security Policy header value
   */
  public getCSP(): string {
    const cspOptions = this.options.csp;
    
    // Add unsafe-eval if allowed
    if (this.options.allowEval && cspOptions.scriptSrc) {
      cspOptions.scriptSrc.push("'unsafe-eval'");
    }
    
    return buildCSP(cspOptions);
  }
  
  /**
   * Get sandbox options for the worker
   */
  public getWorkerOptions(): any {
    return {
      memoryLimit: this.options.memoryLimit,
      cpuLimit: this.options.cpuLimit,
    };
  }
  
  /**
   * Check if a specific permission is granted to the plugin
   */
  public hasPermission(permission: PluginPermission): boolean {
    return this.manifest.permissions?.includes(permission) || false;
  }
  
  /**
   * Validate if the plugin can call a specific API method
   */
  public validateApiAccess(apiNamespace: string, method: string): boolean {
    // Map API namespaces to required permissions
    const permissionMap: Record<string, PluginPermission[]> = {
      'model': [PluginPermission.MODEL_READ, PluginPermission.MODEL_WRITE, PluginPermission.MODEL_SELECTION],
      'ui': [PluginPermission.UI_SIDEBAR, PluginPermission.UI_TOOLBAR, PluginPermission.UI_CONTEXT_MENU, PluginPermission.UI_PROPERTY_PANEL, PluginPermission.UI_MODAL, PluginPermission.UI_OVERLAY],
      'file': [PluginPermission.FILE_READ, PluginPermission.FILE_WRITE],
      'network': [PluginPermission.NETWORK_ORIGIN, PluginPermission.NETWORK_EXTERNAL],
      'storage': [PluginPermission.STORAGE_LOCAL, PluginPermission.STORAGE_SYNC],
    };
    
    // Check if the namespace is restricted
    const requiredPermissions = permissionMap[apiNamespace];
    if (!requiredPermissions) {
      return true; // Namespace not restricted
    }
    
    // Check if the plugin has any of the required permissions
    return requiredPermissions.some(permission => 
      this.manifest.permissions?.includes(permission)
    );
  }
}