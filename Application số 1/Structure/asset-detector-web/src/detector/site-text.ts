import fs from "node:fs/promises";
import path from "node:path";

/**
 * Hardcoded, human-visible text that isn't an env var and isn't picked up by
 * the asset detector (which only looks at image/video/font references) —
 * each of these is a literal string embedded directly in JSX or index.html.
 * Found by grepping the repo for the template's game name/branding text
 * outside of asset URLs; title-family and description-family tags each
 * share one identical string across multiple tags, so a single literal
 * replace covers every tag in that family at once.
 */
interface TextSlotDef {
  id: string;
  label: string;
  files: string[]; // repo-relative, tried in order — first one that exists AND matches wins
  pattern: RegExp; // exactly one capture group = the current value
  // Optional: the captured group can contain markup around the text (e.g. a
  // <br/> splitting a two-line H1) that the operator-facing default value
  // should hide, while applyTextSlot still needs the RAW captured string
  // (markup included) to find-and-replace the exact block in the file.
  toDisplay?: (raw: string) => string;
}

function stripInlineTags(raw: string): string {
  return raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const TEXT_SLOTS: TextSlotDef[] = [
  {
    id: "site-title",
    label: "Page title (<title>, meta title, og:title)",
    files: ["index.html"],
    pattern: /<title>([^<]*)<\/title>/,
  },
  {
    id: "site-description",
    label: "Page description (meta + og:description)",
    files: ["index.html"],
    // \s+ (not a literal space) between <meta and name="description" — some
    // repos get reformatted (e.g. by prettier) onto separate lines when the
    // tag has several attributes, which a literal "<meta name=" would miss
    // even though the description text is right there (found on
    // tamquoc-quan-anh, a structurally-divergent Nhóm A repo).
    pattern: /<meta\s+name="description"[\s\S]*?content="([^"]*)"/,
  },
  {
    id: "header-site-name",
    label: "Header site name (H1 next to the logo)",
    // HeaderHome.tsx is the fingerprint-matching path (3 of 4 Nhóm A repos);
    // tamquoc-quan-anh doesn't have it — its header lives in Header.tsx
    // instead (see MULTI-GAME-ROLLOUT-PLAN.md Phase 4). Tried in order, not
    // merged: a repo with HeaderHome.tsx should never fall through to a
    // same-named file elsewhere that isn't actually the header.
    files: ["src/layout/HeaderHome.tsx", "src/layout/Header.tsx"],
    // [\s\S]*? (not [^<]*?) so an inline tag between the text — e.g. a
    // two-line "Tam Quốc <br /> Đại Minh Tinh" H1 (found on
    // tamquoc-daiminhtinh) — doesn't break the match; toDisplay strips it
    // back out for the operator-facing value.
    pattern: /<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/,
    toDisplay: stripInlineTags,
  },
];

export interface TextSlotValue {
  id: string;
  label: string;
  defaultValue: string;
}

async function readCached(fileCache: Map<string, string>, repoPath: string, file: string): Promise<string> {
  let content = fileCache.get(file);
  if (content === undefined) {
    try {
      content = await fs.readFile(path.join(repoPath, file), "utf-8");
    } catch {
      content = "";
    }
    fileCache.set(file, content);
  }
  return content;
}

// Returns the first candidate file whose content actually matches the
// pattern — not just the first one that exists, since a divergent repo can
// have a same-named file that isn't the right one for this slot.
// A match whose captured block holds media/link markup (e.g. <h1><a><picture><img…>
// — tamquoc-quan-anh's header) is NOT plain text: replacing it would wipe the
// logo images (found: mobile header lost its game icon). Treat it as no match.
const NON_TEXT_MARKUP = /<(img|picture|source|svg|video|a|Image|Link)[\s/>]/i;

function resolveSlotFile(
  slot: TextSlotDef,
  fileCache: Map<string, string>
): { file: string; match: RegExpMatchArray | null } {
  for (const file of slot.files) {
    const content = fileCache.get(file) ?? "";
    const match = content.match(slot.pattern);
    if (match && !NON_TEXT_MARKUP.test(match[1])) return { file, match };
  }
  return { file: slot.files[0], match: null };
}

export async function readTextSlots(repoPath: string): Promise<TextSlotValue[]> {
  const fileCache = new Map<string, string>();
  const values: TextSlotValue[] = [];

  for (const slot of TEXT_SLOTS) {
    for (const file of slot.files) {
      await readCached(fileCache, repoPath, file);
    }
    const { match } = resolveSlotFile(slot, fileCache);
    if (!match) continue; // slot not present, or not plain text — don't offer it
    const raw = match[1];
    values.push({ id: slot.id, label: slot.label, defaultValue: slot.toDisplay ? slot.toDisplay(raw) : raw });
  }

  return values;
}

export async function applyTextSlot(
  cloneDir: string,
  repoPath: string,
  id: string,
  newValue: string
): Promise<boolean> {
  const slot = TEXT_SLOTS.find((s) => s.id === id);
  if (!slot || !newValue.trim()) return false;

  const fileCache = new Map<string, string>();
  for (const file of slot.files) {
    await readCached(fileCache, repoPath, file);
  }
  const { file, match } = resolveSlotFile(slot, fileCache);
  const original = match?.[1];
  if (!original || original === newValue) return false;

  const clonePath = path.join(cloneDir, file);
  const content = await fs.readFile(clonePath, "utf-8");
  if (!content.includes(original)) return false;

  await fs.writeFile(clonePath, content.split(original).join(newValue));
  return true;
}
