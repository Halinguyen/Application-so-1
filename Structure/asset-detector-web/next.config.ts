import os from "node:os";
import type { NextConfig } from "next";

// Development only (`next dev`): the addresses this machine can be reached at. Opening the tool from ANOTHER computer (http://<this
// machine's IP>:3100) is a cross-origin request for Next's dev resources, which it blocks by default: the HMR WebSocket fails, the page
// never hydrates and a click on a game does nothing. Every IPv4 address (and the host name) of this machine is therefore allowed.
function thisMachine(): string[] {
  const out = new Set<string>([os.hostname()]);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const nic of list ?? []) if (nic.family === "IPv4" && !nic.internal) out.add(nic.address);
  }
  return [...out];
}

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
  allowedDevOrigins: [
    ...thisMachine(),
    ...(process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((h) => h.trim()).filter(Boolean) : ["10.58.59.156"]),
  ],
};

export default nextConfig;
