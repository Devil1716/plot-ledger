/** In-app update check against the repo's latest GitHub release (Android only). */

export const UPDATE_REPO = process.env.NEXT_PUBLIC_UPDATE_REPO || "Devil1716/plot-ledger";

export interface ReleaseInfo {
  version: string;
  name: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
}

interface GithubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
}

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

export function releaseFromGithub(data: GithubRelease): ReleaseInfo | null {
  if (!data || data.draft || data.prerelease || !parseVersion(data.tag_name)) return null;
  const apk = (data.assets ?? []).find((asset) => asset.name?.toLowerCase().endsWith(".apk") && asset.browser_download_url);
  if (!apk?.browser_download_url) return null;
  return {
    version: (data.tag_name ?? "").replace(/^v/, ""),
    name: data.name || data.tag_name || "",
    notes: data.body ?? "",
    apkUrl: apk.browser_download_url,
    pageUrl: data.html_url ?? `https://github.com/${UPDATE_REPO}/releases/latest`,
  };
}

/** The newer release, or null when the installed version is current (or the check failed). */
export async function findUpdate(installedVersion: string, fetcher: typeof fetch = fetch): Promise<ReleaseInfo | null> {
  try {
    const response = await fetcher(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const release = releaseFromGithub((await response.json()) as GithubRelease);
    if (!release) return null;
    return compareVersions(release.version, installedVersion) > 0 ? release : null;
  } catch {
    return null;
  }
}
