/**
 * CAD/CAM FUN Plugin API Definitions
 * 
 * This file contains type definitions for the complete plugin API surface.
 * It serves both as a contract for plugin developers and as documentation.
 */

declare namespace CADCAM {
    /**
     * Common Types
     */
    type EntityId = string;
    type Vector3 = { x: number; y: number; z: number };
    type Quaternion = { x: number; y: number; z: number; w: number };
    type RGBA = { r: number; g: number; b: number; a: number };
    type BoundingBox = { min: Vector3; max: Vector3 };
    type Transform = { position: Vector3; rotation: Quaternion; scale: Vector3 };
    
    /**
     * Core API - Available to all plugins
     */
    interface PluginAPI {
      /** Access to the model API for working with CAD entities */
      model: ModelAPI;
      
      /** Access to the UI API for creating user interfaces */
      ui: UIAPI;
      
      /** Access to file operations */
      file: FileAPI;
      
      /** Access to network requests */
      network: NetworkAPI;
      
      /** Access to plugin storage */
      storage: StorageAPI;
      
      /** Access to events system */
      events: EventsAPI;
      
      /** Plugin host information and utilities */
      host: HostAPI;
    }
    
    /**
     * Host API - Information about the plugin host environment
     */
    interface HostAPI {
      /** Get plugin metadata */
      getMetadata(): PluginMetadata;
      
      /** Log message to the plugin console (appears in plugin manager) */
      log(message: string, level?: 'info' | 'warn' | 'error'): void;
      
      /** Get the current locale (for i18n) */
      getLocale(): string;
      
      /** Get information about the host application */
      getHostInfo(): HostInfo;
      
      /** Notify plugin host that the plugin is ready */
      notifyReady(): Promise<void>;
    }
    
    interface HostInfo {
      /** Host application name */
      name: string;
      
      /** Host application version */
      version: string;
      
      /** Plugin API version */
      apiVersion: string;
      
      /** Host platform (os) */
      platform: 'windows' | 'macos' | 'linux' | 'web';
      
      /** Host capabilities */
      capabilities: string[];
      
      /** Extensions available on host */
      extensions: string[];
    }
    
    interface PluginMetadata {
      /** Plugin ID */
      id: string;
      
      /** Plugin name */
      name: string;
      
      /** Plugin version */
      version: string;
      
      /** Plugin description */
      description: string;
      
      /** Plugin author */
      author: string;
      
      /** Active permissions */
      permissions: PluginPermission[];
    }
    
    /**
     * Model API - Core functionality for working with the CAD model
     */
    interface ModelAPI {
      /**
       * Get entities from the model, optionally filtered
       */
      getEntities(options?: {
        /** Type of entities to get */
        type?: EntityType | EntityType[];
        
        /** Filter by property values */
        filter?: Record<string, any>;
        
        /** Include hidden entities */
        includeHidden?: boolean;
        
        /** Maximum number of entities to return */
        limit?: number;
      }): Promise<Entity[]>;
      
      /**
       * Get an entity by its ID
       */
      getEntityById(id: EntityId): Promise<Entity | null>;
      
      /**
       * Create a new entity in the model
       */
      createEntity(entity: EntityCreateParams): Promise<Entity>;
      
      /**
       * Update an existing entity
       */
      updateEntity(id: EntityId, changes: Partial<EntityUpdateParams>): Promise<Entity>;
      
      /**
       * Delete an entity by ID
       */
      deleteEntity(id: EntityId): Promise<boolean>;
      
      /**
       * Get the current selection state
       */
      getSelection(): Promise<EntityId[]>;
      
      /**
       * Set the active selection
       */
      setSelection(ids: EntityId[]): Promise<void>;
      
      /**
       * Add entities to the current selection
       */
      addToSelection(ids: EntityId[]): Promise<void>;
      
      /**
       * Remove entities from the current selection
       */
      removeFromSelection(ids: EntityId[]): Promise<void>;
      
      /**
       * Clear the current selection
       */
      clearSelection(): Promise<void>;
      
      /**
       * Transform entities
       */
      transformEntities(ids: EntityId[], transform: TransformOperation): Promise<void>;
      
      /**
       * Perform a boolean operation on entities
       */
      booleanOperation(
        operation: 'union' | 'subtract' | 'intersect',
        targetId: EntityId,
        toolIds: EntityId[]
      ): Promise<Entity>;
      
      /**
       * Get model statistics
       */
      getStatistics(): Promise<ModelStatistics>;
      
      /**
       * Import data into the model
       */
      importData(data: ArrayBuffer | string, options: ImportOptions): Promise<ImportResult>;
      
      /**
       * Export data from the model
       */
      exportData(options: ExportOptions): Promise<ArrayBuffer>;
      
      /**
       * Get model metadata
       */
      getMetadata(): Promise<ModelMetadata>;
      
      /**
       * Set model metadata
       */
      setMetadata(metadata: Partial<ModelMetadata>): Promise<void>;
      
      /**
       * Undo the last operation
       */
      undo(): Promise<boolean>;
      
      /**
       * Redo the last undone operation
       */
      redo(): Promise<boolean>;
      
      /**
       * Check if the model has been modified
       */
      isModified(): Promise<boolean>;
      
      /**
       * Get the model's bounding box
       */
      getBoundingBox(): Promise<BoundingBox>;
      
      /**
       * Fit view to entities or the entire model
       */
      fitToView(entityIds?: EntityId[]): Promise<void>;
      
      /**
       * Event fired when entities are added
       */
      onEntitiesAdded(callback: (entities: Entity[]) => void): Disposable;
      
      /**
       * Event fired when entities are updated
       */
      onEntitiesUpdated(callback: (entities: Entity[]) => void): Disposable;
      
      /**
       * Event fired when entities are deleted
       */
      onEntitiesDeleted(callback: (entityIds: EntityId[]) => void): Disposable;
      
      /**
       * Event fired when selection changes
       */
      onSelectionChanged(callback: (entityIds: EntityId[]) => void): Disposable;
    }
    
    /**
     * UI API - Create and manage user interfaces
     */
    interface UIAPI {
      /**
       * Show a notification message
       */
      showNotification(message: string, options?: NotificationOptions): Promise<void>;
      
      /**
       * Show a modal dialog
       */
      showDialog(options: DialogOptions): Promise<DialogResult>;
      
      /**
       * Register a custom panel in the UI
       */
      registerPanel(options: PanelOptions): Promise<PanelRegistration>;
      
      /**
       * Create a toolbar item
       */
      createToolbarItem(options: ToolbarItemOptions): Promise<ToolbarRegistration>;
      
      /**
       * Register a context menu item
       */
      registerContextMenuItem(options: ContextMenuItemOptions): Promise<ContextMenuRegistration>;
      
      /**
       * Show a quick pick dropdown
       */
      showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | null>;
      
      /**
       * Show an input box
       */
      showInputBox(options: InputBoxOptions): Promise<string | null>;
      
      /**
       * Create a status bar item
       */
      createStatusBarItem(options: StatusBarItemOptions): Promise<StatusBarItem>;
      
      /**
       * Set the current cursor
       */
      setCursor(cursor: CursorType): Promise<void>;
      
      /**
       * Get the current theme information
       */
      getTheme(): Promise<ThemeInfo>;
      
      /**
       * Event fired when the theme changes
       */
      onThemeChanged(callback: (theme: ThemeInfo) => void): Disposable;
      
      /**
       * Event fired when a panel is shown or hidden
       */
      onPanelVisibilityChanged(callback: (panelId: string, visible: boolean) => void): Disposable;
    }
    
    /**
     * File API - Access to the file system
     */
    interface FileAPI {
      /**
       * Show an open file dialog
       */
      showOpenDialog(options: OpenDialogOptions): Promise<FileInfo[] | null>;
      
      /**
       * Show a save file dialog
       */
      showSaveDialog(options: SaveDialogOptions): Promise<FileInfo | null>;
      
      /**
       * Read a file as text
       */
      readTextFile(uri: string): Promise<string>;
      
      /**
       * Read a file as binary
       */
      readBinaryFile(uri: string): Promise<ArrayBuffer>;
      
      /**
       * Write text to a file
       */
      writeTextFile(uri: string, content: string): Promise<void>;
      
      /**
       * Write binary data to a file
       */
      writeBinaryFile(uri: string, content: ArrayBuffer): Promise<void>;
      
      /**
       * Check if a file exists
       */
      fileExists(uri: string): Promise<boolean>;
      
      /**
       * Get file metadata
       */
      getFileInfo(uri: string): Promise<FileInfo>;
      
      /**
       * Create a directory
       */
      createDirectory(uri: string): Promise<void>;
      
      /**
       * List files in a directory
       */
      listDirectory(uri: string): Promise<FileInfo[]>;
      
      /**
       * Delete a file or directory
       */
      delete(uri: string, options?: { recursive?: boolean }): Promise<void>;
      
      /**
       * Get a temporary file path
       */
      getTempFilePath(extension?: string): Promise<string>;
    }
    
    /**
     * Network API - HTTP and other network capabilities
     */
    interface NetworkAPI {
      /**
       * Perform an HTTP request
       */
      httpRequest(options: HttpRequestOptions): Promise<HttpResponse>;
      
      /**
       * Fetch a resource (similar to browser fetch API)
       */
      fetch(url: string, options?: FetchOptions): Promise<Response>;
      
      /**
       * Check if online
       */
      isOnline(): Promise<boolean>;
      
      /**
       * Event fired when online status changes
       */
      onOnlineStatusChanged(callback: (online: boolean) => void): Disposable;
    }
    
    /**
     * Storage API - Persistent storage for plugin data
     */
    interface StorageAPI {
      /**
       * Get a value from storage
       */
      get<T = any>(key: string, defaultValue?: T): Promise<T | undefined>;
      
      /**
       * Set a value in storage
       */
      set<T = any>(key: string, value: T): Promise<void>;
      
      /**
       * Remove a value from storage
       */
      remove(key: string): Promise<void>;
      
      /**
       * Clear all storage for this plugin
       */
      clear(): Promise<void>;
      
      /**
       * Get all keys in storage
       */
      keys(): Promise<string[]>;
      
      /**
       * Event fired when storage changes
       */
      onDidChangeStorage(callback: (key: string, value: any) => void): Disposable;
    }
    
    /**
     * Events API - Global event system
     */
    interface EventsAPI {
      /**
       * Subscribe to an event
       */
      on<T = any>(event: string, callback: (data: T) => void): Disposable;
      
      /**
       * Emit an event (plugins can only emit custom events)
       */
      emit(event: string, data?: any): Promise<void>;
      
      /**
       * Get all available system events
       */
      getAvailableEvents(): Promise<EventInfo[]>;
    }
    
    /**
     * Entity types and related interfaces
     */
    type EntityType = 
      | 'point' 
      | 'line' 
      | 'arc' 
      | 'circle' 
      | 'ellipse'
      | 'spline' 
      | 'polyline' 
      | 'text' 
      | 'dimension'
      | 'cube' 
      | 'sphere' 
      | 'cylinder' 
      | 'cone' 
      | 'torus'
      | 'mesh' 
      | 'solid' 
      | 'group' 
      | 'component';
    
    interface Entity {
      /** Unique entity ID */
      id: EntityId;
      
      /** Entity type */
      type: EntityType;
      
      /** Entity name */
      name: string;
      
      /** Entity transformation */
      transform: Transform;
      
      /** Entity color */
      color?: RGBA;
      
      /** Whether the entity is visible */
      visible: boolean;
      
      /** Whether the entity is locked */
      locked: boolean;
      
      /** Layer ID */
      layerId: string;
      
      /** Parent entity ID (if part of a group or assembly) */
      parentId?: EntityId;
      
      /** Custom properties */
      properties: Record<string, any>;
      
      /** Entity-specific data */
      data: any;
    }
    
    interface EntityCreateParams {
      /** Entity type */
      type: EntityType;
      
      /** Entity name */
      name?: string;
      
      /** Entity transformation */
      transform?: Partial<Transform>;
      
      /** Entity color */
      color?: RGBA;
      
      /** Whether the entity is visible */
      visible?: boolean;
      
      /** Layer ID */
      layerId?: string;
      
      /** Parent entity ID (if part of a group or assembly) */
      parentId?: EntityId;
      
      /** Custom properties */
      properties?: Record<string, any>;
      
      /** Entity-specific data */
      data: any;
    }
    
    interface EntityUpdateParams {
      /** Entity name */
      name?: string;
      
      /** Entity transformation */
      transform?: Partial<Transform>;
      
      /** Entity color */
      color?: RGBA;
      
      /** Whether the entity is visible */
      visible?: boolean;
      
      /** Whether the entity is locked */
      locked?: boolean;
      
      /** Layer ID */
      layerId?: string;
      
      /** Parent entity ID (if part of a group or assembly) */
      parentId?: EntityId;
      
      /** Custom properties */
      properties?: Record<string, any>;
      
      /** Entity-specific data */
      data?: any;
    }
    
    interface TransformOperation {
      /** Translation to apply */
      translate?: Vector3;
      
      /** Rotation to apply */
      rotate?: Quaternion;
      
      /** Scale to apply */
      scale?: Vector3;
      
      /** Center of transformation */
      center?: Vector3;
    }
    
    interface ModelStatistics {
      /** Total number of entities */
      entityCount: number;
      
      /** Count of entities by type */
      countByType: Record<EntityType, number>;
      
      /** Memory usage (in bytes) */
      memoryUsage: number;
      
      /** Model complexity score (0-100) */
      complexityScore: number;
    }
    
    interface ModelMetadata {
      /** Model title */
      title: string;
      
      /** Model description */
      description: string;
      
      /** Model author */
      author: string;
      
      /** Creation date */
      created: string;
      
      /** Last modified date */
      modified: string;
      
      /** Custom metadata */
      [key: string]: any;
    }
    
    interface ImportOptions {
      /** Format to import from */
      format: 'obj' | 'stl' | 'step' | 'gltf' | 'dxf' | 'svg' | 'json';
      
      /** Import configuration */
      config?: any;
    }
    
    interface ImportResult {
      /** IDs of imported entities */
      entityIds: EntityId[];
      
      /** Any warnings during import */
      warnings: string[];
      
      /** Statistics about the import */
      stats: {
        /** Number of entities imported */
        entityCount: number;
        
        /** Import duration in milliseconds */
        duration: number;
      };
    }
    
    interface ExportOptions {
      /** Format to export to */
      format: 'obj' | 'stl' | 'step' | 'gltf' | 'dxf' | 'svg' | 'json';
      
      /** Entity IDs to export (if omitted, exports all) */
      entityIds?: EntityId[];
      
      /** Export configuration */
      config?: any;
    }
    
    /**
     * UI related interfaces
     */
    interface NotificationOptions {
      /** Notification type */
      type?: 'info' | 'warning' | 'error' | 'success';
      
      /** Notification duration in milliseconds (0 for no timeout) */
      duration?: number;
      
      /** Actions available on the notification */
      actions?: Array<{
        /** Action title */
        title: string;
        
        /** ID for identifying the action when clicked */
        id: string;
      }>;
    }
    
    interface DialogOptions {
      /** Dialog title */
      title: string;
      
      /** Dialog message */
      message: string;
      
      /** Whether the dialog is modal */
      modal?: boolean;
      
      /** Dialog type */
      type?: 'info' | 'warning' | 'error' | 'success' | 'question';
      
      /** Buttons to show */
      buttons?: Array<{
        /** Button text */
        text: string;
        
        /** Button ID */
        id: string;
        
        /** Whether this is the primary button */
        primary?: boolean;
      }>;
      
      /** Default button ID (focused by default) */
      defaultButton?: string;
      
      /** Whether to show a "Cancel" button */
      cancelButton?: boolean;
    }
    
    interface DialogResult {
      /** ID of the clicked button */
      buttonId: string;
      
      /** Whether the dialog was cancelled */
      cancelled: boolean;
    }
    
    interface PanelOptions {
      /** Panel ID */
      id: string;
      
      /** Panel title */
      title: string;
      
      /** Panel location */
      location: 'sidebar' | 'bottomPanel' | 'rightPanel';
      
      /** Panel icon (URL or built-in icon ID) */
      icon?: string;
      
      /** Panel HTML content */
      content?: string;
      
      /** Panel sorting order (lower comes first) */
      order?: number;
      
      /** Minimum panel width */
      minWidth?: number;
      
      /** Minimum panel height */
      minHeight?: number;
      
      /** Whether the panel is resizable */
      resizable?: boolean;
      
      /** Initial panel state */
      initialState?: 'open' | 'closed';
    }
    
    interface PanelRegistration {
      /** Panel ID */
      id: string;
      
      /** Update panel content */
      updateContent(content: string): Promise<void>;
      
      /** Show the panel */
      show(): Promise<void>;
      
      /** Hide the panel */
      hide(): Promise<void>;
      
      /** Check if panel is visible */
      isVisible(): Promise<boolean>;
      
      /** Dispose the panel */
      dispose(): Promise<void>;
      
      /** Event fired when the panel is shown */
      onDidShow(callback: () => void): Disposable;
      
      /** Event fired when the panel is hidden */
      onDidHide(callback: () => void): Disposable;
    }
    
    interface ToolbarItemOptions {
      /** Item ID */
      id: string;
      
      /** Item title */
      title: string;
      
      /** Item tooltip */
      tooltip?: string;
      
      /** Item icon (URL or built-in icon ID) */
      icon?: string;
      
      /** Item group (for organizing toolbar) */
      group?: string;
      
      /** Item order within group (lower comes first) */
      order?: number;
      
      /** Whether this is a menu with sub-items */
      menu?: boolean;
      
      /** Sub-items (if this is a menu) */
      items?: Array<Omit<ToolbarItemOptions, 'group' | 'menu' | 'items'>>;
    }
    
    interface ToolbarRegistration {
      /** Item ID */
      id: string;
      
      /** Set the enabled state */
      setEnabled(enabled: boolean): Promise<void>;
      
      /** Set the visibility */
      setVisible(visible: boolean): Promise<void>;
      
      /** Set the badge */
      setBadge(badge?: { text?: string; tooltip?: string; color?: string }): Promise<void>;
      
      /** Dispose the toolbar item */
      dispose(): Promise<void>;
      
      /** Event fired when the toolbar item is clicked */
      onDidClick(callback: () => void): Disposable;
    }
    
    interface ContextMenuItemOptions {
      /** Item ID */
      id: string;
      
      /** Item title */
      title: string;
      
      /** Contexts where this item appears */
      contexts: Array<'canvas' | 'entity' | 'selection' | 'panel'>;
      
      /** Filter condition for when to show */
      when?: string;
      
      /** Item group (for organizing) */
      group?: string;
      
      /** Item order within group (lower comes first) */
      order?: number;
    }
    
    interface ContextMenuRegistration {
      /** Item ID */
      id: string;
      
      /** Set the enabled state */
      setEnabled(enabled: boolean): Promise<void>;
      
      /** Set the visibility */
      setVisible(visible: boolean): Promise<void>;
      
      /** Dispose the context menu item */
      dispose(): Promise<void>;
      
      /** Event fired when the context menu item is clicked */
      onDidClick(callback: (context: ContextInfo) => void): Disposable;
    }
    
    interface ContextInfo {
      /** Context type */
      type: 'canvas' | 'entity' | 'selection' | 'panel';
      
      /** Entity IDs (if entity or selection context) */
      entityIds?: EntityId[];
      
      /** Mouse position (in canvas coordinates) */
      position?: Vector3;
      
      /** Panel ID (if panel context) */
      panelId?: string;
    }
    
    interface QuickPickItem {
      /** Item ID */
      id: string;
      
      /** Item label */
      label: string;
      
      /** Item description */
      description?: string;
      
      /** Item detail information */
      detail?: string;
      
      /** Item icon */
      iconUrl?: string;
      
      /** Item sorting order (lower comes first) */
      order?: number;
    }
    
    interface QuickPickOptions {
      /** Quick pick title */
      title?: string;
      
      /** Placeholder text */
      placeholder?: string;
      
      /** Whether to allow multiple selections */
      multiple?: boolean;
      
      /** Whether to match on description too */
      matchOnDescription?: boolean;
      
      /** Whether to match on detail too */
      matchOnDetail?: boolean;
    }
    
    interface InputBoxOptions {
      /** Input box title */
      title?: string;
      
      /** Placeholder text */
      placeholder?: string;
      
      /** Default value */
      value?: string;
      
      /** Prompt text */
      prompt?: string;
      
      /** Validation function */
      validateInput?: (value: string) => string | null;
      
      /** Whether to use a password field */
      password?: boolean;
    }
    
    interface StatusBarItemOptions {
      /** Item alignment */
      alignment: 'left' | 'right';
      
      /** Item priority (lower comes first) */
      priority?: number;
      
      /** Initial text */
      text?: string;
      
      /** Initial tooltip */
      tooltip?: string;
      
      /** Initial icon URL */
      iconUrl?: string;
    }
    
    interface StatusBarItem {
      /** Set the text */
      setText(text: string): void;
      
      /** Set the tooltip */
      setTooltip(tooltip: string): void;
      
      /** Set the icon URL */
      setIconUrl(iconUrl: string): void;
      
      /** Set visibility */
      setVisible(visible: boolean): void;
      
      /** Show the status bar item */
      show(): void;
      
      /** Hide the status bar item */
      hide(): void;
      
      /** Dispose the status bar item */
      dispose(): void;
      
      /** Event fired when the status bar item is clicked */
      onDidClick(callback: () => void): Disposable;
    }
    
    type CursorType = 
      | 'default' 
      | 'pointer' 
      | 'crosshair' 
      | 'move' 
      | 'grab' 
      | 'grabbing'
      | 'ew-resize' 
      | 'ns-resize' 
      | 'nesw-resize' 
      | 'nwse-resize'
      | 'zoom-in' 
      | 'zoom-out' 
      | 'text' 
      | 'wait' 
      | 'progress' 
      | 'not-allowed' 
      | 'help'
      | 'none';
    
    interface ThemeInfo {
      /** Theme kind */
      kind: 'light' | 'dark' | 'high-contrast';
      
      /** Theme colors */
      colors: Record<string, string>;
      
      /** Theme font family */
      fontFamily: string;
      
      /** Theme font size */
      fontSize: string;
      
      /** Whether the theme is user customized */
      isCustom: boolean;
    }
    
    /**
     * File and networking related interfaces
     */
    interface FileInfo {
      /** File URI */
      uri: string;
      
      /** File name */
      name: string;
      
      /** File path */
      path: string;
      
      /** File size in bytes */
      size: number;
      
      /** Last modified timestamp */
      lastModified: number;
      
      /** Whether this is a directory */
      isDirectory: boolean;
      
      /** File MIME type */
      mimeType?: string;
    }
    
    interface OpenDialogOptions {
      /** Dialog title */
      title?: string;
      
      /** Whether to allow multiple selections */
      multiple?: boolean;
      
      /** File filters */
      filters?: Array<{
        /** Filter name */
        name: string;
        
        /** Filter extensions */
        extensions: string[];
      }>;
      
      /** Default path to open dialog at */
      defaultPath?: string;
      
      /** Whether to allow directory selection */
      allowDirectories?: boolean;
    }
    
    interface SaveDialogOptions {
      /** Dialog title */
      title?: string;
      
      /** Default file name */
      defaultFileName?: string;
      
      /** File filters */
      filters?: Array<{
        /** Filter name */
        name: string;
        
        /** Filter extensions */
        extensions: string[];
      }>;
      
      /** Default path to open dialog at */
      defaultPath?: string;
    }
    
    interface HttpRequestOptions {
      /** Request URL */
      url: string;
      
      /** Request method */
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
      
      /** Request headers */
      headers?: Record<string, string>;
      
      /** Request body */
      body?: string | ArrayBuffer | Record<string, any>;
      
      /** Request timeout in milliseconds */
      timeout?: number;
      
      /** Whether to follow redirects */
      followRedirects?: boolean;
      
      /** Whether to parse the response as JSON */
      json?: boolean;
    }
    
    interface HttpResponse {
      /** Response status code */
      status: number;
      
      /** Response status text */
      statusText: string;
      
      /** Response headers */
      headers: Record<string, string>;
      
      /** Response body */
      body: string | ArrayBuffer | any;
      
      /** Whether the response body is JSON */
      isJson: boolean;
      
      /** Whether the request was successful (status 2xx) */
      ok: boolean;
    }
    
    interface FetchOptions {
      /** Request method */
      method?: string;
      
      /** Request headers */
      headers?: Record<string, string>;
      
      /** Request body */
      body?: any;
      
      /** Credentials mode */
      credentials?: 'omit' | 'same-origin' | 'include';
      
      /** Cache mode */
      cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache';
      
      /** Redirect mode */
      redirect?: 'follow' | 'error' | 'manual';
      
      /** Referrer policy */
      referrerPolicy?: string;
      
      /** Request timeout in milliseconds */
      timeout?: number;
    }
    
    interface Response {
      /** Response body as ArrayBuffer */
      arrayBuffer(): Promise<ArrayBuffer>;
      
      /** Response body as Blob */
      blob(): Promise<Blob>;
      
      /** Response body as text */
      text(): Promise<string>;
      
      /** Response body as JSON */
      json<T = any>(): Promise<T>;
      
      /** Response headers */
      headers: Map<string, string>;
      
      /** Response status */
      status: number;
      
      /** Response status text */
      statusText: string;
      
      /** Whether the response was successful (status 2xx) */
      ok: boolean;
    }
    
    /**
     * Plugin Permissions
     */
    type PluginPermission =
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
     * Events related interfaces
     */
    interface EventInfo {
      /** Event name */
      name: string;
      
      /** Event description */
      description: string;
      
      /** Event category */
      category: string;
      
      /** Data types this event provides */
      dataTypes: string[];
      
      /** Required permission to access this event */
      permission?: PluginPermission;
    }
    
    /**
     * Utility interfaces
     */
    interface Disposable {
      /** Dispose this resource */
      dispose(): void;
    }
    
    /**
     * Plugin lifecycle related interfaces
     */
    
    interface PluginInitializationContext {
      /** Plugin metadata */
      metadata: PluginMetadata;
      
      /** Subscription to plugin deactivation */
      onDeactivation(callback: () => void | Promise<void>): void;
    }
    
    interface PluginExports {
      /**
       * Initialize the plugin
       * Called when the plugin is first loaded
       */
      initialize?(context: PluginInitializationContext, api: PluginAPI): void | Promise<void>;
      
      /**
       * Activate the plugin
       * Called when the plugin is activated
       */
      activate?(api: PluginAPI): void | Promise<void>;
      
      /**
       * Deactivate the plugin
       * Called when the plugin is deactivated
       */
      deactivate?(): void | Promise<void>;
    }
  }
  
  /**
   * Plugin entry point
   */
  declare function definePlugin(plugin: CADCAM.PluginExports): CADCAM.PluginExports;