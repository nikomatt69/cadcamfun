// src/plugins/core/api/capabilities.ts
import { PluginManifest, PluginPermission } from '../registry';

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
}

/**
 * Permission request for showing to users
 */
export interface PermissionRequest {
  pluginId: string;
  pluginName: string;
  permission: PluginPermission;
  reason?: string;
}

/**
 * Permission manager that handles runtime permission checks
 */
export class PermissionManager {
  private pluginPermissions: Map<string, Set<PluginPermission>> = new Map();
  private userGrantedPermissions: Map<string, Set<PluginPermission>> = new Map();
  private permissionListeners: Set<(request: PermissionRequest) => Promise<boolean>> = new Set();
  
  constructor() {}
  
  /**
   * Register a plugin's permissions from its manifest
   */
  public registerPluginPermissions(pluginId: string, manifest: PluginManifest): void {
    const permissions = new Set(manifest.permissions || []);
    this.pluginPermissions.set(pluginId, permissions);
  }
  
  /**
   * Unregister a plugin's permissions
   */
  public unregisterPluginPermissions(pluginId: string): void {
    this.pluginPermissions.delete(pluginId);
    this.userGrantedPermissions.delete(pluginId);
  }
  
  /**
   * Add a listener for permission requests
   */
  public addPermissionRequestListener(
    listener: (request: PermissionRequest) => Promise<boolean>
  ): () => void {
    this.permissionListeners.add(listener);
    return () => {
      this.permissionListeners.delete(listener);
    };
  }
  
  /**
   * Check if a plugin has a specific permission
   */
  public hasPermission(pluginId: string, permission: PluginPermission): boolean {
    // Check static permissions from manifest
    const declaredPermissions = this.pluginPermissions.get(pluginId);
    if (declaredPermissions?.has(permission)) {
      return true;
    }
    
    // Check dynamically granted permissions
    const grantedPermissions = this.userGrantedPermissions.get(pluginId);
    return grantedPermissions?.has(permission) || false;
  }
  
  /**
   * Check or request a permission at runtime
   * - If the plugin already has the permission, returns true immediately
   * - If not, prompts the user for permission if possible
   */
  public async checkOrRequestPermission(
    pluginId: string, 
    pluginName: string,
    permission: PluginPermission,
    reason?: string
  ): Promise<PermissionCheckResult> {
    // Check if permission is already granted
    if (this.hasPermission(pluginId, permission)) {
      return { granted: true };
    }
    
    // If no listeners, permission is denied
    if (this.permissionListeners.size === 0) {
      return { 
        granted: false, 
        reason: 'No permission handlers available' 
      };
    }
    
    // Create permission request
    const request: PermissionRequest = {
      pluginId,
      pluginName,
      permission,
      reason
    };
    // Ask all listeners (in practice, usually just one UI handler)
    for (const listener of Array.from(this.permissionListeners)) {
      try {
        const granted = await listener(request);
        if (granted) {
          // Store the dynamically granted permission
          if (!this.userGrantedPermissions.has(pluginId)) {
            this.userGrantedPermissions.set(pluginId, new Set());
          }
          this.userGrantedPermissions.get(pluginId)!.add(permission);
          return { granted: true };
        }
      } catch (error) {
        console.error('Error in permission request listener:', error);
      }
    }
    
    return { 
      granted: false, 
      reason: 'Permission denied by user' 
    };
  }
  
  /**
   * Revoke a previously granted permission
   */
  public revokePermission(pluginId: string, permission: PluginPermission): void {
    const grantedPermissions = this.userGrantedPermissions.get(pluginId);
    if (grantedPermissions) {
      grantedPermissions.delete(permission);
    }
  }
  
  /**
   * Revoke all dynamically granted permissions for a plugin
   */
  public revokeAllPermissions(pluginId: string): void {
    this.userGrantedPermissions.delete(pluginId);
  }
  
  /**
   * Get all permissions for a plugin
   */
  public getPluginPermissions(pluginId: string): PluginPermission[] {
    const result = new Set<PluginPermission>();
    
    // Add declared permissions
    const declaredPermissions = this.pluginPermissions.get(pluginId);
    if (declaredPermissions) {
      Array.from(declaredPermissions).forEach((permission) => {
        result.add(permission);
      });
    }
    // Add dynamically granted permissions
    const grantedPermissions = this.userGrantedPermissions.get(pluginId);
    if (grantedPermissions) {
      Array.from(grantedPermissions).forEach((permission) => {
        result.add(permission);
      });
    }
    
    return Array.from(result);
  }
}

// Singleton instance
export const permissionManager = new PermissionManager();

/**
 * Decorator for API methods that checks permissions
 * @param permission Required permission
 */
export function requirePermission(permission: PluginPermission) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      // Check for permission here
      const instance = this as { pluginId: string };
      if (!permissionManager.hasPermission(instance.pluginId, permission)) {
        throw new Error(`Permission ${permission} is required`);
      }

      // Call the original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

function hasPermission(permission: PluginPermission): boolean {
  // Implement your permission checking logic here
  return true; // Placeholder
}