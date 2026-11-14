/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Configuration passed directly by the page, instead of config.yml. */
    SAPPHIRE_CMS_CONFIG?: unknown;
    /** When true, the panel only opens when SapphireCMS.init() is called. */
    SAPPHIRE_CMS_MANUAL_INIT?: boolean;
    CMS_MANUAL_INIT?: boolean;
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }
}

export {};
