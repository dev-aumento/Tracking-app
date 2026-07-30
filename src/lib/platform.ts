import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor Android/iOS shell — not in the browser web app. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
