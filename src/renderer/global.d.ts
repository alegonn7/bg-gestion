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

interface AdminResult {
  success: boolean;
  error?: string;
  user?: { id: string; email: string };
}

interface Window {
  electron: {
    db: {
      execute: (sql: string, params?: unknown[]) => Promise<{ success: boolean; result?: unknown; error?: string }>;
      query: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
      get: (sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    };
    getDeviceId: () => Promise<string | null>;
    getSystemInfo: () => Promise<{ platform: string; arch: string; version: string; electronVersion: string }>;
    getAppVersion: () => Promise<string>;
    getLastShownVersion: () => Promise<string | null>;
    setLastShownVersion: (version: string) => Promise<{ success: boolean }>;
    getChangelogText: () => Promise<string>;
    platform: string;
    admin: {
      createUser: (email: string, password: string) => Promise<AdminResult>;
      deleteUser: (authId: string) => Promise<AdminResult>;
    };
  };
}