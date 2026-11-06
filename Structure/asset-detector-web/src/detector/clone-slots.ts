import { describeResponsive, describeSection, describeSectionPosition, needsVisualProof, sectionOrder } from "./section-labels";
import type { DetectedAsset, DetectionResult } from "./types";
import type { CloneSlot } from "@/app/components/wizard/types";
import { mergeSlots } from "./slot-merge";

// The rows the wizard lists: one slot per replaceable asset.

// Many assets share a file name in different folders ("title.webp" x10), which made the
// list look like repeats. Append the folder they live in to every label that is not unique.
function withUniqueLabels(slots: CloneSlot[]): CloneSlot[] {
  const count = new Map<string, number>();
  for (const s of slots) count.set(s.label, (count.get(s.label) ?? 0) + 1);
  return slots.map((s) => {
    if ((count.get(s.label) ?? 0) < 2) return s;
    const folder = s.previewPath
      .replace(/\\/g, "/")
      .replace(/^(public|wwwroot)\//, "")
      .replace(/^assets\//, "")
      .split("/")
      .slice(0, -1)
      .filter((p) => !/^\d+$/.test(p))
      .join("/");
    return folder ? { ...s, label: `${s.label} · ${folder}` } : s;
  });
}

// Sections whose content is now filled by the real APIs (slides / banner, news
// posts + categories, ranking) — not static assets to replace, so the wizard
// does not list them.
const API_FILLED_SECTIONS = new Set(["home-banner", "banner", "home-news", "news", "tintuc", "home-rank", "rank"]);

// Buttons / icons / logos inside those sections are static artwork (nav, download, prev/next)
// that the clone must be able to replace; only the content images are API-driven.
//
// The news sections also carry plenty of static decoration (section background, panel frames, the store/APK icons of the
// download panel): only the post/slide content images are API-driven there, so only those are left out.
// The hero banner is the same story: its background may be an image OR a video (a video comes through the CDN slots), and a
// repo image there (a phone background, a title art) is static; only slides / posts are API-driven.
// ("tintuc" is the news SUBPAGE: the home-page design does not contain it, so it stays out.)
const NEWS_SECTIONS = new Set(["home-news", "news", "home-banner", "banner"]);
const NEWS_CONTENT_RE = /^(slide|post|thumb)/i;
function isApiFilled(a: DetectedAsset): boolean {
  if (!API_FILLED_SECTIONS.has(a.section) || /^(btn|icon|logo)/i.test(a.fileName)) return false;
  return !NEWS_SECTIONS.has(a.section) || NEWS_CONTENT_RE.test(a.fileName);
}

/**
 * Every picture that is a file of the repo is listed, also in the rank/news areas (operator, 2026-11-06: the API only supplies
 * text, so pictures there are static). `includeApiSections: false` brings the old filter back (hides those areas).
 */
export function buildCloneSlots(data: DetectionResult, opts: { includeApiSections?: boolean } = {}): { slots: CloneSlot[]; unusedAssets: string[] } {
  // Only assets the source code actually uses (favicons are always kept: they are wired
  // through index.html/manifest). Files that merely sit in the assets folder are listed
  // separately so the operator is not asked to replace images nothing displays.
  const candidates = data.assets.filter(
    (a) => (a.metadata?.operatorEditable || a.isAutoManaged) && !a.isExternal && (opts.includeApiSections !== false || !isApiFilled(a))
  );
  const unusedAssets = candidates.filter((a) => !a.isAutoManaged && a.referenceCount === 0).map((a) => a.canonicalPath);
  const slots = withUniqueLabels(
    candidates
        .filter((a) => a.isAutoManaged || a.referenceCount > 0)
        .map(
          (a): CloneSlot => ({
            id: a.id,
            label: a.metadata?.label || a.fileName,
            section: a.section,
            previewPath: a.canonicalPath,
            targetPaths: a.injection?.targetPaths || [a.canonicalPath],
            responsive: a.responsive,
            sectionLabel: describeSection(a.section),
            sectionOrder: sectionOrder(a.section),
            sectionPosition: describeSectionPosition(a.section),
            sizeLabel: a.dimensions ? `${a.dimensions.width} × ${a.dimensions.height} px` : "",
            needsVisualProof: needsVisualProof(a.section, a.dimensions),
            responsiveLabel: describeResponsive(a.responsive, a.variants, a.missingBreakpoints),
            references: a.references.map((r) => ({
              file: r.file,
              line: r.line,
              usage: r.usage,
              attribute: r.attribute,
            })),
          })
        )
  );
  return { slots: mergeSlots(slots, data.assets), unusedAssets };
}
