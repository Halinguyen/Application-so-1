import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the dev server via the LAN address (otherwise Next blocks
  // its dev JS and the page never hydrates — buttons do nothing).
  allowedDevOrigins: ["10.58.59.156"],
};

export default nextConfig;
