"use client";

import { useEffect } from "react";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNativeApp, nativePlatform } from "@/lib/native";

/**
 * Native-only setup for the Capacitor shell. Renders nothing; in a normal
 * browser it returns immediately.
 */
export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add("native", `native-${nativePlatform()}`);
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => undefined);
    // the splash stays up (launchAutoHide: false) until React has painted
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
