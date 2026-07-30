import { isNativeApp } from "@/lib/platform";

/**
 * Native-only session JWT backup.
 * Web app continues to rely on httpOnly cookies only — these helpers no-op in the browser.
 */

const SESSION_TOKEN_KEY = "tracker.session.token.v1";

export function readSessionToken(): string | null {
  if (!isNativeApp()) return null;
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function writeSessionToken(token: string | null | undefined) {
  if (!isNativeApp()) return;
  try {
    if (!token) {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      return;
    }
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearSessionToken() {
  writeSessionToken(null);
}
