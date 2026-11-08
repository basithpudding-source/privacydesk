import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off for now: every page is per-user, so there is nothing to
  // prerender yet, and with it on each session read needs its own Suspense boundary.
  // See docs/DECISIONS.md (8 November 2026).
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
