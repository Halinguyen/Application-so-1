import fs from "node:fs/promises";
import path from "node:path";

/**
 * Pictures the page lays out by their OWN proportion: an <img> that is as wide as its container (w-full) with no fixed
 * height, in the normal flow. The height follows the file, so the file may keep the proportion of the picture the operator
 * uploaded (no crop, no padding): the whole picture shows. A picture in a fixed box (w-24 h-24, absolute, object-cover...)
 * keeps being cut/padded to the exact size of the original file.
 */

/** The class tokens of the <img> that draws the asset at `line` (1-based), or null when no <img> is found around it. */
export function classesAround(source: string, line: number): string[] | null {
  const lines = source.split(/\r?\n/);
  const from = Math.max(0, line - 12);
  const to = Math.min(lines.length, line + 12);
  const windowText = lines.slice(from, to).join("\n");
  // character offset of the reference line inside the window
  const refOffset = lines.slice(from, line - 1).join("\n").length + (line - 1 > from ? 1 : 0);
  const chunks = [...windowText.matchAll(/<img\b[\s\S]*?\/>/g)];
  if (chunks.length === 0) return null;
  // the <img> that contains the reference, else the nearest one after it (a <source> comes before its <img>), else the last before it
  const containing = chunks.find((m) => (m.index ?? 0) <= refOffset && refOffset <= (m.index ?? 0) + m[0].length);
  const after = chunks.find((m) => (m.index ?? 0) >= refOffset);
  const chunk = containing ?? after ?? chunks[chunks.length - 1];
  const cls = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/.exec(chunk[0]);
  const text = cls ? (cls[1] ?? cls[2] ?? cls[3] ?? cls[4] ?? cls[5] ?? "") : "";
  return text.replace(/\$\{[^}]*\}/g, " ").split(/\s+/).filter(Boolean);
}

/** w-full, no height, not positioned, not a cover/aspect box. */
export function followsItsOwnProportion(classes: string[]): boolean {
  const bare = classes.map((c) => c.replace(/^(sm|md|lg|xl|2xl|max-md|max-lg):/, ""));
  if (!bare.includes("w-full")) return false;
  return !bare.some((c) => /^(h-|min-h-|max-h-|size-|aspect-|object-cover$|absolute$|fixed$)/.test(c));
}

export interface RefHint {
  file: string;
  line: number;
}

/** Ids of the slots whose every reference is such a picture (the file may then keep the upload's proportion). */
export async function keepRatioSlotIds(repoPath: string, slots: { id: string; references: RefHint[] }[]): Promise<Set<string>> {
  const cache = new Map<string, string>();
  const out = new Set<string>();
  for (const slot of slots) {
    const refs = slot.references.filter((r) => /\.(tsx|jsx)$/.test(r.file));
    if (refs.length === 0) continue;
    let all = true;
    for (const r of refs) {
      let text = cache.get(r.file);
      if (text === undefined) {
        text = await fs.readFile(path.join(repoPath, r.file), "utf-8").catch(() => "");
        cache.set(r.file, text);
      }
      const classes = classesAround(text, r.line);
      if (!classes || !followsItsOwnProportion(classes)) {
        all = false;
        break;
      }
    }
    if (all) out.add(slot.id);
  }
  return out;
}
