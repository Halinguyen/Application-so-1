import fs from "node:fs/promises";
import path from "node:path";
import { runDetection } from "./run";
import { readCloneSchema } from "./clone-schema";
import { injectEditIdsInDir } from "./edit-id";
import { installNextAdapter } from "./ve-adapter-next";
import { installViteAdapter } from "./ve-adapter-vite";
import { buildCss, readLayout, writeManifest, writeRoutes, writeSlots } from "./layout-store";
import { discoverRoutes } from "./routes";
import { buildCloneSlots } from "./clone-slots";
import type { LayoutConflicts } from "./layout-schema";

export interface VisualEditingResult {
  framework: string;
  editable: number;
  skipped: number;
  conflicts: LayoutConflicts;
  installed: boolean;
  note?: string;
}

/** The template's identity as recorded when it was frozen (undefined for a live, never-frozen template). */
export function templateHash(gameId: string): string | undefined {
  return readCloneSchema(gameId)?.templateRef.contentHash;
}

/**
 * Applies visual editing to a freshly built clone: tag editable elements, compile
 * the saved layout into CSS, and (editor mode) install the inspector.
 * Runs only when there is a saved layout or the operator opened the editor, so a
 * plain clone stays byte-identical to before. Only the Next.js adapter exists so far.
 */
export async function applyVisualEditing(
  cloneDir: string,
  repoPath: string,
  gameId: string,
  editorOrigin: string | null
): Promise<VisualEditingResult | null> {
  const saved = await readLayout(repoPath);
  // An empty layout (everything was reset) is the same as none: a plain clone must stay exactly as it was built.
  const hasLayout = !!saved && Object.keys(saved.elements).length > 0;
  if (!hasLayout && !editorOrigin) return null;

  const detection = await runDetection(gameId);
  const framework = detection.framework.framework;
  const empty: LayoutConflicts = { missing: [], templateChanged: false };
  if (framework !== "nextjs" && framework !== "vite-spa") {
    return {
      framework,
      editable: 0,
      skipped: 0,
      conflicts: empty,
      installed: false,
      note: `visual editing chưa hỗ trợ ${framework} (hiện có Next.js và Vite)`,
    };
  }

  const manifest = await injectEditIdsInDir(cloneDir, gameId, detection.references);
  await writeManifest(repoPath, manifest);
  // every page of the site and the files it draws: the editor opens any of them and knows where an element lives
  await writeRoutes(repoPath, await discoverRoutes(cloneDir, framework));
  // the asset slots, so the preview editor can offer "replace this picture" for exactly the files the wizard would
  await writeSlots(
    repoPath,
    buildCloneSlots(detection).slots.map((s) => ({ id: s.id, label: s.label, targetPaths: s.targetPaths, previewPath: s.previewPath, sizeLabel: s.sizeLabel }))
  );

  const { css, conflicts } = buildCss(saved, manifest, gameId, templateHash(gameId));
  const install = framework === "nextjs" ? await installNextAdapter(cloneDir, { editorOrigin, css }) : await installViteAdapter(cloneDir, { editorOrigin, css });
  return {
    framework,
    editable: manifest.entries.length,
    skipped: manifest.skipped.length,
    conflicts,
    installed: install.installed,
    note: install.reason,
  };
}

/** Rewrites only the CSS inside an existing clone (after a save / reset), without rebuilding it. */
export async function rewriteCloneCss(cloneDir: string, css: string): Promise<boolean> {
  const dir = path.join(cloneDir, "public", "ve");
  try {
    await fs.access(dir);
  } catch {
    return false;
  }
  await fs.writeFile(path.join(dir, "layout-overrides.css"), css);
  return true;
}
