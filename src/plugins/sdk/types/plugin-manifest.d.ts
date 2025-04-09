/**
 * CAD/CAM FUN Plugin Manifest Type Definitions
 * 
 * This file defines the complete schema for plugin.json manifest files.
 * It is used for validation, documentation, and IDE intellisense.
 */

/**
 * Plugin Manifest Schema
 * 
 * The manifest describes a plugin, its capabilities, requirements,
 * and extension points it targets.
 */
export interface PluginManifest {
    /**
     * Unique identifier for the plugin
     * Must be globally unique, follow format: domain.organization.plugin-name
     * Example: "com.example.measurement-tools"
     */
    id: string;
    
    /**
     * Display name of the plugin
     * Shown in the plugin manager and UI
     */
    name: string;
    
    /**
     * Plugin version using Semantic Versioning (semver)
     * Format: MAJOR.MINOR.PATCH
     * Example: "1.0.0"
     */
    version: string;
    
    /**
     * Detailed description of the plugin
     * Shown in the plugin manager
     */
    description: string;
    
    /**
     * Plugin author information
     * Can be a name or organization
     */
    author: string;
    
    /**
     * Optional URL to the plugin repository
     */
    repository?: string;
    
    /**
     * Optional license identifier
     * Examples: "MIT", "GPL-3.0", "Apache-2.0"
     */
    license?: string;
    
    /**
     * Optional URL to the plugin's icon (SVG preferred)
     * Can also be a relative path to an icon in the plugin package
     */
    icon?: string;
    
    /**
     * Entry point for the plugin code
     * Relative path to the main JavaScript file
     */
    main: string;
    
    /**
     * Version compatibility requirements
     */
    engines: {
      /**
       * CAD/CAM platform version requirement (semver range)
       * Example: "^1.0.0" (compatible with 1.x.x)
       */
      cadcam: string;
    };
    
    /**
     * List of permissions required by the plugin
     * The user will be prompted to approve these during installation
     */
    permissions: PluginPermission[];
    
    /**
     * UI and extension point contributions
     */
    contributes?: PluginContributions;
    
    /**
     * Plugin dependencies
     * Maps plugin IDs to version requirements (semver ranges)
     */
    dependencies?: Record<string, string>;
    
    /**
     * Configuration schema
     * Defines the structure and default values for plugin settings
     */
    configuration?: PluginConfiguration;
    
    /**
     * Browser compatibility
     * If the plugin has specific browser requirements
     */
    browser?: {
      /**
       * Minimum supported browser versions
       */
      minVersions?: {
        chrome?: string;
        firefox?: string;
        safari?: string;
        edge?: string;
      };
    };
    
    /**
     * Optional keywords for marketplace search
     * Array of terms related to the plugin
     */
    keywords?: string[];
    
    /**
     * Optional categories for the plugin
     * Helps with organization in the marketplace
     */
    categories?: PluginCategory[];
    
    /**
     * Optional array of screenshots
     * Shown in the plugin marketplace
     */
    screenshots?: Screenshot[];
    
    /**
     * Optional localization information
     */
    l10n?: {
      /**
       * Default locale
       */
      defaultLocale: string;
      
      /**
       * Available localizations
       * Maps locale ID to a localization file path
       */
      localizations: Record<string, string>;
    };
    
    /**
     * Optional metadata for marketplace display
     */
    marketplace?: {
      /**
       * URL to plugin home page
       */
      homepage?: string;
      
      /**
       * URL to plugin documentation
       */
      documentation?: string;
      
      /**
       * URL to plugin support/issues
       */
      support?: string;
      
      /**
       * URL to plugin changelog
       */
      changelog?: string;
      
      /**
       * Pricing information
       */
      pricing?: {
        /**
         * Pricing model
         */
        model: 'free' | 'paid' | 'freemium' | 'subscription';
        
        /**
         * Optional price display string
         */
        price?: string;
      };
      
      /**
       * Flags for highlighting in marketplace
       */
      flags?: {
        /**
         * Whether this is a featured plugin
         */
        featured?: boolean;
        
        /**
         * Whether this is a verified plugin
         */
        verified?: boolean;
        
        /**
         * Whether this is a new plugin
         */
        new?: boolean;
      };
    };
    
    /**
     * Optional activation events array
     * Defines when the plugin should be activated
     */
    activationEvents?: ActivationEvent[];
    
    /**
     * Optional extension API additions
     * Advanced feature for plugins that extend the plugin API itself
     */
    extensionAPI?: {
      /**
       * API modules this plugin provides
       */
      provides: string[];
    };
  }
  
  /**
   * Plugin permission types
   * Each permission represents a capability the plugin may use
   */
  export type PluginPermission =
    /** Read access to the model */
    | 'model:read'
    /** Write access to the model */
    | 'model:write'
    /** Access to model selection */
    | 'model:selection'
    /** Access to model history (undo/redo) */
    | 'model:history'
    /** UI sidebar panel access */
    | 'ui:sidebar'
    /** UI toolbar access */
    | 'ui:toolbar'
    /** UI context menu access */
    | 'ui:contextMenu'
    /** UI dialogs and notifications */
    | 'ui:dialogs'
    /** UI status bar access */
    | 'ui:statusBar'
    /** Local storage access */
    | 'storage:local'
    /** Cloud storage access */
    | 'storage:cloud'
    /** Read access to files */
    | 'file:read'
    /** Write access to files */
    | 'file:write'
    /** Open/save dialogs access */
    | 'file:dialogs'
    /** Same-origin network requests */
    | 'network:sameOrigin'
    /** Cross-origin network requests */
    | 'network:crossOrigin'
    /** Clipboard access */
    | 'system:clipboard'
    /** Print access */
    | 'system:print';
  
  /**
   * Plugin categories for marketplace organization
   */
  export type PluginCategory =
    | 'Modeling'
    | 'Analysis'
    | 'Simulation'
    | 'Manufacturing'
    | 'Documentation'
    | 'Visualization'
    | 'Import/Export'
    | 'Utilities'
    | 'Integration'
    | 'UI Enhancement'
    | 'Measurement'
    | 'Collaboration'
    | 'Rendering'
    | 'Material Library'
    | 'Tool Library'
    | 'Education';
  
  /**
   * Plugin contributions to extension points
   */
  export interface PluginContributions {
    /**
     * Sidebar panel contribution
     */
    sidebar?: {
      /**
       * Panel title
       */
      title: string;
      
      /**
       * Icon for the sidebar (URL or built-in icon ID)
       */
      icon: string;
      
      /**
       * Entry point for the sidebar UI
       * Relative path to the JavaScript file
       */
      entry: string;
      
      /**
       * Initial width in pixels
       */
      width?: number;
      
      /**
       * Minimum width in pixels
       */
      minWidth?: number;
      
      /**
       * Maximum width in pixels
       */
      maxWidth?: number;
      
      /**
       * Order in the sidebar (lower comes first)
       */
      order?: number;
    };
    
    /**
     * Command contributions
     * Commands can be invoked from various UI elements
     */
    commands?: Command[];
    
    /**
     * Menu contributions
     * Adds items to various menus
     */
    menus?: {
      /**
       * Toolbar menu items
       */
      toolbar?: MenuItem[];
      
      /**
       * Context menu items
       */
      contextMenu?: ContextMenuItem[];
      
      /**
       * Main application menu items
       */
      mainMenu?: MainMenuItem[];
    };
    
    /**
     * Property panel contributions
     * Adds custom sections to the property panel
     */
    propertyPanel?: PropertyPanel[];
    
    /**
     * Theme contributions
     * Adds custom themes
     */
    themes?: Theme[];
    
    /**
     * Keyboard shortcut contributions
     */
    keybindings?: Keybinding[];
    
    /**
     * Toolbar button contributions
     */
    toolbarButtons?: ToolbarButton[];
    
    /**
     * Status bar contributions
     */
    statusBar?: StatusBarItem[];
    
    /**
     * View contributions
     */
    views?: View[];
    
    /**
     * File extension handling
     */
    fileHandlers?: FileHandler[];
  }
  
  /**
   * Command definition
   */
  export interface Command {
    /**
     * Command ID (must be unique)
     * Format: "pluginId.commandName"
     */
    id: string;
    
    /**
     * Command title displayed in UI
     */
    title: string;
    
    /**
     * Optional icon (URL or built-in icon ID)
     */
    icon?: string;
    
    /**
     * Optional keyboard shortcut
     * Format: "ctrl+shift+m"
     */
    keybinding?: string;
    
    /**
     * Optional tooltip
     */
    tooltip?: string;
    
    /**
     * Optional category for grouping commands
     */
    category?: string;
    
    /**
     * Optional enablement condition
     * Expression that determines when the command is enabled
     */
    enablement?: string;
  }
  
  /**
   * Menu item
   */
  export interface MenuItem {
    /**
     * Command ID this menu item invokes
     */
    command: string;
    
    /**
     * Optional group for organization
     */
    group?: string;
    
    /**
     * Optional order within group (lower comes first)
     */
    priority?: number;
    
    /**
     * Optional condition for when to show the item
     */
    when?: string;
    
    /**
     * Optional alt command (invoked with Alt key)
     */
    alt?: string;
  }
  
  /**
   * Context menu item
   */
  export interface ContextMenuItem extends MenuItem {
    /**
     * Contexts where this item appears
     */
    contexts: Array<'canvas' | 'entity' | 'selection' | 'panel'>;
  }
  
  /**
   * Main menu item
   */
  export interface MainMenuItem extends MenuItem {
    /**
     * Menu location (using path syntax)
     * Example: "Edit/Advanced"
     */
    location: string;
  }
  
  /**
   * Property panel contribution
   */
  export interface PropertyPanel {
    /**
     * Panel ID (must be unique)
     */
    id: string;
    
    /**
     * Panel title
     */
    title: string;
    
    /**
     * Entry point
     * Relative path to the JavaScript file
     */
    entry: string;
    
    /**
     * Entity types this panel applies to
     */
    appliesTo?: string | string[];
    
    /**
     * Order in the property panel (lower comes first)
     */
    order?: number;
  }
  
  /**
   * Theme contribution
   */
  export interface Theme {
    /**
     * Theme ID (must be unique)
     */
    id: string;
    
    /**
     * Theme label
     */
    label: string;
    
    /**
     * Path to theme CSS file
     */
    path: string;
    
    /**
     * Theme type
     */
    type: 'light' | 'dark' | 'high-contrast';
  }
  
  /**
   * Keyboard shortcut binding
   */
  export interface Keybinding {
    /**
     * Command ID this keybinding invokes
     */
    command: string;
    
    /**
     * Key combination
     * Format: "ctrl+shift+m"
     */
    key: string;
    
    /**
     * Optional condition for when the keybinding is active
     */
    when?: string;
    
    /**
     * Whether this overrides built-in keybindings
     */
    override?: boolean;
  }
  
  /**
   * Toolbar button contribution
   */
  export interface ToolbarButton {
    /**
     * Button ID (must be unique)
     */
    id: string;
    
    /**
     * Command ID this button invokes
     */
    command: string;
    
    /**
     * Button title
     */
    title: string;
    
    /**
     * Button icon (URL or built-in icon ID)
     */
    icon: string;
    
    /**
     * Toolbar group
     */
    group: string;
    
    /**
     * Order within group (lower comes first)
     */
    priority?: number;
    
    /**
     * Optional condition for when to show the button
     */
    when?: string;
    
    /**
     * Optional tooltip
     */
    tooltip?: string;
  }
  
  /**
   * Status bar item contribution
   */
  export interface StatusBarItem {
    /**
     * Item ID (must be unique)
     */
    id: string;
    
    /**
     * Command ID to invoke when clicked
     */
    command?: string;
    
    /**
     * Default text
     */
    text: string;
    
    /**
     * Item alignment
     */
    alignment: 'left' | 'right';
    
    /**
     * Priority (lower comes first)
     */
    priority?: number;
    
    /**
     * Optional tooltip
     */
    tooltip?: string;
    
    /**
     * Optional icon (URL or built-in icon ID)
     */
    icon?: string;
    
    /**
     * Optional condition for when to show the item
     */
    when?: string;
  }
  
  /**
   * View contribution
   */
  export interface View {
    /**
     * View ID (must be unique)
     */
    id: string;
    
    /**
     * View title
     */
    title: string;
    
    /**
     * View icon (URL or built-in icon ID)
     */
    icon: string;
    
    /**
     * Entry point
     * Relative path to the JavaScript file
     */
    entry: string;
    
    /**
     * View location
     */
    location: 'sidebar' | 'panel' | 'editor';
    
    /**
     * Optional order (lower comes first)
     */
    order?: number;
  }
  
  /**
   * File handler contribution
   */
  export interface FileHandler {
    /**
     * File extensions this handler supports
     * Example: [".stl", ".obj"]
     */
    extensions: string[];
    
    /**
     * Handler title
     */
    title: string;
    
    /**
     * Whether this handler supports import
     */
    import?: boolean;
    
    /**
     * Whether this handler supports export
     */
    export?: boolean;
    
    /**
     * Optional priority (higher has preference)
     */
    priority?: number;
  }
  
  /**
   * Plugin configuration schema
   */
  export interface PluginConfiguration {
    /**
     * Title for the configuration section
     */
    title?: string;
    
    /**
     * Properties schema
     * Maps property names to their definitions
     */
    properties: Record<string, ConfigurationProperty>;
  }
  
  /**
   * Configuration property definition
   */
  export interface ConfigurationProperty {
    /**
     * Property type
     */
    type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object' | 'null';
    
    /**
     * Default value
     */
    default?: any;
    
    /**
     * Property description
     */
    description?: string;
    
    /**
     * For enum types, the list of possible values
     */
    enum?: any[];
    
    /**
     * For enum types, labels for the values
     */
    enumDescriptions?: string[];
    
    /**
     * For numbers, the minimum value
     */
    minimum?: number;
    
    /**
     * For numbers, the maximum value
     */
    maximum?: number;
    
    /**
     * For strings, a regex pattern to validate
     */
    pattern?: string;
    
    /**
     * For arrays, the item type
     */
    items?: ConfigurationProperty;
    
    /**
     * For objects, the properties
     */
    properties?: Record<string, ConfigurationProperty>;
    
    /**
     * For objects, required properties
     */
    required?: string[];
    
    /**
     * Whether this property is required
     */
    isRequired?: boolean;
    
    /**
     * Format hint for editors
     */
    format?: 'uri' | 'email' | 'color' | 'date' | 'time' | 'date-time' | 'password';
    
    /**
     * Property order in the settings UI
     */
    order?: number;
  }
  
  /**
   * Screenshot for marketplace display
   */
  export interface Screenshot {
    /**
     * Image path or URL
     */
    path: string;
    
    /**
     * Optional caption
     */
    caption?: string;
    
    /**
     * Optional alt text for accessibility
     */
    alt?: string;
  }
  
  /**
   * Activation event types
   */
  export type ActivationEvent =
    | `onCommand:${string}`
    | `onView:${string}`
    | `onLanguage:${string}`
    | `onFileOpen:${string}`
    | `onStartup`
    | `onModelOpen`
    | `onModelCreate`
    | `onSelection`
    | `onWebviewPanel:${string}`;