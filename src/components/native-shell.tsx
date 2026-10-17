"use client";

import { useEffect } from "react";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNativeApp, nativePlatform } from "@/lib/native";

/** Fired on Android's back button / gesture. Call preventDefault() if you handled it (e.g. closed a sheet). */
export const NATIVE_BACK_EVENT = "plotledger:back";

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
    // hide the splash as soon as React has painted (auto-hide is the fallback)
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    });

    // Android back: let open sheets close first, then go back a page, and only
    // send the app to the background (never kill it) from the home screen.
    const back = App.addListener("backButton", ({ canGoBack }) => {
      const event = new Event(NATIVE_BACK_EVENT, { cancelable: true });
      if (!window.dispatchEvent(event)) return;
      // an open dialog / dropdown (base-ui) closes on Escape
      if (document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open], [role="menu"][data-open]')) {
        const target = document.activeElement ?? document.body;
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        return;
      }
      if (canGoBack && window.location.pathname.replace(/\/$/, "") !== "") window.history.back();
      else void App.minimizeApp();
    });

    // keep the focused field visible above the on-screen keyboard
    const willShow = Keyboard.addListener("keyboardWillShow", () => root.classList.add("keyboard-open"));
    const willHide = Keyboard.addListener("keyboardWillHide", () => root.classList.remove("keyboard-open"));
    const shown = Keyboard.addListener("keyboardDidShow", () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input, textarea, select")) {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      void back.then((handle) => handle.remove());
      void shown.then((handle) => handle.remove());
      void willShow.then((handle) => handle.remove());
      void willHide.then((handle) => handle.remove());
    };
  }, []);
  return null;
}
