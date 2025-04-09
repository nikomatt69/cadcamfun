// UI-related type definitions

export type ToolbarPosition = 'left' | 'right' | 'top' | 'bottom';

export type ModalType = 
  | 'settings' 
  | 'import' 
  | 'export' 
  | 'save' 
  | 'properties' 
  | 'help'
  | 'none';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  duration?: number; // in milliseconds
  dismissable?: boolean;
};

export type MenuItemType = {
  id: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  submenu?: MenuItemType[];
  disabled?: boolean;
  divider?: boolean;
};

export type ContextMenuOptions = {
  position: { x: number; y: number };
  items: MenuItemType[];
  elementId?: string;
};

export type ToolTip = {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number; // in milliseconds
};

export type Theme = 'light' | 'dark' | 'system';

export type UiState = {
  sidebarOpen: boolean;
  activeTool: string | null;
  activeModal: ModalType;
  notifications: Notification[];
  contextMenu: ContextMenuOptions | null;
  theme: Theme;
}; 