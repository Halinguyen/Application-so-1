import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { DynamicBlock } from "./types";

// "Video hero" convention (shared by every game, not per-gameId):
// a template that has a play-video button in its hero section reads the
// YouTube link from ONE env var whose name ends in HERO_VIDEO_URL
// (NEXT_PUBLIC_HERO_VIDEO_URL, VITE_APP_HERO_VIDEO_URL, ...) and renders the
// button only when it is set. The detector finds that variable in source; the
// wizard then asks the operator for the link and the clone writes it to .env.local
// like every other param. A template without the variable has no hero video and
// nothing is offered.
const ENV_READ = /(?:process\.env|import\.meta\.env)\.([A-Z0-9_]*HERO_VIDEO_URL)\b/g;
const IGNORE = ["**/node_modules/**", "**/.next/**", "**/.git/**", "**/dist/**", "**/bin/**", "**/obj/**"];

export async function layer2ScanHeroVideo(repoPath: string): Promise<{ dynamicBlocks: DynamicBlock[] }> {
  const files = await fg("src/**/*.{ts,tsx,js,jsx}", { cwd: repoPath, ignore: IGNORE, onlyFiles: true });
  const found = new Map<string, { file: string; line: number }>();
  for (const rel of files.sort()) {
    const content = await fs.readFile(path.join(repoPath, rel), "utf-8");
    for (const m of content.matchAll(ENV_READ)) {
      if (found.has(m[1])) continue;
      found.set(m[1], { file: rel, line: content.slice(0, m.index).split("\n").length });
    }
  }

  const dynamicBlocks: DynamicBlock[] = [...found].map(([envKey, at], i) => ({
    id: i === 0 ? "dynamic.hero-video" : `dynamic.hero-video-${i + 1}`,
    type: "hero-video",
    label: "Video hero (nút phát video)",
    section: "hero",
    source: `${at.file}:${at.line}`,
    apiEndpoint: "",
    params: [
      {
        name: "Link YouTube",
        envKey,
        type: "string",
        required: false,
        description: "Link video YouTube mở khi bấm nút phát ở hero; để trống thì ẩn nút.",
      },
    ],
    injectVia: "env-inject",
    confidence: 0.95,
    detectionMethod: "grep",
  }));
  return { dynamicBlocks };
}
