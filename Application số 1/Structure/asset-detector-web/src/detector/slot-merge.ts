import type { DetectedAsset } from "./types";
import type { CloneSlot } from "@/app/components/wizard/types";

/**
 * One upload should fill every place that shows the same picture. Two groups are merged into a single slot, whose
 * `targetPaths` is the union (the clone route already resizes the upload to each target's own size):
 *  1. the icon family — favicon-16/32, apple-touch-icon, android-chrome-192/512, favicon.ico... that the tool manages
 *     itself, together with every other picture that is byte-identical to one of them (the game icon used in the page);
 *  2. any other pictures that are byte-identical to each other (same hash), e.g. one logo copied into two folders.
 * Pictures that merely share a file name but differ are NOT merged: they may be different artwork.
 */
export const ICON_FAMILY = /(^|\/)(favicon[^/]*|apple-touch-icon[^/]*|android-chrome-[^/]*|mstile-[^/]*|safari-pinned-tab[^/]*)\.(png|ico|svg)$/i;

type Kind = NonNullable<CloneSlot["merged"]>["kind"];

const area = (a: DetectedAsset | undefined) => (a?.dimensions ? a.dimensions.width * a.dimensions.height : 0);

export function mergeSlots(slots: CloneSlot[], assets: DetectedAsset[]): CloneSlot[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const groupOf = new Map<string, string>(); // slot id -> group key
  const kindOf = new Map<string, Kind>();

  // 1. icon family; its hashes pull in identical pictures elsewhere
  const familyHashes = new Set<string>();
  for (const s of slots) {
    const a = byId.get(s.id);
    if (a && a.isAutoManaged && ICON_FAMILY.test(s.previewPath.replace(/\\/g, "/"))) {
      groupOf.set(s.id, "icon-family");
      kindOf.set("icon-family", "icon-family");
      familyHashes.add(a.hash);
    }
  }
  if (groupOf.size > 0) {
    for (const s of slots) {
      const a = byId.get(s.id);
      if (a && !groupOf.has(s.id) && familyHashes.has(a.hash) && a.type === "image") groupOf.set(s.id, "icon-family");
    }
  }
  // 2. identical pictures
  const byHash = new Map<string, string[]>();
  for (const s of slots) {
    const a = byId.get(s.id);
    if (!a || groupOf.has(s.id) || a.type !== "image" || !a.hash) continue;
    byHash.set(a.hash, [...(byHash.get(a.hash) ?? []), s.id]);
  }
  for (const [hash, ids] of byHash) {
    if (ids.length < 2) continue;
    for (const id of ids) groupOf.set(id, "hash:" + hash);
    kindOf.set("hash:" + hash, "identical");
  }

  const out: CloneSlot[] = [];
  const done = new Set<string>();
  for (const s of slots) {
    const key = groupOf.get(s.id);
    if (!key) {
      out.push(s);
      continue;
    }
    if (done.has(key)) continue;
    done.add(key);
    const members = slots.filter((x) => groupOf.get(x.id) === key);
    if (members.length < 2) {
      out.push(s);
      continue;
    }
    // the biggest picture represents the group (preview, size, proof flags)
    const primary = [...members].sort((x, y) => area(byId.get(y.id)) - area(byId.get(x.id)))[0];
    const dims = members.map((m) => byId.get(m.id)?.dimensions).filter((d): d is { width: number; height: number } => !!d);
    const small = dims.length ? [...dims].sort((p, q) => p.width * p.height - q.width * q.height)[0] : null;
    const big = dims.length ? [...dims].sort((p, q) => q.width * q.height - p.width * p.height)[0] : null;
    const kind = kindOf.get(key)!;
    out.push({
      ...primary,
      id: primary.id,
      label: kind === "icon-family" ? "Icon game (favicon, apple-touch, android, icon trong trang)" : `${primary.label} (dùng ở ${members.length} nơi)`,
      targetPaths: [...new Set(members.flatMap((m) => m.targetPaths))],
      references: members.flatMap((m) => m.references),
      sizeLabel: small && big && (small.width !== big.width || small.height !== big.height) ? `${small.width} × ${small.height} → ${big.width} × ${big.height} px` : primary.sizeLabel,
      merged: { count: members.length, kind },
    });
  }
  return out;
}
