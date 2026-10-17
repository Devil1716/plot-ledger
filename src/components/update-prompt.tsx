"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, ShieldCheck, X } from "lucide-react";
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { nativePlatform } from "@/lib/native";
import { BUNDLE_VERSION, MANIFEST_URL, parseManifest, planUpdate, type UpdatePlan } from "@/lib/app-update";
import { ApkUpdater } from "@/lib/apk-updater";
import { toast } from "sonner";

type ApkState =
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; path: string }
  | { phase: "needs-permission"; path: string }
  | { phase: "failed"; message: string };

const CHECK_GAP_MS = 10 * 60 * 1000;
const SEEN_KEY = "plotledger:last-version";

/** After an update (OTA or APK) lands, say so once. */
function announceNewVersion(runningOtaBundle: boolean) {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, BUNDLE_VERSION);
    if (seen ? seen !== BUNDLE_VERSION : runningOtaBundle) {
      toast.success(`Updated to v${BUNDLE_VERSION}`, { description: "Installed automatically.", duration: 5000 });
    }
  } catch {
    // storage unavailable
  }
}

async function fetchManifest() {
  // native HTTP: no CORS, follows GitHub's redirect to the asset CDN
  const response = await CapacitorHttp.get({
    url: `${MANIFEST_URL}?t=${Date.now()}`,
    headers: { Accept: "application/json" },
    responseType: "json",
  });
  if (response.status !== 200) return null;
  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  return parseManifest(data);
}

/**
 * Android app only. On launch / resume:
 *  - tells the OTA updater this bundle booted (otherwise it rolls back to the previous one),
 *  - reads the latest release's update.json,
 *  - web-only update: downloads the bundle silently; it applies the next time the app starts,
 *  - native update: downloads the APK with progress and opens Android's installer.
 */
export function UpdatePrompt() {
  const [apkPlan, setApkPlan] = useState<Extract<UpdatePlan, { kind: "apk" }> | null>(null);
  const [apk, setApk] = useState<ApkState | null>(null);
  const [hidden, setHidden] = useState(false);
  const busy = useRef(false);
  const lastCheck = useRef(0);

  const openInstaller = useCallback(async (path: string) => {
    const { allowed } = await ApkUpdater.canInstall();
    if (!allowed) {
      setApk({ phase: "needs-permission", path });
      return;
    }
    setApk({ phase: "ready", path });
    await ApkUpdater.install({ path });
  }, []);

  const downloadApk = useCallback(
    async (plan: Extract<UpdatePlan, { kind: "apk" }>) => {
      setApk({ phase: "downloading", percent: 0 });
      const listener = await ApkUpdater.addListener("progress", ({ percent }) =>
        setApk((current) => (current?.phase === "downloading" ? { phase: "downloading", percent: Math.max(0, percent) } : current)),
      );
      try {
        const { path } = await ApkUpdater.download({ url: plan.apk.url, sha256: plan.apk.sha256, version: plan.version });
        await openInstaller(path);
      } catch (error) {
        setApk({ phase: "failed", message: error instanceof Error ? error.message : "Download failed" });
      } finally {
        void listener.remove();
      }
    },
    [openInstaller],
  );

  useEffect(() => {
    if (nativePlatform() !== "android") return;
    let cancelled = false;

    const check = async () => {
      if (busy.current || Date.now() - lastCheck.current < CHECK_GAP_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const [info, manifest] = await Promise.all([App.getInfo(), fetchManifest()]);
        const plan = planUpdate(manifest, { nativeBuild: Number(info.build) || 0, bundleVersion: BUNDLE_VERSION });
        if (cancelled) return;
        if (plan.kind === "apk") {
          setApkPlan(plan);
          setHidden(false);
          void downloadApk(plan);
        } else if (plan.kind === "ota") {
          // already downloaded (e.g. last launch)? just make sure it's queued
          const { bundles } = await CapacitorUpdater.list();
          const existing = bundles.find((bundle) => bundle.version === plan.version && bundle.status !== "error");
          const bundle =
            existing ??
            (await CapacitorUpdater.download({ url: plan.bundle.url, version: plan.version, checksum: plan.bundle.sha256 }));
          await CapacitorUpdater.next({ id: bundle.id });
        }
      } catch {
        // offline / GitHub hiccup: try again next launch
      } finally {
        busy.current = false;
      }
    };

    void (async () => {
      let runningOta = false;
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        // React rendered, so this bundle is healthy: keep it.
        const ready = await CapacitorUpdater.notifyAppReady();
        runningOta = ready.bundle.id !== "builtin";
      } catch {
        // plugin missing in an old shell: nothing to confirm
      }
      announceNewVersion(runningOta);
      void check();
    })();
    const listener = App.addListener("resume", () => void check());
    return () => {
      cancelled = true;
      void listener.then((handle) => handle.remove());
    };
  }, [downloadApk]);

  const show = apkPlan !== null && apk !== null && !hidden;

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          role="dialog"
          aria-label="App update"
          data-testid="update-prompt"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-bottom))] z-[65] flex justify-center px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-3 pl-4 text-[#0f1524] shadow-[0_8px_24px_rgb(0_0_0/0.35)] ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Plot Ledger v{apkPlan.version}</p>
                <p className="text-xs text-[#5a6478]">
                  {apk.phase === "downloading"
                    ? `Downloading the update… ${apk.percent}%`
                    : apk.phase === "ready"
                      ? "Downloaded and verified. Tap Install on Android's prompt."
                      : apk.phase === "needs-permission"
                        ? "Android needs a one-time OK to install updates from Plot Ledger."
                        : apk.message}
                </p>
              </div>
              {apk.phase === "ready" ? (
                <button
                  type="button"
                  onClick={() => void openInstaller(apk.path)}
                  className="flex h-11 items-center gap-1.5 rounded-full bg-[#0b0f1a] px-4 text-sm font-semibold text-white"
                >
                  <Download className="size-4" aria-hidden />
                  Install
                </button>
              ) : apk.phase === "needs-permission" ? (
                <button
                  type="button"
                  onClick={() => {
                    void ApkUpdater.openInstallSettings();
                    const handle = App.addListener("resume", () => {
                      void handle.then((h) => h.remove());
                      void openInstaller(apk.path);
                    });
                  }}
                  className="flex h-11 items-center gap-1.5 rounded-full bg-[#0b0f1a] px-4 text-sm font-semibold text-white"
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  Allow
                </button>
              ) : apk.phase === "failed" ? (
                <button
                  type="button"
                  onClick={() => void downloadApk(apkPlan)}
                  className="flex h-11 items-center rounded-full bg-[#0b0f1a] px-4 text-sm font-semibold text-white"
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setHidden(true)}
                aria-label="Hide"
                className="grid size-11 place-items-center rounded-full text-[#5a6478] hover:bg-[#eef0f4]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {apk.phase === "downloading" ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]" aria-hidden>
                <div
                  className="h-full origin-left rounded-full bg-[#34d399] transition-transform duration-150"
                  style={{ transform: `scaleX(${apk.percent / 100})` }}
                />
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
