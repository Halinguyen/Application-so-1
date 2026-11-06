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
  const layoutRel = LAYOUT_CANDIDATES.find((f) => existsSync(path.join(cloneDir, f)));
  if (!layoutRel) return { installed: false, reason: "root layout (app/layout.tsx) not found — not an App Router project" };

  await writeVeFiles(cloneDir, opts);
  const abs = path.join(cloneDir, layoutRel);
  const patched = patchHeadSource(await fs.readFile(abs, "utf-8"), !!opts.editorOrigin);
  if (patched === null) return { installed: false, reason: "no <head> or <body> found in the root layout" };
  await fs.writeFile(abs, patched);
  return { installed: true, layoutFile: layoutRel };
}
