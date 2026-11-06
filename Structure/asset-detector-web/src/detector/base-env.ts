import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Reads the real working dev env values documented in
 * deploy/develop/.env.example (falling back to deploy/production). This is
 * the source of truth for every VITE_APP_* var the app needs just to boot
 * (API base URLs, CDN prefix, login/OIDC) — none of it is committed as a
 * plain `.env`, only as this example file used at deploy time.
 */
export async function readBaseEnv(repoPath: string): Promise<Record<string, string>> {
  const candidates = [
    path.join(repoPath, "deploy", "develop", ".env.example"),
    path.join(repoPath, "deploy", "production", ".env.example"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = await fs.readFile(file, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  }
  return {};
}
