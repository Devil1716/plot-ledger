"use client";

import { AnimatePresence, motion } from "motion/react";
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Thin banner under the status bar while the device has no connection. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <AnimatePresence>
      {online ? null : (
        <motion.div
          role="status"
          data-testid="offline-banner"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-[var(--safe-top)] z-[70] flex justify-center px-4 pt-2"
        >
          <p className="flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-medium text-[#3b2a00] shadow-lg">
            <WifiOff className="size-4" aria-hidden />
            You&apos;re offline. Showing saved data; changes sync when you reconnect.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
