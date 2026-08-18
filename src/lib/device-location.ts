import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type ClockInCoords = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters when the platform reports it. */
  accuracyMeters?: number;
};

export type PositionWatchHandle = {
  clear: () => Promise<void>;
};

function permissionDeniedError() {
  return new Error(
    "Location permission denied. Allow precise location access to clock in.",
  );
}

function unavailableError() {
  return new Error(
    "Location services are not available. Enable location access to clock in.",
  );
}

/**
 * Native (Android / iOS): request permission via Capacitor Geolocation, then read GPS.
 * Web: use the browser Geolocation API (permission prompt from the browser).
 */
export async function getCurrentPositionCoords(
  options?: PositionOptions,
): Promise<ClockInCoords> {
  if (Capacitor.isNativePlatform()) {
    return getNativePosition(options);
  }
  return getBrowserPosition(options);
}

/**
 * Fresh high-accuracy fix for clock-in. Avoids stale cached positions and
 * briefly samples to prefer the most accurate reading.
 */
export async function getClockInPositionCoords(): Promise<ClockInCoords> {
  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 25_000,
    maximumAge: 0,
  };

  const samples: ClockInCoords[] = [];
  const first = await getCurrentPositionCoords(options);
  samples.push(first);

  // Take up to two quick follow-up reads; GPS often improves after the first fix.
  for (let i = 0; i < 2; i++) {
    await sleep(700);
    try {
      const next = await getCurrentPositionCoords({
        ...options,
        timeout: 8_000,
        maximumAge: 0,
      });
      samples.push(next);
      if (
        next.accuracyMeters != null &&
        next.accuracyMeters > 0 &&
        next.accuracyMeters <= 35
      ) {
        break;
      }
    } catch {
      break;
    }
  }

  return pickBestCoords(samples);
}

/**
 * Continuous GPS updates while the app is in the foreground.
 * Caller must `clear()` the returned handle (e.g. on unmount / clock-out).
 */
export async function watchPositionCoords(
  onUpdate: (coords: ClockInCoords) => void,
  onError?: (err: Error) => void,
  options?: PositionOptions,
): Promise<PositionWatchHandle> {
  if (Capacitor.isNativePlatform()) {
    return watchNativePosition(onUpdate, onError, options);
  }
  return watchBrowserPosition(onUpdate, onError, options);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickBestCoords(samples: ClockInCoords[]): ClockInCoords {
  if (samples.length === 0) {
    throw new Error("Could not determine your location. Please try again.");
  }
  return samples.reduce((best, cur) => {
    const bestAcc = best.accuracyMeters ?? Number.POSITIVE_INFINITY;
    const curAcc = cur.accuracyMeters ?? Number.POSITIVE_INFINITY;
    return curAcc < bestAcc ? cur : best;
  });
}

async function ensureNativeLocationPermission() {
  const current = await Geolocation.checkPermissions();
  // Fine location only — coarse network location is too inaccurate for office radii.
  if (current.location === "granted") return;

  const requested = await Geolocation.requestPermissions();
  if (requested.location !== "granted") {
    throw permissionDeniedError();
  }
}

async function getNativePosition(
  options?: PositionOptions,
): Promise<ClockInCoords> {
  try {
    await ensureNativeLocationPermission();

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 20_000,
      maximumAge: options?.maximumAge ?? 0,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters:
        typeof position.coords.accuracy === "number"
          ? position.coords.accuracy
          : undefined,
    };
  } catch (err) {
    throw mapNativeLocationError(err);
  }
}

async function watchNativePosition(
  onUpdate: (coords: ClockInCoords) => void,
  onError?: (err: Error) => void,
  options?: PositionOptions,
): Promise<PositionWatchHandle> {
  await ensureNativeLocationPermission();

  const id = await Geolocation.watchPosition(
    {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 20_000,
      maximumAge: options?.maximumAge ?? 5_000,
    },
    (position, err) => {
      if (err) {
        onError?.(mapNativeLocationError(err));
        return;
      }
      if (!position) return;
      onUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters:
          typeof position.coords.accuracy === "number"
            ? position.coords.accuracy
            : undefined,
      });
    },
  );

  return {
    clear: async () => {
      await Geolocation.clearWatch({ id });
    },
  };
}

function mapNativeLocationError(err: unknown): Error {
  if (err instanceof Error && err.message.includes("Location permission")) {
    return err;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (
    message.includes("denied") ||
    message.includes("permission") ||
    message.includes("not authorized")
  ) {
    return permissionDeniedError();
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return new Error("Timed out reading your location. Please try again.");
  }
  return new Error(
    "Could not determine your location. Turn on GPS, move to an open area, and try again.",
  );
}

function getBrowserPosition(options?: PositionOptions): Promise<ClockInCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(unavailableError());
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : undefined,
        });
      },
      (err) => {
        reject(mapBrowserGeoError(err));
      },
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
        ...options,
      },
    );
  });
}

function watchBrowserPosition(
  onUpdate: (coords: ClockInCoords) => void,
  onError?: (err: Error) => void,
  options?: PositionOptions,
): PositionWatchHandle {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw unavailableError();
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters:
          typeof pos.coords.accuracy === "number"
            ? pos.coords.accuracy
            : undefined,
      });
    },
    (err) => {
      onError?.(mapBrowserGeoError(err));
    },
    {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 5_000,
      ...options,
    },
  );

  return {
    clear: async () => {
      navigator.geolocation.clearWatch(id);
    },
  };
}

function mapBrowserGeoError(err: GeolocationPositionError): Error {
  if (err.code === err.PERMISSION_DENIED) {
    return permissionDeniedError();
  }
  if (err.code === err.TIMEOUT) {
    return new Error("Timed out reading your location. Please try again.");
  }
  return new Error(
    "Could not determine your location. Move to an open area and try again.",
  );
}
