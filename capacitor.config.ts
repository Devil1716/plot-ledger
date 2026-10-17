import type { CapacitorConfig } from "@capacitor/cli";

// Talking to the local Firebase emulators (http://10.0.2.2 from the Android
// emulator) needs cleartext + mixed content, because the app itself is served
// from https://localhost. Builds for a real Firebase project set
// CAP_USE_EMULATORS=false so release apps stay HTTPS-only.
const emulators = (process.env.CAP_USE_EMULATORS ?? process.env.NEXT_PUBLIC_USE_EMULATORS ?? "true") === "true";

const config: CapacitorConfig = {
  appId: "com.devil1716.plotledger",
  appName: "Plot Ledger",
  webDir: "out",
  backgroundColor: "#0b0d10",
  server: {
    androidScheme: "https",
    ...(emulators ? { cleartext: true } : {}),
  },
  android: {
    allowMixedContent: emulators,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      backgroundColor: "#0b0d10",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    // Bundled with @capacitor/core 8: edge-to-edge status/navigation bars.
    // "css" also injects --safe-area-inset-* for Android WebViews < 140 whose
    // env(safe-area-inset-*) values are wrong; globals.css prefers those vars.
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DARK",
    },
  },
};

export default config;
