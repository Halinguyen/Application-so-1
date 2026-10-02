import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { DetectionResult } from "./types";

// Temporary on-disk cache of detection results, one JSON per game under
// <web>/.cache/detect/. Valid while no file under the game's repo changed
// (fingerprint = path + size + mtime of every non-vendored file).
const CACHE_DIR = path.join(process.cwd(), ".cache", "detect");
const IGNORE = ["**/node_modules/**", "**/.next/**", "**/.git/**", "**/dist/**", "**/bin/**", "**/obj/**"];

async function fingerprint(repoPath: string): Promise<string> {
  const entries = await fg("**/*", { cwd: repoPath, ignore: IGNORE, stats: true, dot: true, onlyFiles: true });
  const lines = entries
    .map((e) => `${e.path}|${e.stats?.size}|${Math.floor(e.stats?.mtimeMs ?? 0)}`)
    .sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

export async function readCachedDetection(gameId: string, repoPath: string): Promise<DetectionResult | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(CACHE_DIR, `${gameId}.json`), "utf8"));
    if (raw.fingerprint !== (await fingerprint(repoPath))) return null;
    return raw.result as DetectionResult;
  } catch {
    return null;
  }
}

export async function writeCachedDetection(gameId: string, repoPath: string, result: DetectionResult): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(CACHE_DIR, `${gameId}.json`),
      JSON.stringify({ fingerprint: await fingerprint(repoPath), result })
    );
  } catch {
    // cache is best-effort — a write failure must never break detection.
  }
}
