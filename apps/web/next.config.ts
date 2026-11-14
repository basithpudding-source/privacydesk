import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

// Security headers on every response (slice 7). The content security policy allows only
// this origin, the Supabase project and inline styles/scripts Next itself emits; 'unsafe-eval'
// is added in development only, for React's refresh runtime.
//
// Two Microsoft addresses are allowed for requests from the browser, and nothing else of
// theirs: the sign-in service and the mail API, used when a person connects their own mailbox
// (src/lib/mailbox). No Microsoft script is loaded and no Microsoft page is framed.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com https://graph.microsoft.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

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
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Microsoft's sign-in pop-up comes back here with a one-time code in the address.
      { source: "/mailbox-redirect", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
