import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mergeSlots } from "./slot-merge";
import { buildIco } from "./resize-upload";
import type { DetectedAsset } from "./types";
import type { CloneSlot } from "@/app/components/wizard/types";

function asset(id: string, p: string, hash: string, w: number, auto = false): DetectedAsset {
  return { id, canonicalPath: p, hash, type: "image", isAutoManaged: auto, dimensions: { width: w, height: w } } as unknown as DetectedAsset;
}
function slot(id: string, p: string, label = id): CloneSlot {
  return { id, label, section: "x", previewPath: p, targetPaths: [p], responsive: "single", sectionLabel: "", sectionOrder: 0, sectionPosition: "", sizeLabel: "", needsVisualProof: false, responsiveLabel: "", references: [] };
}

describe("mergeSlots", () => {
  const assets = [
    asset("f16", "public/favicon/favicon-16x16.png", "h16", 16, true),
    asset("f32", "public/favicon/favicon-32x32.png", "h32", 32, true),
    asset("ico", "public/favicon/favicon.ico", "hico", 48, true),
    asset("a512", "public/favicon/android-chrome-512x512.png", "hBig", 512, true),
    asset("icon", "public/assets/home/news/1920/icon-app.png", "hBig", 512),
    asset("logo", "public/assets/header/logo-game.png", "hBig", 512),
    asset("other", "public/assets/home/banner/logo-game.png", "hOther", 300),
    asset("c1", "public/img/a/btn.png", "hBtn", 80),
    asset("c2", "public/img/b/btn.png", "hBtn", 80),
    asset("n1", "public/img/rank/bg.png", "hBg1", 900),
    asset("n2", "public/img/home/bg.png", "hBg2", 900),
  ];
  const slots = assets.map((a) => slot(a.id, a.canonicalPath));
  const merged = mergeSlots(slots, assets);

  it("folds the favicon family and every identical picture into ONE icon slot with all targets", () => {
    const icon = merged.find((s) => s.merged?.kind === "icon-family")!;
    expect(icon.merged!.count).toBe(6);
    expect(icon.targetPaths.sort()).toEqual(
      [
        "public/assets/header/logo-game.png",
        "public/assets/home/news/1920/icon-app.png",
        "public/favicon/android-chrome-512x512.png",
        "public/favicon/favicon-16x16.png",
        "public/favicon/favicon-32x32.png",
        "public/favicon/favicon.ico",
      ].sort()
    );
    expect(icon.sizeLabel).toBe("16 × 16 → 512 × 512 px");
  });

  it("merges other byte-identical pictures", () => {
    const btn = merged.find((s) => s.merged?.kind === "identical")!;
    expect(btn.targetPaths.sort()).toEqual(["public/img/a/btn.png", "public/img/b/btn.png"]);
    expect(btn.label).toMatch(/2 nơi/);
  });

  it("keeps pictures that only share a name or a section apart", () => {
    const ids = merged.map((s) => s.id);
    expect(ids).toContain("other"); // a different logo-game.png
    expect(ids).toContain("n1");
    expect(ids).toContain("n2");
  });

  it("leaves a list with nothing to merge unchanged", () => {
    const one = [slot("a", "public/a.png")];
    expect(mergeSlots(one, [asset("a", "public/a.png", "x", 10)])).toEqual(one);
  });
});

describe("buildIco", () => {
  it("packs 16, 32 and 48 px PNGs in a valid ICO container", async () => {
    const src = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
    const ico = await buildIco(src);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    const sizes = [0, 1, 2].map((i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
    // each entry points at a real PNG of that size
    for (let i = 0; i < 3; i++) {
      const len = ico.readUInt32LE(6 + i * 16 + 8);
      const off = ico.readUInt32LE(6 + i * 16 + 12);
      const meta = await sharp(ico.subarray(off, off + len)).metadata();
      expect([meta.format, meta.width]).toEqual(["png", sizes[i]]);
    }
  });
});
