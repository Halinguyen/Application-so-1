import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Driven at runtime (browser validation), never bundled.
  serverExternalPackages: ["playwright-core"],
  // Never copy runtime data into a function. (Game sources and snapshots live outside the project and, on Vercel, are not in git at
  // all; Turbopack refuses exclude globs that leave the project root, so they cannot be listed here.)
  outputFileTracingExcludes: {
    "*": ["./data/**"],
  },
  // Allow opening the dev server via the LAN address (otherwise Next blocks
  // its dev JS and the page never hydrates — buttons do nothing).
  // Development only (`next dev`): extra hosts allowed to open the dev server, comma separated in ALLOWED_DEV_ORIGINS.
  // Unset keeps the address this project has always used.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((h) => h.trim()).filter(Boolean)
    : ["10.58.59.156"],
};

export default nextConfig;
