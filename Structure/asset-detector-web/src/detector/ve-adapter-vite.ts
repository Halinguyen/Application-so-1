import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { patchHeadSource, writeVeFiles, type InstallResult } from "./ve-install";

/**
 * Vite adapter. Vite serves public/ at the site root and index.html is the one page, so the
 * override stylesheet and the inspector scripts go into the clone's index.html. The template is
 * never touched.
 */
export async function installViteAdapter(cloneDir: string, opts: { editorOrigin: string | null; css: string }): Promise<InstallResult> {
  const htmlRel = "index.html";
  if (!existsSync(path.join(cloneDir, htmlRel))) return { installed: false, reason: "index.html not found — not a Vite project" };

  await writeVeFiles(cloneDir, opts);
  const abs = path.join(cloneDir, htmlRel);
  const patched = patchHeadSource(await fs.readFile(abs, "utf-8"), !!opts.editorOrigin);
  if (patched === null) return { installed: false, reason: "no <head> or <body> found in index.html" };
  await fs.writeFile(abs, patched);
  return { installed: true, layoutFile: htmlRel };
}
