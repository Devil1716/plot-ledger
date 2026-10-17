import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Custom native plugin in android/app/src/main/java/.../ApkUpdaterPlugin.java. */
export interface ApkUpdaterPlugin {
  download(options: { url: string; sha256: string; version: string }): Promise<{ path: string; bytes: number }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(options: { path: string }): Promise<void>;
  addListener(
    event: "progress",
    listener: (progress: { bytes: number; total: number; percent: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>("ApkUpdater");
