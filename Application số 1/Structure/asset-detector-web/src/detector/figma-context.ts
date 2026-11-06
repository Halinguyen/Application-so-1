import { readFile } from "node:fs/promises";
import path from "node:path";

// What the website's own code says about how an asset is shown. The file on disk is often not the size on the page
// (icon-app.png is 512x512 but rendered width={207} height={207}); the design is drawn at the rendered size.
export interface SlotContext {
  displayW?: number;
  displayH?: number;
  /** width / height when only an aspect ratio is stated (aspect-250/450). */
  aspect?: number;
  altTokens: string[];
}

const TAILWIND_UNIT = 4; // w-24 = 6rem = 96px

function px(value: string): number {
  return Math.round(parseFloat(value) * 100) / 100;
}

/** Reads the size/aspect/alt of one JSX element. Only base (unprefixed) Tailwind classes are read: sm:/md: ones depend on the viewport. */
export function parseElementContext(element: string): SlotContext {
  const ctx: SlotContext = { altTokens: [] };
  const attrW = element.match(/\bwidth=\{(\d+(?:\.\d+)?)\}/) ?? element.match(/\bwidth="(\d+)"/);
  const attrH = element.match(/\bheight=\{(\d+(?:\.\d+)?)\}/) ?? element.match(/\bheight="(\d+)"/);
  const twW = element.match(/(?<![\w:[-])w-\[(\d+(?:\.\d+)?)px\]/) ?? element.match(/(?<![\w:[-])w-(\d+(?:\.\d+)?)(?![\w/.-])/);
  const twH = element.match(/(?<![\w:[-])h-\[(\d+(?:\.\d+)?)px\]/) ?? element.match(/(?<![\w:[-])h-(\d+(?:\.\d+)?)(?![\w/.-])/);
  if (attrW) ctx.displayW = px(attrW[1]);
  else if (twW) ctx.displayW = twW[0].includes("[") ? px(twW[1]) : px(twW[1]) * TAILWIND_UNIT;
  if (attrH) ctx.displayH = px(attrH[1]);
  else if (twH) ctx.displayH = twH[0].includes("[") ? px(twH[1]) : px(twH[1]) * TAILWIND_UNIT;
  const aspect = element.match(/(?<![\w:-])aspect-(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/);
  if (aspect) ctx.aspect = parseFloat(aspect[1]) / parseFloat(aspect[2]);
  const alt = element.match(/\balt=(?:"([^"]*)"|\{"([^"]*)"\})/);
  const altText = alt?.[1] ?? alt?.[2] ?? "";
  ctx.altTokens = altText
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return ctx;
}

/** The element that holds the reference: from the nearest <img above the referenced line to its closing "/>". */
export function elementAround(lines: string[], line: number): string {
  let start = line - 1;
  for (let i = line - 1; i >= Math.max(0, line - 13); i--) {
    if (/<img\b|<Image\b/.test(lines[i])) {
      start = i;
      break;
    }
  }
  let end = line - 1;
  for (let i = start; i < Math.min(lines.length, start + 25); i++) {
    end = i;
    if (/\/>/.test(lines[i]) && i >= line - 1) break;
  }
  return lines.slice(start, end + 1).join("\n");
}

/** One entry per place the asset is used: an image shown at 207x207 in one panel and at 100x100 in another must not be blended. */
export async function readSlotContext(repoPath: string, refs: { file: string; line: number }[]): Promise<SlotContext[]> {
  const usages: SlotContext[] = [];
  for (const ref of refs.slice(0, 4)) {
    let source: string;
    try {
      source = await readFile(path.join(repoPath, ref.file), "utf8");
    } catch {
      continue;
    }
    const c = parseElementContext(elementAround(source.split(/\r?\n/), ref.line));
    if (c.displayW !== undefined || c.displayH !== undefined || c.aspect !== undefined || c.altTokens.length > 0) usages.push(c);
  }
  return usages;
}
