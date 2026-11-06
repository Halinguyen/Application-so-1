import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Colours the operator can change by typing a hex code (2026-11-06): some areas (news, ranking, the mobile header) differ
 * from the template only by colour, with no picture to upload. They are found in the template's own source (CSS and TSX),
 * grouped by the block of the page that file draws, and replaced in the CLONE as plain text — nothing is compiled or guessed.
 */
export interface ColorSlot {
  /** normalised lower-case #rrggbb, the key */
  hex: string;
  /** every spelling found in the source ("#fff", "#FFFFFF"...) */
  literals: string[];
  count: number;
  /** repo-relative files that contain it */
  files: string[];
  /** the page blocks those files draw */
  blocks: string[];
}

const IGNORE = ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/*.d.ts", "**/*.test.*", "**/*.spec.*"];
const BLOCKS: [RegExp, string][] = [
  [/header|navbar|nav-/i, "Header"],
  [/footer/i, "Chân trang"],
  [/rank|bxh/i, "Bảng xếp hạng"],
  [/news|tintuc|tin-tuc|pagination|slider/i, "Tin tức"],
  [/banner|hero/i, "Banner"],
  [/float/i, "Nút nổi"],
  [/popup|modal/i, "Popup"],
];
const GLOBAL_CSS = /(^|\/)(index|global|globals|app|main|style|styles)\.(s?css|css)$/i;

export function blockOf(file: string): string {
  const f = file.replace(/\\/g, "/");
  for (const [re, label] of BLOCKS) if (re.test(f)) return label;
  if (GLOBAL_CSS.test(f)) return "Toàn trang (CSS chung)";
  return "Khác";
}

const HEX = /(?<![\w&/])#((?:[0-9a-fA-F]{8})|(?:[0-9a-fA-F]{6})|(?:[0-9a-fA-F]{3}))(?![0-9a-zA-Z_-])/g;

/** "#FFF" -> "#ffffff", "#ff000080" -> "#ff0000" (alpha is kept in the source, not in the key) */
export function normalizeHex(literal: string): string {
  let h = literal.replace(/^#/, "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.slice(0, 6);
}

/** Hex literals of one source text; 3-digit forms are only trusted in CSS or inside a Tailwind [..] value (not in #anchors). */
export function findHexLiterals(text: string, isCss: boolean): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HEX)) {
    const lit = "#" + m[1];
    if (m[1].length === 3) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 1), m.index);
      if (!isCss && before !== "[" && before !== ":" && before !== "(") continue;
    }
    out.push(lit);
  }
  return out;
}

export async function scanColors(repoPath: string): Promise<ColorSlot[]> {
  const files = await fg(["src/**/*.{css,scss,tsx,jsx,ts}"], { cwd: repoPath, ignore: IGNORE });
  const map = new Map<string, { literals: Set<string>; count: number; files: Set<string>; blocks: Set<string> }>();
  for (const rel of files.sort()) {
    const text = await fs.readFile(path.join(repoPath, rel), "utf-8").catch(() => "");
    const isCss = /\.s?css$/i.test(rel);
    for (const lit of findHexLiterals(text, isCss)) {
      const key = normalizeHex(lit);
      const e = map.get(key) ?? { literals: new Set<string>(), count: 0, files: new Set<string>(), blocks: new Set<string>() };
      e.literals.add(lit);
      e.count++;
      e.files.add(rel);
      e.blocks.add(blockOf(rel));
      map.set(key, e);
    }
  }
  return [...map.entries()]
    .map(([hex, e]) => ({ hex, literals: [...e.literals], count: e.count, files: [...e.files], blocks: [...e.blocks] }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Replaces every spelling in `literals` with `to` (#rrggbb). A literal with an alpha part (#rrggbbaa) keeps its alpha.
 * Matches whole colours only: "#fff" does not touch "#fff9c5".
 */
export function replaceHex(text: string, literals: string[], to: string): { text: string; replaced: number } {
  let replaced = 0;
  const next = text.replace(HEX, (whole, digits: string) => {
    const lit = "#" + digits;
    if (!literals.some((l) => l.toLowerCase() === lit.toLowerCase())) return whole;
    replaced++;
    return digits.length === 8 ? to + digits.slice(6) : to;
  });
  return { text: next, replaced };
}
