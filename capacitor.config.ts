import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aumento.tracker",
  appName: "Aumento Tracker",
  webDir: "dist/public",
  server: {
    // Load the live app so session cookies / auth work out of the box.
    // Remove `url` later to ship a fully offline-bundled WebView build.
    url: "https://tracking-crm.fly.dev",
    cleartext: false,
    allowNavigation: ["tracking-crm.fly.dev", "*.fly.dev"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0EA5E9",
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
