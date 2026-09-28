declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.sass' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

interface Window {
  electron: {
    db: {
      execute: (sql: string, params?: unknown[]) => Promise<{ success: boolean; result?: unknown; error?: string }>;
      query: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
      get: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    };
    cache?: {
      saveProducts: (branchIds: string[], products: any[]) => Promise<{ success: boolean; count?: number; syncedAt?: number; error?: string }>;
      getProducts: (branchIds?: string[]) => Promise<{ success: boolean; data?: any[]; syncedAt?: number | null; error?: string }>;
      setMeta: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
      getMeta: (key: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    };
    offlineAuth?: {
      save: (email: string, password: string, payload: any) => Promise<{ success: boolean; error?: string }>;
      touch: (email: string, payload: any) => Promise<{ success: boolean; error?: string }>;
      verify: (email: string, password: string) => Promise<{
        success: boolean;
        payload?: any;
        lastOnlineAt?: number;
        reason?: 'no-cache' | 'expired' | 'bad-password' | 'error';
        maxDays?: number;
        error?: string;
      }>;
      getSnapshot: (email?: string) => Promise<{
        success: boolean;
        email?: string;
        payload?: any;
        lastOnlineAt?: number;
        reason?: 'no-cache' | 'expired' | 'error';
        maxDays?: number;
      }>;
      status: () => Promise<{ available: boolean; email?: string; lastOnlineAt?: number; maxDays: number }>;
      clear?: (email: string) => Promise<{ success: boolean; error?: string }>;
    };
    getDeviceId: () => Promise<string | null>;
    getSystemInfo: () => Promise<{ platform: string; arch: string; version: string; electronVersion: string }>;
    getAppVersion: () => Promise<string>;
    getLastShownVersion: () => Promise<string | null>;
    setLastShownVersion: (version: string) => Promise<{ success: boolean }>;
    getChangelogText: () => Promise<string>;
    exportPdf: (html: string, filename?: string) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
    guardarArchivos?: (
      carpeta: string,
      archivos: { nombre: string; base64: string }[],
    ) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
    platform: string;
  };
}