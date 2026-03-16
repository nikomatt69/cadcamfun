// src/plugins/core/api/ui-api.ts
import { EventEmitter } from 'events';
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';
import { getPluginAPI } from './pluginApiRegistry';

/**
 * Get the UI API (works with or without window global)
 */
function getUIAPI() {
  try {
    return getPluginAPI().ui;
  } catch {
    return (window as any).__CAD_APP__?.ui;
  }
}

/**
 * Notification options
 */
export interface NotificationOptions {
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  actions?: Array<{
    label: string;
    callback: () => void;
  }>;
}

/**
 * Modal dialog options
 */
export interface ModalOptions {
  title: string;
  content: string | HTMLElement;
  width?: number | string;
  height?: number | string;
  buttons?: Array<{
    label: string;
    primary?: boolean;
    callback: () => void | Promise<void>;
  }>;
}

/**
 * Context menu item
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  callback: () => void;
}

/**
 * Sidebar panel options
 */
export interface SidebarPanelOptions {
  id: string;
  title: string;
  icon?: string;
  element: HTMLElement;
}

/**
 * Toolbar button options
 */
export interface ToolbarButtonOptions {
  id: string;
  tooltip: string;
  icon: string;
  callback: () => void;
}

/**
 * Theme information
 */
export interface ThemeInfo {
  type: 'light' | 'dark' | 'system';
  colors: Record<string, string>;
  fontFamily: string;
  spacing: Record<string, string | number>;
}

/**
 * UI API provides UI interaction capabilities
 */
export class UIAPI extends EventEmitter {
  private pluginId: string;
  private pluginName: string;
  
  constructor(pluginId: string, pluginName: string) {
    super();
    this.pluginId = pluginId;
    this.pluginName = pluginName;
  }
  
  /**
   * Show a notification to the user
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_SIDEBAR)
  public async showNotification(
    message: string, 
    options: NotificationOptions = {}
  ): Promise<void> {
    const api = getUIAPI();
    if (!api) throw new Error('UI API not available');
    await api.showNotification(
      this.pluginName,
      message,
      options
    );
  }
  
  /**
   * Show a modal dialog
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_MODAL)
  public async showModal(options: ModalOptions): Promise<void> {
    return getUIAPI().showModal({
      ...options,
      source: this.pluginId
    });
  }
  
  /**
   * Show a confirmation dialog
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_MODAL)
  public async showConfirmation(
    title: string,
    message: string
  ): Promise<boolean> {
    return getUIAPI().showConfirmation(title, message);
  }
  
  /**
   * Show an input dialog
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_MODAL)
  public async showInputDialog(
    title: string,
    message: string,
    defaultValue: string = ''
  ): Promise<string | null> {
    return getUIAPI().showInputDialog(title, message, defaultValue);
  }
  
  /**
   * Register a sidebar panel
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_SIDEBAR)
  public async registerSidebarPanel(options: SidebarPanelOptions): Promise<string> {
    return getUIAPI().registerSidebarPanel({
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Remove a sidebar panel
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_SIDEBAR)
  public async removeSidebarPanel(id: string): Promise<void> {
    await getUIAPI().removeSidebarPanel(id);
  }
  
  /**
   * Open a specific sidebar panel
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_SIDEBAR)
  public async openSidebarPanel(id: string): Promise<void> {
    await getUIAPI().openSidebarPanel(id);
  }
  
  /**
   * Register a toolbar button
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_TOOLBAR)
  public async registerToolbarButton(options: ToolbarButtonOptions): Promise<string> {
    return getUIAPI().registerToolbarButton({
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Remove a toolbar button
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_TOOLBAR)
  public async removeToolbarButton(id: string): Promise<void> {
    await getUIAPI().removeToolbarButton(id);
  }
  
  /**
   * Register a context menu item
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_CONTEXT_MENU)
  public async registerContextMenuItem(item: ContextMenuItem): Promise<string> {
    return getUIAPI().registerContextMenuItem({
      ...item,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Remove a context menu item
   */
  // @ts-ignore
  @requirePermission(PluginPermission.UI_CONTEXT_MENU)
  public async removeContextMenuItem(id: string): Promise<void> {
    await getUIAPI().removeContextMenuItem(id);
  }
  
  /**
   * Get current theme information
   */
  public async getTheme(): Promise<ThemeInfo> {
    return getUIAPI().getTheme();
  }
  
  /**
   * Register for theme change events
   */
  public onThemeChanged(handler: (theme: ThemeInfo) => void): () => void {
    this.on('themeChanged', handler);
    
    // Return unsubscribe function
    return () => {
      this.off('themeChanged', handler);
    };
  }
  
  /**
   * Register for sidebar toggle events
   */
  public onSidebarToggled(handler: (isOpen: boolean) => void): () => void {
    this.on('sidebarToggled', handler);
    
    return () => {
      this.off('sidebarToggled', handler);
    };
  }
}