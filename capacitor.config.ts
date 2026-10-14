import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.team.aaso.tech",
  appName: "Aaso",
  webDir: "dist/public",
  server: {
    // Load the live app so session cookies / auth work out of the box.
    // Remove `url` later to ship a fully offline-bundled WebView build.
    url: "https://team.aaso.tech",
    cleartext: false,
    allowNavigation: ["team.aaso.tech"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0EA5E9",
  },
  ios: {
    // When the iOS project is generated (`npx cap add ios`), ensure Info.plist includes:
    // NSLocationWhenInUseUsageDescription — shown when requesting location for clock-in.
    scheme: "Aaso",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0EA5E9",
      showSpinner: false,
    },
  },
};

export default config;
