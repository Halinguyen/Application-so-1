import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { writeBlankImage } from "./blank-image";

async function setup(file: string, make: (s: Sharp) => Sharp) {
  const repo = await mkdtemp(path.join(os.tmpdir(), "blank-repo-"));
  const clone = await mkdtemp(path.join(os.tmpdir(), "blank-clone-"));
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  const src = sharp({ create: { width: 120, height: 48, channels: 4, background: { r: 200, g: 20, b: 20, alpha: 1 } } });
  await writeFile(path.join(repo, file), await make(src).toBuffer());
  return { repo, clone };
}

describe("writeBlankImage", () => {
  it("replaces a png with a fully transparent one of the same size", async () => {
    const { repo, clone } = await setup("public/a/frame.png", (s) => s.png());
    const out = await writeBlankImage(repo, clone, "public/a/frame.png");
    expect(typeof out).toBe("object");
    const img = sharp(await readFile(path.join(clone, "public/a/frame.png")));
    expect(await img.metadata()).toMatchObject({ width: 120, height: 48 });
    const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data.filter((_, i) => i % 4 === 3).every((a) => a === 0)).toBe(true);
  });

  it("refuses a format that cannot be transparent and leaves the clone alone", async () => {
    const { repo, clone } = await setup("public/a/photo.jpg", (s) => s.jpeg());
    expect(typeof (await writeBlankImage(repo, clone, "public/a/photo.jpg"))).toBe("string");
    await expect(readFile(path.join(clone, "public/a/photo.jpg"))).rejects.toThrow();
  });

  it("warns when the original cannot be read", async () => {
    const { repo, clone } = await setup("public/a/x.png", (s) => s.png());
    expect(typeof (await writeBlankImage(repo, clone, "public/a/missing.png"))).toBe("string");
  });
});
