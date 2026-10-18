/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_TABLE_PAGE_SIZE: string;
  readonly VITE_CACHE_STALE_TIME: string;
  readonly VITE_CACHE_GC_TIME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
