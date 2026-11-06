import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { classesAround, followsItsOwnProportion, keepRatioSlotIds } from "./flow-image";
import { resizeUploadToMatchTarget } from "./resize-upload";

const BANNER = `export const B = () => (
  <section>
      <img
        src={handleConcatPathImage({
          path: "/assets/home/banner/768/banner.jpg",
        })}
        className="w-full md:hidden"
        alt="banner"
      />
      <picture className="absolute top-0">
        <source media="(max-width: 768px)" srcSet={x({ path: "/assets/home/banner/logo-game.png" })} />
        <img src={x({ path: "/assets/home/banner/logo-game.png" })} className="w-24 h-24" />
      </picture>
  </section>
);`;

describe("pictures the page lays out by their own proportion", () => {
  it("reads the classes of the <img> around a multi-line reference", () => {
    expect(classesAround(BANNER, 5)).toEqual(["w-full", "md:hidden"]);
  });

  it("w-full without a height is such a picture; a fixed box, absolute or cover is not", () => {
    expect(followsItsOwnProportion(["w-full", "md:hidden"])).toBe(true);
    expect(followsItsOwnProportion(["w-full", "object-contain"])).toBe(true);
    expect(followsItsOwnProportion(["w-24", "h-24"])).toBe(false);
    expect(followsItsOwnProportion(["w-full", "h-full"])).toBe(false);
    expect(followsItsOwnProportion(["w-full", "absolute"])).toBe(false);
    expect(followsItsOwnProportion(["w-full", "object-cover"])).toBe(false);
    expect(followsItsOwnProportion([])).toBe(false);
  });

  it("flags a slot only when EVERY reference is such a picture", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-"));
    try {
      await fs.mkdir(path.join(dir, "src"), { recursive: true });
      await fs.writeFile(path.join(dir, "src/Banner.tsx"), BANNER);
      const ids = await keepRatioSlotIds(dir, [
        { id: "banner", references: [{ file: "src/Banner.tsx", line: 5 }] },
        { id: "logo", references: [{ file: "src/Banner.tsx", line: 11 }] },
        { id: "mixed", references: [{ file: "src/Banner.tsx", line: 5 }, { file: "src/Banner.tsx", line: 12 }] },
        { id: "none", references: [] },
      ]);
      expect([...ids]).toEqual(["banner"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('anchor "original"', () => {
  it("keeps the proportion of the upload: no crop, no padding, scaled inside the original file's size", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orig-"));
    try {
      await fs.mkdir(path.join(dir, "public"), { recursive: true });
      await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 1, g: 1, b: 1 } } }).png().toFile(path.join(dir, "public/m.png"));
      const wide = await sharp({ create: { width: 1920, height: 950, channels: 3, background: { r: 200, g: 20, b: 20 } } }).png().toBuffer();
      const out = await resizeUploadToMatchTarget(wide, dir, "public/m.png", "original");
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 534]); // 1920x950 scaled to the 1080 width
      const px = await sharp(out).removeAlpha().raw().toBuffer();
      expect([px[0], px[1], px[2]]).toEqual([200, 20, 20]); // the very first pixel is the picture, not a backdrop
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
