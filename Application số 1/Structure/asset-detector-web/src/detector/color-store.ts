import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { isHexColor, normalizeHex, replaceHex, scanColors } from "./color-scan";

/**
 * Colours changed from the preview editor. Kept next to the template (like uploads and layout) so every
 * "Generate clone" applies them again; the clone's own source files are rewritten as plain text.
 * Key = the colour as the TEMPLATE has it (#rrggbb), so changing it twice never stacks.
 */
export interface ColorChange {
  literals: string[];
  files: string[];
  to: string;
}
export type ColorChanges = Record<string, ColorChange>;

const storeFile = (repoPath: string) => path.join(path.dirname(repoPath), "home-page-colors.json");

export async function readColorChanges(repoPath: string): Promise<ColorChanges> {
  try {
    return JSON.parse(await fs.readFile(storeFile(repoPath), "utf-8"));
  } catch {
    return {};
  }
}

async function writeColorChanges(repoPath: string, changes: ColorChanges): Promise<void> {
  if (Object.keys(changes).length === 0) {
    await fs.rm(storeFile(repoPath), { force: true });
    return;
  }
  await fs.writeFile(storeFile(repoPath), JSON.stringify(changes, null, 2));
}

async function rewrite(cloneDir: string, files: string[], from: string[], to: string): Promise<number> {
  let replaced = 0;
  for (const f of files) {
    if (!f.startsWith("src/") || f.includes("..")) continue;
    const abs = path.join(cloneDir, f);
    if (!existsSync(abs)) continue;
    const r = replaceHex(await fs.readFile(abs, "utf-8"), from, to);
    if (r.replaced > 0) {
      await fs.writeFile(abs, r.text);
      replaced += r.replaced;
    }
  }
  return replaced;
}

export type ApplyResult = { ok: true; hex: string; to: string; replaced: number } | { ok: false; error: string };

/**
 * Changes one colour in the CLONE. `picked` is what the browser showed (#rrggbb): either a colour of the template or one
 * that was already changed (then it maps back to its template colour).
 */
export async function changeColor(repoPath: string, cloneDir: string, picked: string, to: string): Promise<ApplyResult> {
  if (!isHexColor(picked) || !isHexColor(to)) return { ok: false, error: "Mã màu phải có dạng #rrggbb." };
  const target = to.toLowerCase();
  const changes = await readColorChanges(repoPath);
  const p = normalizeHex(picked);
  let key = Object.keys(changes).find((k) => changes[k].to.toLowerCase() === p) ?? null;
  let current: string[];
  let files: string[];
  let literals: string[];
  if (key) {
    current = [changes[key].to];
    files = changes[key].files;
    literals = changes[key].literals;
  } else {
    const slot = (await scanColors(repoPath)).find((c) => c.hex === p);
    if (!slot) return { ok: false, error: `Màu ${p} không có dưới dạng mã hex trong mã nguồn (có thể là class Tailwind hoặc rgba) nên chưa đổi được ở đây.` };
    key = slot.hex;
    current = slot.literals;
    files = slot.files;
    literals = slot.literals;
  }
  const replaced = await rewrite(cloneDir, files, current, target);
  changes[key] = { literals, files, to: target };
  if (normalizeHex(target) === key) delete changes[key]; // typed the original back: nothing left to remember
  await writeColorChanges(repoPath, changes);
  return { ok: true, hex: key, to: target, replaced };
}

/** Puts every changed colour back in the clone and forgets them. */
export async function revertColors(repoPath: string, cloneDir: string): Promise<number> {
  const changes = await readColorChanges(repoPath);
  let n = 0;
  for (const c of Object.values(changes)) n += await rewrite(cloneDir, c.files, [c.to], c.literals[0]);
  await writeColorChanges(repoPath, {});
  return n;
}

/** After a fresh copy of the template: apply the colours the operator changed earlier. */
export async function applyPersistedColors(repoPath: string, cloneDir: string): Promise<number> {
  const changes = await readColorChanges(repoPath);
  let n = 0;
  for (const c of Object.values(changes)) n += await rewrite(cloneDir, c.files, c.literals, c.to);
  return n;
}
