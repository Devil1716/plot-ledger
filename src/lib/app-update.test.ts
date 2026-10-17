import { describe, expect, it } from "vitest";
import { compareVersions, parseManifest, parseVersion, planUpdate } from "./app-update";

const sha = "a".repeat(64);
const raw = {
  version: "v1.3.1",
  nativeBuild: 105,
  bundle: { url: "https://github.com/Devil1716/plot-ledger/releases/download/v1.3.1/plot-ledger-web.zip", sha256: sha.toUpperCase() },
  apk: { url: "https://github.com/Devil1716/plot-ledger/releases/download/v1.3.1/plot-ledger.apk", sha256: sha, size: 1234 },
};

describe("app update", () => {
  it("parses and compares versions numerically", () => {
    expect(parseVersion("v1.10.2")).toEqual([1, 10, 2]);
    expect(parseVersion("latest")).toBeNull();
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.1.0", "1.1.0")).toBe(0);
  });

  it("accepts a well-formed manifest and normalises it", () => {
    expect(parseManifest(raw)).toMatchObject({ version: "1.3.1", nativeBuild: 105, bundle: { sha256: sha }, apk: { size: 1234 } });
  });

  it("rejects manifests without checksums, from other hosts or with bad builds", () => {
    expect(parseManifest({ ...raw, bundle: { url: raw.bundle.url } })).toBeNull();
    expect(parseManifest({ ...raw, apk: { ...raw.apk, url: "https://evil.example/app.apk" } })).toBeNull();
    expect(parseManifest({ ...raw, bundle: { ...raw.bundle, url: "http://github.com/x.zip" } })).toBeNull();
    expect(parseManifest({ ...raw, nativeBuild: "105" })).toBeNull();
    expect(parseManifest({ ...raw, version: "latest" })).toBeNull();
    expect(parseManifest(null)).toBeNull();
  });

  it("uses OTA for web-only changes and the APK for native changes", () => {
    const manifest = parseManifest(raw);
    expect(planUpdate(manifest, { nativeBuild: 105, bundleVersion: "1.3.0" })).toMatchObject({ kind: "ota", version: "1.3.1" });
    expect(planUpdate(manifest, { nativeBuild: 104, bundleVersion: "1.2.0" })).toMatchObject({ kind: "apk", nativeBuild: 105 });
    // already current, or installed native is newer than the release: nothing
    expect(planUpdate(manifest, { nativeBuild: 105, bundleVersion: "1.3.1" })).toEqual({ kind: "none" });
    expect(planUpdate(manifest, { nativeBuild: 106, bundleVersion: "1.2.0" })).toEqual({ kind: "none" });
    expect(planUpdate(null, { nativeBuild: 105, bundleVersion: "1.0.0" })).toEqual({ kind: "none" });
  });
});
