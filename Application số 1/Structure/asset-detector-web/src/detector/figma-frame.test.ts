import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { padToNodeFrame } from "./figma-frame";

const solid = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();

async function alphaAt(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
}

describe("padToNodeFrame", () => {
  it("restores the node frame around a trimmed render without scaling it (ios button: 62x92 in a 94x99 box)", async () => {
    const out = await padToNodeFrame(await solid(62, 92), { w: 94, h: 99 });
    expect(await sharp(out).metadata()).toMatchObject({ width: 94, height: 99 });
    expect(await alphaAt(out, 0, 0)).toBe(0); // empty margin
    expect(await alphaAt(out, 47, 49)).toBe(255); // picture sits in the middle
    expect(await alphaAt(out, 15, 49)).toBe(0); // 16px margin on each side, picture is 62 wide, not stretched
    expect(await alphaAt(out, 16, 49)).toBe(255);
  });

  it("handles a scale-2 render of a trimmed node", async () => {
    const out = await padToNodeFrame(await solid(158, 188), { w: 94, h: 100 });
    expect(await sharp(out).metadata()).toMatchObject({ width: 188, height: 200 });
  });

  it("leaves a render that already fills the frame alone", async () => {
    const full = await solid(94, 100);
    expect(await padToNodeFrame(full, { w: 94, h: 100 })).toBe(full);
    const full2 = await solid(188, 200);
    expect(await padToNodeFrame(full2, { w: 94, h: 100 })).toBe(full2);
  });
});
