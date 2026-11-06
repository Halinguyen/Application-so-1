/**
 * Matches a picture the editor sees in the preview to the asset slot that owns its file.
 * Pure (no I/O) so it can be tested and used by both the editor UI and the API.
 */

/** The part of a wizard slot the preview editor needs. */
export interface EditSlot {
  id: string;
  label: string;
  /** repo-relative files, one per breakpoint variant, e.g. public/assets/home/news/1920/icon-app.png */
  targetPaths: string[];
  previewPath: string;
  sizeLabel: string;
  /** the page draws it by its own proportion: uploads keep their proportion */
  keepRatio?: boolean;
}

const ROOT = /^(public|static|wwwroot)\//;

/** URL path a repo file is served at: "public/assets/a.png" -> "/assets/a.png". */
export function publicPathOf(targetPath: string): string {
  return "/" + targetPath.replace(/\\/g, "/").replace(ROOT, "");
}

export interface MediaMatch {
  slot: EditSlot;
  /** the file that is on screen right now (the variant for this breakpoint) */
  shownPath: string;
}

/**
 * `src` is what the browser reports (currentSrc): absolute URL, maybe with a query. The preview serves the
 * clone's own public/ folder at the root, so a repo file matches when its public path is the URL's path.
 * A CDN-hosted copy carries a prefix before that same path, so the public path may also be a SUFFIX;
 * the longest match wins. `previewOrigin` tells local files from remote ones.
 */
export function matchMediaToSlot(
  src: string,
  slots: EditSlot[],
  previewOrigin: string
): { match: MediaMatch | null; remote: boolean } {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return { match: null, remote: false };
  }
  const remote = url.origin !== previewOrigin;
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* keep the raw path */
  }
  let best: { slot: EditSlot; shownPath: string; len: number } | null = null;
  for (const slot of slots) {
    for (const tp of slot.targetPaths) {
      const pub = publicPathOf(tp);
      const hit = remote ? pathname.endsWith(pub) : pathname === pub;
      if (hit && (!best || pub.length > best.len)) best = { slot, shownPath: tp, len: pub.length };
    }
  }
  return { match: best ? { slot: best.slot, shownPath: best.shownPath } : null, remote };
}

/** Every file path the API may write: the union of the slots' target files. */
export function allowedTargetPaths(slots: EditSlot[]): Set<string> {
  return new Set(slots.flatMap((s) => s.targetPaths.map((t) => t.replace(/\\/g, "/"))));
}
