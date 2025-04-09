/**
 * Plugin Schema Validator
 * 
 * Runtime validation of plugin manifests and API messages using Zod schemas.
 * This provides an extra layer of type safety beyond TypeScript's static checking.
 */

import { z } from 'zod';
import type { PluginManifest, PluginPermission } from '../types/plugin-manifest';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation succeeded */
  valid: boolean;
  
  /** Validation errors (if any) */
  errors?: string[];
  
  /** Validated data (if successful) */
  data?: any;
}

/**
 * Available plugin permissions
 */
const pluginPermissions = [
  'model:read',
  'model:write',
  'model:selection',
  'model:history',
  'ui:sidebar',
  'ui:toolbar',
  'ui:contextMenu',
  'ui:dialogs',
  'ui:statusBar',
  'storage:local',
  'storage:cloud',
  'file:read',
  'file:write',
  'file:dialogs',
  'network:sameOrigin',
  'network:crossOrigin',
  'system:clipboard',
  'system:print',
] as const;

/**
 * Zod schema for plugin permissions
 */
const permissionSchema = z.enum(pluginPermissions);

/**
 * Zod schema for plugin categories
 */
const categorySchema = z.enum([
  'Modeling',
  'Analysis',
  'Simulation',
  'Manufacturing',
  'Documentation',
  'Visualization',
  'Import/Export',
  'Utilities',
  'Integration',
  'UI Enhancement',
  'Measurement',
  'Collaboration',
  'Rendering',
  'Material Library',
  'Tool Library',
  'Education',
]);

/**
 * Zod schema for configuration property
 */
const configPropertySchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum([
      'string',
      'number',
      'boolean',
      'integer',
      'array',
      'object',
      'null',
    ]),
    default: z.any().optional(),
    description: z.string().optional(),
    enum: z.array(z.any()).optional(),
    enumDescriptions: z.array(z.string()).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    pattern: z.string().optional(),
    items: configPropertySchema.optional(),
    properties: z.record(z.string(), configPropertySchema).optional(),
    required: z.array(z.string()).optional(),
    isRequired: z.boolean().optional(),
    format: z
      .enum([
        'uri',
        'email',
        'color',
        'date',
        'time',
        'date-time',
        'password',
      ])
      .optional(),
    order: z.number().optional(),
  })
);

/**
 * Zod schema for plugin command
 */
const commandSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().optional(),
  keybinding: z.string().optional(),
  tooltip: z.string().optional(),
  category: z.string().optional(),
  enablement: z.string().optional(),
});

/**
 * Zod schema for menu item
 */
const menuItemSchema = z.object({
  command: z.string().min(1),
  group: z.string().optional(),
  priority: z.number().optional(),
  when: z.string().optional(),
  alt: z.string().optional(),
});

/**
 * Zod schema for context menu item
 */
const contextMenuItemSchema = menuItemSchema.extend({
  contexts: z.array(z.enum(['canvas', 'entity', 'selection', 'panel'])),
});

/**
 * Zod schema for main menu item
 */
const mainMenuItemSchema = menuItemSchema.extend({
  location: z.string().min(1),
});

/**
 * Zod schema for property panel
 */
const propertyPanelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  entry: z.string().min(1),
  appliesTo: z.union([z.string(), z.array(z.string())]).optional(),
  order: z.number().optional(),
});

/**
 * Zod schema for theme
 */
const themeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(['light', 'dark', 'high-contrast']),
});

/**
 * Zod schema for keybinding
 */
const keybindingSchema = z.object({
  command: z.string().min(1),
  key: z.string().min(1),
  when: z.string().optional(),
  override: z.boolean().optional(),
});

/**
 * Zod schema for toolbar button
 */
const toolbarButtonSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().min(1),
  group: z.string().min(1),
  priority: z.number().optional(),
  when: z.string().optional(),
  tooltip: z.string().optional(),
});

/**
 * Zod schema for status bar item
 */
const statusBarItemSchema = z.object({
  id: z.string().min(1),
  command: z.string().optional(),
  text: z.string().min(1),
  alignment: z.enum(['left', 'right']),
  priority: z.number().optional(),
  tooltip: z.string().optional(),
  icon: z.string().optional(),
  when: z.string().optional(),
});

/**
 * Zod schema for view
 */
const viewSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().min(1),
  entry: z.string().min(1),
  location: z.enum(['sidebar', 'panel', 'editor']),
  order: z.number().optional(),
});

/**
 * Zod schema for file handler
 */
const fileHandlerSchema = z.object({
  extensions: z.array(z.string().min(1)),
  title: z.string().min(1),
  import: z.boolean().optional(),
  export: z.boolean().optional(),
  priority: z.number().optional(),
});

/**
 * Zod schema for plugin contributions
 */
const contributionsSchema = z.object({
  sidebar: z
    .object({
      title: z.string().min(1),
      icon: z.string().min(1),
      entry: z.string().min(1),
      width: z.number().optional(),
      minWidth: z.number().optional(),
      maxWidth: z.number().optional(),
      order: z.number().optional(),
    })
    .optional(),
  commands: z.array(commandSchema).optional(),
  menus: z
    .object({
      toolbar: z.array(menuItemSchema).optional(),
      contextMenu: z.array(contextMenuItemSchema).optional(),
      mainMenu: z.array(mainMenuItemSchema).optional(),
    })
    .optional(),
  propertyPanel: z.array(propertyPanelSchema).optional(),
  themes: z.array(themeSchema).optional(),
  keybindings: z.array(keybindingSchema).optional(),
  toolbarButtons: z.array(toolbarButtonSchema).optional(),
  statusBar: z.array(statusBarItemSchema).optional(),
  views: z.array(viewSchema).optional(),
  fileHandlers: z.array(fileHandlerSchema).optional(),
});

/**
 * Zod schema for screenshot
 */
const screenshotSchema = z.object({
  path: z.string().min(1),
  caption: z.string().optional(),
  alt: z.string().optional(),
});

/**
 * Zod schema for activation event
 */
const activationEventSchema = z.string().refine(
  (value) => {
    const validPrefixes = [
      'onCommand:',
      'onView:',
      'onLanguage:',
      'onFileOpen:',
      'onStartup',
      'onModelOpen',
      'onModelCreate',
      'onSelection',
      'onWebviewPanel:',
    ];
    return validPrefixes.some((prefix) => value === prefix || value.startsWith(prefix));
  },
  {
    message:
      'Activation event must start with a valid prefix (onCommand:, onView:, etc.)',
  }
);

/**
 * Complete Zod schema for plugin manifest
 */
export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-_.]+(\.[a-z0-9-_.]+)+$/, {
    message:
      'Plugin ID must follow the format: domain.organization.plugin-name',
  }),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: 'Version must follow semver format (e.g., 1.0.0)',
  }),
  description: z.string().min(1),
  author: z.string().min(1),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  icon: z.string().optional(),
  main: z.string().min(1),
  engines: z.object({
    cadcam: z.string().min(1),
  }),
  permissions: z.array(permissionSchema),
  contributes: contributionsSchema.optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  configuration: z
    .object({
      title: z.string().optional(),
      properties: z.record(z.string(), configPropertySchema),
    })
    .optional(),
  browser: z
    .object({
      minVersions: z
        .object({
          chrome: z.string().optional(),
          firefox: z.string().optional(),
          safari: z.string().optional(),
          edge: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  keywords: z.array(z.string()).optional(),
  categories: z.array(categorySchema).optional(),
  screenshots: z.array(screenshotSchema).optional(),
  l10n: z
    .object({
      defaultLocale: z.string().min(1),
      localizations: z.record(z.string(), z.string()),
    })
    .optional(),
  marketplace: z
    .object({
      homepage: z.string().url().optional(),
      documentation: z.string().url().optional(),
      support: z.string().url().optional(),
      changelog: z.string().url().optional(),
      pricing: z
        .object({
          model: z.enum(['free', 'paid', 'freemium', 'subscription']),
          price: z.string().optional(),
        })
        .optional(),
      flags: z
        .object({
          featured: z.boolean().optional(),
          verified: z.boolean().optional(),
          new: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  activationEvents: z.array(activationEventSchema).optional(),
  extensionAPI: z
    .object({
      provides: z.array(z.string().min(1)),
    })
    .optional(),
});

/**
 * Validate a plugin manifest against the schema
 * 
 * @param manifest The manifest object to validate
 * @returns Validation result
 */
export function validateManifest(manifest: unknown): ValidationResult {
  try {
    const result = pluginManifestSchema.safeParse(manifest);
    
    if (result.success) {
      return {
        valid: true,
        data: result.data as PluginManifest,
      };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map(
          (err) => `${err.path.join('.')}: ${err.message}`
        ),
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}

/**
 * Check if a manifest has a specific permission
 * 
 * @param manifest The plugin manifest
 * @param permission The permission to check
 * @returns Whether the manifest has the permission
 */
export function hasPermission(
  manifest: PluginManifest,
  permission: PluginPermission
): boolean {
  return manifest.permissions.includes(permission);
}

/**
 * Check if a manifest requires a UI contribution
 * 
 * @param manifest The plugin manifest
 * @returns Whether the manifest has UI contributions
 */
export function hasUIContributions(manifest: PluginManifest): boolean {
  const uiPermissions = [
    'ui:sidebar',
    'ui:toolbar',
    'ui:contextMenu',
    'ui:dialogs',
    'ui:statusBar',
  ] as PluginPermission[];
  
  return uiPermissions.some((permission) => hasPermission(manifest, permission));
}

/**
 * Validate a plugin's required permissions against a set of approved permissions
 * 
 * @param manifest The plugin manifest
 * @param approvedPermissions The permissions already approved
 * @returns Missing permissions that need approval
 */
export function getMissingPermissions(
  manifest: PluginManifest,
  approvedPermissions: PluginPermission[]
): PluginPermission[] {
  return manifest.permissions.filter(
    (permission) => !approvedPermissions.includes(permission)
  );
}

/**
 * Check if a plugin has all required dependencies installed
 * 
 * @param manifest The plugin manifest
 * @param installedPlugins Map of installed plugins and their versions
 * @returns Missing dependencies
 */
export function getMissingDependencies(
  manifest: PluginManifest,
  installedPlugins: Map<string, string>
): Record<string, string> {
  if (!manifest.dependencies) {
    return {};
  }
  
  const missingDependencies: Record<string, string> = {};
  
  for (const [depId, versionRange] of Object.entries(manifest.dependencies)) {
    if (!installedPlugins.has(depId)) {
      missingDependencies[depId] = versionRange;
    }
    // TODO: Add version compatibility check using semver
  }
  
  return missingDependencies;
}

/**
 * Check if the host version is compatible with the plugin's requirements
 * 
 * @param manifest The plugin manifest
 * @param hostVersion The host application version
 * @returns Whether the host version is compatible
 */
export function isHostVersionCompatible(
  manifest: PluginManifest,
  hostVersion: string
): boolean {
  // TODO: Implement semver version check
  return true;
}