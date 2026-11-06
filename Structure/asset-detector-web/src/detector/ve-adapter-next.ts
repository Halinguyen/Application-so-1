import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { patchHeadSource, writeVeFiles, type InstallResult } from "./ve-install";

/** Where the Next.js root layout can be (App Router, with or without src/). */
const LAYOUT_CANDIDATES = ["src/app/layout.tsx", "src/app/layout.jsx", "app/layout.tsx", "app/layout.jsx"];

/** Kept for callers/tests that used the Next-specific name. */
export const patchLayoutSource = patchHeadSource;

/**
 * Next.js adapter. Copies the inspector files into the CLONE's public/ve/, writes config.js and the
 * overrides CSS, and patches the clone's root layout. The template is never touched.
 */
export async function installNextAdapter(cloneDir: string, opts: { editorOrigin: string | null; css: string }): Promise<InstallResult> {
  const layouts = await findRootLayouts(cloneDir);
  if (layouts.length === 0) return { installed: false, reason: "root layout (app/layout.tsx) not found — not an App Router project" };

  await writeVeFiles(cloneDir, opts);
  const patchedFiles: string[] = [];
  for (const layoutRel of layouts) {
    const abs = path.join(cloneDir, layoutRel);
    const patched = patchHeadSource(await fs.readFile(abs, "utf-8"), !!opts.editorOrigin);
    if (patched === null) continue;
    await fs.writeFile(abs, patched);
    patchedFiles.push(layoutRel);
  }
  if (patchedFiles.length === 0) return { installed: false, reason: "no <head> or <body> found in the root layout" };
  return { installed: true, layoutFile: patchedFiles.join(", ") };
}

/**
 * Root layouts: app/layout.tsx, or — with "multiple root layouts" — every app/(group)/layout.tsx that
 * renders its own <html> (ta-la-hac-ngokhong has (site) and (landing)). Nested layouts without <html>
 * are skipped: the stylesheet belongs in the document head once.
 */
async function findRootLayouts(cloneDir: string): Promise<string[]> {
  const direct = LAYOUT_CANDIDATES.find((f) => existsSync(path.join(cloneDir, f)));
  if (direct) return [direct];
  const found: string[] = [];
  for (const appDir of ["src/app", "app"]) {
    const abs = path.join(cloneDir, appDir);
    if (!existsSync(abs)) continue;
    for (const entry of await fs.readdir(abs, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\(.+\)$/.test(entry.name)) continue;
      for (const ext of ["tsx", "jsx"]) {
        const rel = `${appDir}/${entry.name}/layout.${ext}`;
        if (existsSync(path.join(cloneDir, rel)) && /<html[\s>]/i.test(await fs.readFile(path.join(cloneDir, rel), "utf-8"))) found.push(rel);
      }
    }
  }
  return found;
}
