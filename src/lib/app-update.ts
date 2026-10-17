/**
 * Over-the-air updates for the Android app.
 *
 * Every release publishes three assets: the APK, a zip of the web bundle (out/) and
 * update.json describing both. On launch the app reads update.json and decides:
 *  - manifest.nativeBuild > installed native build → native change: download the APK
 *    in the app and open Android's installer (the user taps "Install" once).
 *  - same native build, newer version → web-only change: download the bundle zip in the
 *    background (sha256-verified by @capgo/capacitor-updater) and apply it on the next
 *    launch. If that bundle never calls notifyAppReady() it is rolled back automatically.
 *  - otherwise nothing.
 */

export const UPDATE_REPO = process.env.NEXT_PUBLIC_UPDATE_REPO || "Devil1716/plot-ledger";
export const MANIFEST_URL = `https://github.com/${UPDATE_REPO}/releases/latest/download/update.json`;

/** Version of the web bundle that is running (baked at build time). */
export const BUNDLE_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
/** Native build the web bundle was built for (package.json nativeBuild). */
export const BUNDLE_NATIVE_BUILD = Number(process.env.NEXT_PUBLIC_NATIVE_BUILD || 0);

export interface UpdateAsset {
  url: string;
  sha256: string;
  size?: number;
}

export interface UpdateManifest {
  version: string;
  nativeBuild: number;
  bundle: UpdateAsset;
  apk: UpdateAsset;
  notes?: string;
}

export type UpdatePlan =
  | { kind: "none" }
  | { kind: "ota"; version: string; bundle: UpdateAsset }
  | { kind: "apk"; version: string; nativeBuild: number; apk: UpdateAsset };

/** "v1.2.3" / "1.2.3-beta" → [1, 2, 3]; null when it isn't a version. */
export function parseVersion(value: string | null | undefined): number[] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec((value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Positive when a > b, negative when a < b, 0 when equal or unparseable. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const SHA256 = /^[0-9a-f]{64}$/;
const TRUSTED_HOST = /^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//;

function asset(value: unknown): UpdateAsset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  const sha256 = typeof record.sha256 === "string" ? record.sha256.toLowerCase() : "";
  if (!TRUSTED_HOST.test(url) || !SHA256.test(sha256)) return null;
  const size = typeof record.size === "number" && record.size > 0 ? record.size : undefined;
  return { url, sha256, ...(size ? { size } : {}) };
}

/** Validates update.json; anything odd (wrong host, missing checksum) means "no update". */
export function parseManifest(data: unknown): UpdateManifest | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.replace(/^v/, "") : "";
  const nativeBuild = typeof record.nativeBuild === "number" ? record.nativeBuild : Number.NaN;
  const bundle = asset(record.bundle);
  const apk = asset(record.apk);
  if (!parseVersion(version) || !Number.isInteger(nativeBuild) || nativeBuild <= 0 || !bundle || !apk) return null;
  return { version, nativeBuild, bundle, apk, ...(typeof record.notes === "string" ? { notes: record.notes } : {}) };
}

export function planUpdate(
  manifest: UpdateManifest | null,
  installed: { nativeBuild: number; bundleVersion: string },
): UpdatePlan {
  if (!manifest) return { kind: "none" };
  if (manifest.nativeBuild > installed.nativeBuild) {
    return { kind: "apk", version: manifest.version, nativeBuild: manifest.nativeBuild, apk: manifest.apk };
  }
  // a bundle is only compatible with the native shell it was built for
  if (manifest.nativeBuild === installed.nativeBuild && compareVersions(manifest.version, installed.bundleVersion) > 0) {
    return { kind: "ota", version: manifest.version, bundle: manifest.bundle };
  }
  return { kind: "none" };
}
