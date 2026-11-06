import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { resizeUploadToMatchTarget } from "./resize-upload";

// a wide picture: left half red, right half blue
async function wide() {
  const left = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  const right = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 1000, top: 0 }])
    .png()
    .toBuffer();
}

async function target(w: number, h: number, file = "t.png") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fit-"));
  await fs.mkdir(path.join(dir, "public"), { recursive: true });
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 1, g: 1, b: 1 } } }).png().toFile(path.join(dir, "public", file));
  return { dir, rel: "public/" + file };
}

async function colours(buf: Buffer) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  return { w: info.width, h: info.height, centreLeft: px(Math.floor(info.width * 0.1), Math.floor(info.height / 2)), centreRight: px(Math.floor(info.width * 0.9), Math.floor(info.height / 2)), top: px(Math.floor(info.width / 2), 2) };
}

describe("a very different proportion keeps the whole picture", () => {
  it("auto: a wide picture into a tall target shows BOTH halves (not a slice) at exactly the target size", async () => {
    const { dir, rel } = await target(540, 960);
    try {
      const out = await resizeUploadToMatchTarget(await wide(), dir, rel, "attention");
      const c = await colours(out);
      expect([c.w, c.h]).toEqual([540, 960]);
      // the picture is placed in the middle band; in the band the left is red and the right is blue
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(540);
      const band = await sharp(out).extract({ left: 0, top: 960 / 2 - 5, width: 540, height: 10 }).removeAlpha().raw().toBuffer();
      expect([band[3 * 20], band[3 * 20 + 1], band[3 * 20 + 2]]).toEqual([255, 0, 0]);
      expect([band[3 * 520], band[3 * 520 + 1], band[3 * 520 + 2]]).toEqual([0, 0, 255]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("crop: always cuts a slice (only one colour survives in the middle)", async () => {
    const { dir, rel } = await target(540, 960);
    try {
      const out = await resizeUploadToMatchTarget(await wide(), dir, rel, "crop");
      const c = await colours(out);
      expect(c.centreLeft).toEqual(c.centreRight); // a cut slice of one half: both sides are the same colour
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("auto: a small difference in proportion still cuts, as before", async () => {
    const { dir, rel } = await target(1000, 800);
    try {
      const out = await resizeUploadToMatchTarget(await wide(), dir, rel, "attention");
      const c = await colours(out);
      expect([c.w, c.h]).toEqual([1000, 800]);
      // no blurred backdrop: the picture fills the whole target (top row is picture colour, not a blur of both)
      expect(c.top[0] === 255 || c.top[2] === 255).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("a logo with transparency gets transparent padding, not a blurred backdrop", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fit-"));
    try {
      await fs.mkdir(path.join(dir, "public"), { recursive: true });
      await sharp({ create: { width: 100, height: 400, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } } }).png().toFile(path.join(dir, "public/logo.png"));
      const logo = await sharp({ create: { width: 400, height: 100, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 0.9 } } }).png().toBuffer();
      const out = await resizeUploadToMatchTarget(logo, dir, "public/logo.png", "attention");
      const raw = await sharp(out).ensureAlpha().raw().toBuffer();
      expect(raw[3]).toBe(0); // the top-left pixel is transparent padding
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
