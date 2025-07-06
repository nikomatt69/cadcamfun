import { useState, useEffect, useCallback } from 'react';

// Tauri API imports with conditional loading
let tauriApi: any = null;
let tauriCore: any = null;

// Check if we're in a Tauri environment
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && (
    // @ts-ignore
    window.__TAURI__ !== undefined ||
    // @ts-ignore
    window.__TAURI_METADATA__ !== undefined ||
    // @ts-ignore
    window.__TAURI_INTERNALS__ !== undefined
  );
};

// Dynamically import Tauri APIs only when needed
const loadTauriApis = async () => {
  if (!isTauri() || tauriApi) return;

  try {
    // Tauri v2 Core API
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Tauri v2 App API
    const { getName, getVersion } = await import('@tauri-apps/api/app');
    
    // Tauri v2 Window API
    const { getCurrentWindow, Window } = await import('@tauri-apps/api/window');
    
    // Tauri v2 Plugin APIs
    const { open, save, message } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile, writeTextFile, readDir, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    const { platform, arch, version } = await import('@tauri-apps/plugin-os');
    const { Command } = await import('@tauri-apps/plugin-shell');
    
    tauriApi = {
      // Core functionality
      invoke,
      app: { getName, getVersion },
      window: { getCurrentWindow, Window },
      // Plugin APIs
      dialog: { open, save, message },
      fs: { readTextFile, writeTextFile, readDir, mkdir, exists },
      notification: { sendNotification, isPermissionGranted, requestPermission },
      os: { platform, arch, version },
      shell: { Command },
    };

    tauriCore = { invoke };
  } catch (error) {
    console.warn('Failed to load Tauri APIs:', error);
  }
};

interface ServerStatus {
  isRunning: boolean;
  url?: string;
  port?: number;
}

interface AppInfo {
  version: string;
  name: string;
  description: string;
  os: string;
  os_version: string;
  kernel_version: string;
  total_memory: string;
  cpu_count: string;
}

export const useTauri = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ isRunning: false });
  const [isLoading, setIsLoading] = useState(true);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Initialize Tauri detection and APIs
  useEffect(() => {
    const initTauri = async () => {
      const desktop = isTauri();
      setIsDesktop(desktop);

      if (desktop) {
        await loadTauriApis();
        await checkServerStatus();
        await getAppInfo();
      }

      setIsLoading(false);
    };

    initTauri();
  }, []);

  // Check sidecar server status
  const checkServerStatus = useCallback(async () => {
    if (!isDesktop || !tauriCore) return;

    try {
      const isRunning = await tauriCore.invoke('get_server_status') as boolean;
      setServerStatus(prev => ({ ...prev, isRunning }));
    } catch (error) {
      console.error('Failed to check server status:', error);
      setServerStatus({ isRunning: false });
    }
  }, [isDesktop]);

  // Start sidecar server
  const startServer = useCallback(async (): Promise<string | null> => {
    if (!isDesktop || !tauriCore) return null;

    try {
      const url = await tauriCore.invoke('start_sidecar_server') as string;
      setServerStatus({ isRunning: true, url });
      return url;
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }, [isDesktop]);

  // Stop sidecar server
  const stopServer = useCallback(async (): Promise<void> => {
    if (!isDesktop || !tauriCore) return;

    try {
      await tauriCore.invoke('stop_sidecar_server');
      setServerStatus({ isRunning: false });
    } catch (error) {
      console.error('Failed to stop server:', error);
      throw error;
    }
  }, [isDesktop]);

  // Get app information
  const getAppInfo = useCallback(async () => {
    if (!isDesktop || !tauriApi) return;

    try {
      const [name, version, platform_info, arch_info, version_info] = await Promise.all([
        tauriApi.app.getName(),
        tauriApi.app.getVersion(),
        tauriApi.os.platform(),
        tauriApi.os.arch(),
        tauriApi.os.version()
      ]);
      
      const info: AppInfo = {
        name,
        version,
        description: 'Professional CAD/CAM Software',
        os: platform_info,
        os_version: version_info,
        kernel_version: version_info,
        total_memory: 'N/A', // Would need system info API
        cpu_count: 'N/A', // Would need system info API
      };
      
      setAppInfo(info);
    } catch (error) {
      console.error('Failed to get app info:', error);
    }
  }, [isDesktop, tauriApi]);

  // Show notification
  const showNotification = useCallback(async (title: string, body: string) => {
    if (!isDesktop || !tauriApi) {
      // Fallback to web notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return;
    }

    try {
      // Check permission first
      let permission = await tauriApi.notification.isPermissionGranted();
      if (!permission) {
        permission = await tauriApi.notification.requestPermission();
      }
      
      if (permission) {
        await tauriApi.notification.sendNotification({ title, body });
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }, [isDesktop, tauriApi]);

  // Open file dialog
  const openFileDialog = useCallback(async (): Promise<string | null> => {
    if (!isDesktop || !tauriApi) {
      // Fallback to web file input
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.step,.stp,.iges,.igs,.stl,.obj,.dxf';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          resolve(file ? file.name : null);
        };
        input.click();
      });
    }

    try {
      const result = await tauriApi.dialog.open({
        filters: [
          {
            name: 'CAD Files',
            extensions: ['step', 'stp', 'iges', 'igs', 'stl', 'obj', 'dxf']
          }
        ]
      });
      return result as string | null;
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      return null;
    }
  }, [isDesktop, tauriApi]);

  // Save file dialog
  const saveFileDialog = useCallback(async (): Promise<string | null> => {
    if (!isDesktop || !tauriApi) {
      // Fallback to download
      return null;
    }

    try {
      const result = await tauriApi.dialog.save({
        filters: [
          {
            name: 'CAD Files',
            extensions: ['step', 'stp', 'iges', 'igs', 'stl', 'obj', 'dxf']
          }
        ]
      });
      return result as string | null;
    } catch (error) {
      console.error('Failed to open save dialog:', error);
      return null;
    }
  }, [isDesktop, tauriApi]);

  // Authenticate user (desktop)
  const authenticateUser = useCallback(async (username: string, password: string): Promise<string> => {
    if (!isDesktop || !tauriCore) {
      throw new Error('Desktop authentication not available');
    }

    try {
      return await tauriCore.invoke('authenticate_user', { username, password }) as string;
    } catch (error) {
      console.error('Failed to authenticate user:', error);
      throw error;
    }
  }, [isDesktop]);

  // Validate token (desktop)
  const validateToken = useCallback(async (token: string): Promise<boolean> => {
    if (!isDesktop || !tauriCore) {
      return false;
    }

    try {
      return await tauriCore.invoke('validate_token', { token }) as boolean;
    } catch (error) {
      console.error('Failed to validate token:', error);
      return false;
    }
  }, [isDesktop]);

  return {
    // Status
    isDesktop,
    isLoading,
    serverStatus,
    appInfo,

    // Server management
    startServer,
    stopServer,
    checkServerStatus,

    // File operations
    openFileDialog,
    saveFileDialog,

    // Authentication
    authenticateUser,
    validateToken,

    // UI operations
    showNotification,

    // Utilities
    getAppInfo,
    tauriApi: isDesktop ? tauriApi : null,
  };
};

// Utility function to check if running in Tauri (for use outside components)
export const checkIsTauri = isTauri;

// Environment detection utility
export const getEnvironment = () => {
  if (typeof window === 'undefined') {
    return 'server';
  }

  if (isTauri()) {
    return 'desktop';
  }

  return 'web';
};

// API URL helper that works in both web and desktop
export const getApiUrl = (path: string = '') => {
  const env = getEnvironment();
  
  if (env === 'desktop') {
    // For desktop, use the sidecar server (check multiple possible ports)
    const baseUrl = 'http://127.0.0.1:3001'; // Default sidecar port
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // For web, use current origin or environment variable
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // Server-side
  return process.env.NEXTAUTH_URL + (path.startsWith('/') ? path : `/${path}`);
};