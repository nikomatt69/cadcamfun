/**
 * Plugin manifest schema and validation
 * The manifest defines a plugin's metadata, capabilities, and requirements
 */

import { z } from 'zod';

/**
 * Supported permission types that plugins can request
 */
export enum PluginPermission {
  // Model permissions
  MODEL_READ = 'model:read',
  MODEL_WRITE = 'model:write',
  MODEL_SELECTION = 'model:selection',
  
  // UI permissions
  UI_SIDEBAR = 'ui:sidebar',
  UI_TOOLBAR = 'ui:toolbar',
  UI_CONTEXT_MENU = 'ui:contextMenu',
  UI_PROPERTY_PANEL = 'ui:propertyPanel',
  UI_MODAL = 'ui:modal',
  UI_OVERLAY = 'ui:overlay',
  
  // Storage permissions
  STORAGE_LOCAL = 'storage:local',
  STORAGE_SYNC = 'storage:sync',
  
  // File system permissions
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DOWNLOADS = 'file:downloads',
  
  // Network permissions
  NETWORK_ORIGIN = 'network:origin',
  NETWORK_EXTERNAL = 'network:external',
  
  // System permissions
  SYSTEM_CLIPBOARD = 'system:clipboard',
  SYSTEM_NOTIFICATIONS = 'system:notifications',

  // Additional UI/Device permissions
  UI_FULLSCREEN = 'ui:fullscreen',
  DEVICE_CAMERA = 'device:camera',
  DEVICE_MICROPHONE = 'device:microphone',
}

/**
 * Types of UI contributions a plugin can make
 */
export interface PluginContributions {
  sidebar?: {
    title: string;
    icon: string;
    entry: string;
  };
  commands?: Array<{
    id: string;
    title: string;
    icon?: string;
    keybinding?: string;
  }>;
  menus?: {
    toolbar?: Array<{
      command: string;
      group?: string;
      priority?: number;
    }>;
    contextMenu?: Array<{
      command: string;
      when?: string;
      group?: string;
    }>;
  };
  propertyPanel?: Array<{
    id: string;
    title: string;
    entry: string;
    appliesTo?: string;
  }>;
  themes?: Array<{
    id: string;
    label: string;
    path: string;
  }>;
}

/**
 * Configuration schema for plugin settings
 */
export interface PluginConfigurationSchema {
  properties: Record<string, {
    type: string;
    default?: any;
    description?: string;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    pattern?: string;
  }>;
}

/**
 * Complete Plugin Manifest type
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  repository?: string;
  license?: string;
  icon?: string;
  main: string;
  engines: {
    cadcam: string; // Semver range
  };
  permissions: PluginPermission[];
  contributes?: PluginContributions;
  dependencies?: Record<string, string>; // plugin-id -> version range
  configuration?: PluginConfigurationSchema;
}

/**
 * Result of manifest validation
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors?: string[];
}

// Zod schema for validating plugin manifests
const permissionSchema = z.enum([
  PluginPermission.MODEL_READ,
  PluginPermission.MODEL_WRITE,
  PluginPermission.MODEL_SELECTION,
  PluginPermission.UI_SIDEBAR,
  PluginPermission.UI_TOOLBAR,
  PluginPermission.UI_CONTEXT_MENU,
  PluginPermission.UI_PROPERTY_PANEL,
  PluginPermission.UI_MODAL,
  PluginPermission.UI_OVERLAY,
  PluginPermission.STORAGE_LOCAL,
  PluginPermission.STORAGE_SYNC,
  PluginPermission.FILE_READ,
  PluginPermission.FILE_WRITE,
  PluginPermission.FILE_DOWNLOADS,
  PluginPermission.NETWORK_ORIGIN,
  PluginPermission.NETWORK_EXTERNAL,
  PluginPermission.SYSTEM_CLIPBOARD,
  PluginPermission.SYSTEM_NOTIFICATIONS,
  PluginPermission.UI_FULLSCREEN,
  PluginPermission.DEVICE_CAMERA,
  PluginPermission.DEVICE_MICROPHONE,
]);

// Command schema
const commandSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  keybinding: z.string().optional(),
});

// Menu item schema
const menuItemSchema = z.object({
  command: z.string(),
  when: z.string().optional(),
  group: z.string().optional(),
  priority: z.number().optional(),
});

// Sidebar schema
const sidebarSchema = z.object({
  title: z.string(),
  icon: z.string(),
  entry: z.string(),
});

// Property panel schema
const propertyPanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  entry: z.string(),
  appliesTo: z.string().optional(),
});

// Theme schema
const themeSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
});

// Menu contribution schema
const menuContributionSchema = z.object({
  toolbar: z.array(menuItemSchema).optional(),
  contextMenu: z.array(menuItemSchema).optional(),
});

// Contributions schema
const contributionsSchema = z.object({
  sidebar: sidebarSchema.optional(),
  commands: z.array(commandSchema).optional(),
  menus: menuContributionSchema.optional(),
  propertyPanel: z.array(propertyPanelSchema).optional(),
  themes: z.array(themeSchema).optional(),
});

// Configuration property schema
const configPropertySchema = z.object({
  type: z.string(),
  default: z.any().optional(),
  description: z.string().optional(),
  enum: z.array(z.any()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  pattern: z.string().optional(),
});

// Configuration schema
const configurationSchema = z.object({
  properties: z.record(configPropertySchema),
});

// Complete manifest schema
const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-_.]+$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
  author: z.string(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  icon: z.string().optional(),
  main: z.string(),
  engines: z.object({
    cadcam: z.string(),
  }),
  permissions: z.array(permissionSchema),
  contributes: contributionsSchema.optional(),
  dependencies: z.record(z.string()).optional(),
  configuration: configurationSchema.optional(),
});

/**
 * Validate a plugin manifest against the schema
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  try {
    manifestSchema.parse(manifest);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error'],
    };
  }
}

/**
 * Check if a manifest has a specific permission
 */
export function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission);
}

/**
 * Check if a manifest requires a specific UI contribution capability
 */
export function requiresSidebarUI(manifest: PluginManifest): boolean {
  return hasPermission(manifest, PluginPermission.UI_SIDEBAR) && !!manifest.contributes?.sidebar;
}

/**
 * Create a default manifest for a new plugin
 */
export function createDefaultManifest(id: string, name: string): PluginManifest {
  return {
    id,
    name,
    version: '0.1.0',
    description: `${name} plugin for CAD/CAM FUN`,
    author: 'User',
    main: 'dist/main.js',
    engines: {
      cadcam: '^1.0.0',
    },
    permissions: [
      PluginPermission.MODEL_READ,
    ],
  };
}