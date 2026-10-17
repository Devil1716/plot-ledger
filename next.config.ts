import type { NextConfig } from "next";

// `pnpm build:native` sets NEXT_OUTPUT=export: a fully static bundle in out/ that
// Capacitor copies into the iOS/Android apps. The app is client-only (Firebase
// Auth + Firestore from the browser), so nothing needs a Node server.
const nativeExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(nativeExport
    ? {
        output: "export" as const,
        // out/history/index.html etc., which the native WebView servers resolve directly
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  // Cache Components / partial prefetching rely on PPR, which static export can't
  // use; the pages are all client components so the native bundle loses nothing.
  cacheComponents: !nativeExport,
  partialPrefetching: !nativeExport,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
