import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/** True inside the iOS / Android Capacitor shell, false in a normal browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

export type HapticKind = "key" | "tick" | "confirm" | "success";

// Browser fallback patterns (ms). iOS Safari has no navigator.vibrate, which is
// why the native shell routes through @capacitor/haptics (Taptic Engine on iOS).
const WEB_PATTERNS: Record<HapticKind, number | number[]> = {
  key: 6,
  tick: 10,
  confirm: [18, 30, 24],
  success: [20, 40, 30],
};

/** Best-effort haptic feedback; never throws. */
export function haptic(kind: HapticKind): void {
  if (typeof window === "undefined") return;
  if (isNativeApp()) {
    const run =
      kind === "success"
        ? Haptics.notification({ type: NotificationType.Success })
        : kind === "confirm"
          ? Haptics.impact({ style: ImpactStyle.Medium })
          : kind === "tick"
            ? Haptics.selectionChanged()
            : Haptics.impact({ style: ImpactStyle.Light });
    void run.catch(() => undefined);
    return;
  }
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(WEB_PATTERNS[kind]);
    } catch {
      // vibration is best-effort
    }
  }
}

/**
 * Host for the Firebase emulators. Inside the Android emulator, 127.0.0.1 is
 * the device itself, so the dev machine is reached via 10.0.2.2 (override with
 * NEXT_PUBLIC_ANDROID_EMULATOR_HOST, e.g. your LAN IP for a phone on Wi-Fi).
 * The iOS simulator shares the Mac's loopback, so it keeps 127.0.0.1.
 */
export function emulatorHost(configured: string): string {
  const isLoopback = configured === "127.0.0.1" || configured === "localhost";
  if (isLoopback && typeof window !== "undefined" && nativePlatform() === "android") {
    return process.env.NEXT_PUBLIC_ANDROID_EMULATOR_HOST || "10.0.2.2";
  }
  return configured;
}
