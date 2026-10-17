import { describe, expect, it } from "vitest";
import { compareVersions, findUpdate, parseVersion, releaseFromGithub } from "./update-check";

const release = {
  tag_name: "v1.2.0",
  name: "Plot Ledger v1.2.0",
  body: "Notes",
  html_url: "https://github.com/Devil1716/plot-ledger/releases/tag/v1.2.0",
  assets: [
    { name: "checksums.txt", browser_download_url: "https://example.com/sums" },
    { name: "plot-ledger.apk", browser_download_url: "https://example.com/plot-ledger.apk" },
  ],
};

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe("update check", () => {
  it("parses and compares versions numerically", () => {
    expect(parseVersion("v1.10.2")).toEqual([1, 10, 2]);
    expect(parseVersion("1.2")).toEqual([1, 2, 0]);
    expect(parseVersion("latest")).toBeNull();
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("1.0.2", "1.1.0")).toBeLessThan(0);
  });

  it("picks the APK asset and skips drafts, prereleases and releases without an APK", () => {
    expect(releaseFromGithub(release)).toMatchObject({ version: "1.2.0", apkUrl: "https://example.com/plot-ledger.apk" });
    expect(releaseFromGithub({ ...release, prerelease: true })).toBeNull();
    expect(releaseFromGithub({ ...release, draft: true })).toBeNull();
    expect(releaseFromGithub({ ...release, assets: [] })).toBeNull();
  });

  it("offers an update only when the release is newer than the installed app", async () => {
    expect(await findUpdate("1.1.0", fakeFetch(release))).toMatchObject({ version: "1.2.0" });
    expect(await findUpdate("1.2.0", fakeFetch(release))).toBeNull();
    expect(await findUpdate("1.3.0", fakeFetch(release))).toBeNull();
    expect(await findUpdate("1.0.0", fakeFetch({}, false))).toBeNull();
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await findUpdate("1.0.0", failing)).toBeNull();
  });
});
