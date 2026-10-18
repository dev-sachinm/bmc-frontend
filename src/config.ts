function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim() || "/api/v1";

export const apiBaseUrl = configuredBase.replace(/\/$/, "");

export const appName = import.meta.env.VITE_APP_NAME?.trim() || "BMC";

export const tablePageSize = Math.min(
  100,
  Math.max(1, envNumber(import.meta.env.VITE_TABLE_PAGE_SIZE, 20) || 20),
);

export const cacheStaleTime = envNumber(import.meta.env.VITE_CACHE_STALE_TIME, 0);

export const cacheGcTime = envNumber(import.meta.env.VITE_CACHE_GC_TIME, 300_000);

/** Turn an `/api/v1/...` path into the configured API base. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized.replace(/^\/api\/v1(?=\/|$)/, "");
  if (!suffix || suffix === "/") {
    return apiBaseUrl;
  }
  return `${apiBaseUrl}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
