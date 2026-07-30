/**
 * Base URL for API calls.
 * - Web (same origin): empty string → relative `/api/...`
 * - Capacitor / remote: set VITE_API_URL (e.g. https://tracking-crm.fly.dev)
 */
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
