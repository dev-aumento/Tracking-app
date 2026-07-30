import { isNativeApp } from "@/lib/platform";

/** Auth snapshot for fast shell paint before auth.me returns. */

export type CachedAuthUser = {
  id: number;
  unionId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "admin" | "manager" | "employee" | "hr" | "client";
  status: "active" | "inactive" | "suspended";
  department: string | null;
  position: string | null;
  phone: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date;
};

const AUTH_CACHE_KEY = "tracker.auth.me.v1";

function storage(): Storage | null {
  try {
    // Web: sessionStorage (clears when the browser tab/session ends) — original behavior.
    // Native: localStorage (survives app process kill on some devices).
    return isNativeApp() ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

export function readAuthCache(): CachedAuthUser | undefined {
  try {
    const store = storage();
    if (!store) return undefined;

    let raw = store.getItem(AUTH_CACHE_KEY);

    // One-time migrate: older native builds may have written to the other store.
    if (!raw && isNativeApp()) {
      raw = sessionStorage.getItem(AUTH_CACHE_KEY);
      if (raw) {
        localStorage.setItem(AUTH_CACHE_KEY, raw);
        sessionStorage.removeItem(AUTH_CACHE_KEY);
      }
    }

    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedAuthUser;
    if (!parsed?.id || !parsed?.role || !parsed?.status) return undefined;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
      lastSignInAt: new Date(parsed.lastSignInAt),
    };
  } catch {
    return undefined;
  }
}

export function writeAuthCache(user: CachedAuthUser | null | undefined) {
  try {
    const store = storage();
    if (!store) return;

    if (!user) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    store.setItem(AUTH_CACHE_KEY, JSON.stringify(user));

    // Keep stores from drifting across platforms.
    if (isNativeApp()) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearAuthCache() {
  writeAuthCache(null);
}
