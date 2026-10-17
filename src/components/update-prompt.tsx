"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, X } from "lucide-react";
import { App } from "@capacitor/app";
import { nativePlatform } from "@/lib/native";
import { findUpdate, type ReleaseInfo } from "@/lib/update-check";

const DISMISS_KEY = "plotledger:update-dismissed";

/**
 * Android app only: on launch (and when the app comes back to the foreground),
 * ask GitHub for the latest release. If it is newer than the installed version,
 * offer the APK download. Publishing a release (tag v*) is all it takes.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    if (nativePlatform() !== "android") return;
    let cancelled = false;
    const check = async () => {
      try {
        const info = await App.getInfo();
        const found = await findUpdate(info.version);
        if (cancelled || !found) return;
        if (localStorage.getItem(DISMISS_KEY) === found.version) return;
        setUpdate(found);
      } catch {
        // no network / API limit: try again next launch
      }
    };
    void check();
    const listener = App.addListener("resume", () => void check());
    return () => {
      cancelled = true;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const dismiss = () => {
    if (update) localStorage.setItem(DISMISS_KEY, update.version);
    setUpdate(null);
  };

  return (
    <AnimatePresence>
      {update ? (
        <motion.div
          role="dialog"
          aria-label="Update available"
          data-testid="update-prompt"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-bottom))] z-[65] flex justify-center px-4"
        >
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-white p-3 pl-4 text-[#0f1524] shadow-[0_8px_24px_rgb(0_0_0/0.35)] ring-1 ring-black/5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Update available · v{update.version}</p>
              <p className="truncate text-xs text-[#5a6478]">Download and open the new APK to install it.</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.assign(update.apkUrl)}
              className="flex h-11 items-center gap-1.5 rounded-full bg-[#0b0f1a] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              <Download className="size-4" aria-hidden />
              Update
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Not now"
              className="grid size-11 place-items-center rounded-full text-[#5a6478] hover:bg-[#eef0f4]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
