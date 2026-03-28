export {}

declare global {
  interface Window {
    electron: {
      db: {
        execute: (sql: string, params?: any[]) => Promise<{ success: boolean; result?: any; error?: string }>
        query: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any[]; error?: string }>
        get: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>
      }
      getDeviceId: () => Promise<string>
      getSystemInfo: () => Promise<{
        platform: string
        arch: string
        version: string
        electronVersion: string
      }>
      platform: string
      getAppVersion?: () => Promise<string>
      getLastShownVersion?: () => Promise<string | null>
      setLastShownVersion?: (version: string) => Promise<{ success: boolean }>
      getChangelogText?: () => Promise<string>
    }
  }
}