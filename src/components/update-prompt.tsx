"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, ShieldCheck, X } from "lucide-react";
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { nativePlatform } from "@/lib/native";
import { BUNDLE_NATIVE_BUILD, BUNDLE_VERSION, MANIFEST_URL, parseManifest, planUpdate, UPDATE_REPO, type UpdatePlan } from "@/lib/app-update";
import { ApkUpdater } from "@/lib/apk-updater";
import { toast } from "sonner";

type ApkState =
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; path: string }
  | { phase: "needs-permission"; path: string }
  | { phase: "failed"; message: string };

const CHECK_GAP_MS = 60 * 1000;
const SEEN_KEY = "plotledger:last-version";
let coldStartApplied = false;

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

export const UPDATE_STATUS_KEY = "plotledger:update-status";

function noteStatus(result: string) {
  // shows up in `adb logcat` as Capacitor/Console, so device behaviour can be checked
  console.info(`[ota] v${BUNDLE_VERSION} build ${BUNDLE_NATIVE_BUILD}: ${result}`);
  try {
    localStorage.setItem(UPDATE_STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), result }));
  } catch {
    // storage unavailable
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function getJson(url: string): Promise<unknown> {
  // native HTTP: no CORS, follows GitHub's redirect to the asset CDN
  const response = await withTimeout(
    CapacitorHttp.get({
      url,
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      responseType: "json",
      connectTimeout: 30000,
      readTimeout: 30000,
    }),
    60000,
    `timed out fetching ${url.split("?")[0]}`,
  );
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url.split("?")[0]}`);
  return typeof response.data === "string" ? JSON.parse(response.data) : response.data;
}

async function fetchManifest() {
  // Ask the releases API which release is latest, then read that release's update.json
  // by its versioned URL (the /latest/download redirect can lag behind a new release).
  try {
    const release = (await getJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`)) as {
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const asset = release.assets?.find((item) => item.name === "update.json")?.browser_download_url;
    if (asset) {
      const manifest = parseManifest(await getJson(`${asset}?t=${Date.now()}`));
      if (manifest) return manifest;
    }
  } catch {
    // API rate limit / offline: fall back to the redirect below
  }
  const manifest = parseManifest(await getJson(`${MANIFEST_URL}?t=${Date.now()}`));
  if (!manifest) throw new Error("update.json is not valid");
  return manifest;
}

/** Resolves once the user isn't mid-task: no open dialog / pay flow and no focused input. */
async function waitUntilIdle(stop: () => boolean): Promise<void> {
  const busyNow = () =>
    Boolean(
      // never on the sign-in page: a reload there could drop an in-flight Google sign-in
      /^\/login/.test(window.location.pathname) ||
        document.documentElement.dataset.signingIn === "1" ||
        document.querySelector('[data-testid="pay-flow"], [role="dialog"]:not([data-testid="update-prompt"]), [role="alertdialog"]') ||
        (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)),
    );
  let quietSince = busyNow() ? 0 : Date.now();
  while (!stop()) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (busyNow()) quietSince = 0;
    else if (!quietSince) quietSince = Date.now();
    else if (Date.now() - quietSince >= 1500) return;
  }
}

/**
 * Android app only. On launch / resume:
 *  - tells the OTA updater this bundle booted (otherwise it rolls back to the previous one),
 *  - reads the latest release's update.json,
 *  - web-only update: downloads the bundle silently and swaps it in as soon as the user is idle,
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
        noteStatus("checking…");
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const info = await withTimeout(App.getInfo(), 5000, "app info timed out");
        noteStatus("fetching update.json…");
        const manifest = await fetchManifest();
        const plan = planUpdate(manifest, { nativeBuild: Number(info.build) || 0, bundleVersion: BUNDLE_VERSION });
        noteStatus(
          plan.kind === "none"
            ? `up to date (latest ${manifest.version}, build ${manifest.nativeBuild}; this is ${BUNDLE_VERSION}, build ${info.build})`
            : `${plan.kind === "ota" ? "web update" : "app update"} ${plan.version} found`,
        );
        // keep going even if this component re-rendered: downloads are idempotent
        if (plan.kind === "apk") {
          if (cancelled) return;
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
          // Queuing it as "next" makes the updater swap bundles whenever the app is backgrounded,
          // and Google's account picker backgrounds the app: never queue it on the sign-in page.
          if (/^\/login/.test(window.location.pathname) || document.documentElement.dataset.signingIn === "1") {
            noteStatus(`web update ${plan.version} downloaded; waiting until after sign-in`);
            lastCheck.current = 0; // try again on the next resume
            return;
          }
          await CapacitorUpdater.next({ id: bundle.id });
          noteStatus(`web update ${plan.version} downloaded; applying`);
          // Don't wait for a background/relaunch (people rarely kill the app): swap the
          // bundle in now, as soon as nothing is open (no pay flow, dialog or typing).
          await waitUntilIdle(() => cancelled);
          if (!cancelled) {
            noteStatus(`applying web update ${plan.version} now`);
            await CapacitorUpdater.set({ id: bundle.id });
          }
        }
      } catch (error) {
        // offline / GitHub hiccup: try again next launch
        noteStatus(`check failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        busy.current = false;
      }
    };

    void (async () => {
      let runningOta = false;
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        // React rendered, so this bundle is healthy: keep it.
        noteStatus("starting…");
        const ready = await withTimeout(CapacitorUpdater.notifyAppReady(), 5000, "notifyAppReady timed out");
        runningOta = ready.bundle.id !== "builtin";
        noteStatus(`booted bundle ${ready.bundle.id} (${ready.bundle.version})`);
        // A bundle downloaded last time is normally swapped in when the app goes to the
        // background. If the app was killed instead, apply it now, on this cold start.
        const next = await withTimeout(CapacitorUpdater.getNextBundle(), 5000, "getNextBundle timed out");
        if (next && next.id !== ready.bundle.id && next.status !== "error" && !coldStartApplied) {
          coldStartApplied = true;
          noteStatus(`cold start: applying downloaded ${next.version}`);
          await CapacitorUpdater.set({ id: next.id });
          return;
        }
      } catch (error) {
        // plugin missing in an old shell: nothing to confirm
        noteStatus(`boot: ${error instanceof Error ? error.message : String(error)}`);
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
