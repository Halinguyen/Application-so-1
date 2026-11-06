import fs from "node:fs/promises";
import path from "node:path";

const MARKER = "data-ve-installed";

function tags(withInspector: boolean): string {
  const lines = [
    `<link id="__ve_css" ${MARKER}="1" data-base="/ve/layout-overrides.css" rel="stylesheet" href="/ve/layout-overrides.css" />`,
  ];
  if (withInspector) {
    for (const f of ["config.js", "mapper.js", "protocol.js", "inspector.js"]) {
      lines.push(`<script src="/ve/${f}" defer></script>`);
    }
  }
  return lines.join("");
}

/**
 * Pure patch of an HTML / root-layout source: puts the override stylesheet (and, in editor mode,
 * the inspector scripts) just before </head>, or right after the opening <body> when there is no
 * explicit <head>. Idempotent: a previous block is removed first. Returns null when neither exists.
 * Shared by the Next.js adapter (app/layout.tsx) and the Vite adapter (index.html).
 */
export function patchHeadSource(source: string, withInspector: boolean): string | null {
  const stripped = source.replace(new RegExp(`<link id="__ve_css"[^>]*/>(<script src="/ve/[^"]+" defer></script>)*`, "g"), "");
  const block = tags(withInspector);
  if (/<\/head>/i.test(stripped)) return stripped.replace(/<\/head>/i, `${block}</head>`);
  const body = /<body[^>]*>/i.exec(stripped);
  if (body) return stripped.replace(body[0], `${body[0]}${block}`);
  return null;
}

/**
 * Writes public/ve/ in the CLONE: the overrides CSS always; in editor mode also the inspector files
 * and config.js (the one origin allowed to talk to the inspector).
 */
export async function writeVeFiles(cloneDir: string, opts: { editorOrigin: string | null; css: string }): Promise<void> {
  const veDir = path.join(cloneDir, "public", "ve");
  await fs.mkdir(veDir, { recursive: true });
  await fs.writeFile(path.join(veDir, "layout-overrides.css"), opts.css);
  if (!opts.editorOrigin) return;
  const srcDir = path.join(process.cwd(), "public", "ve");
  for (const f of ["mapper.js", "protocol.js", "inspector.js"]) {
    await fs.copyFile(path.join(srcDir, f), path.join(veDir, f));
  }
  await fs.writeFile(path.join(veDir, "config.js"), `window.__VE_CONFIG__ = ${JSON.stringify({ editorOrigin: opts.editorOrigin })};\n`);
}

export interface InstallResult {
  installed: boolean;
  reason?: string;
  layoutFile?: string;
}
