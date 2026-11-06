import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { readExternalManifest, replaceExternalAsset } from "./external-replace";

const URL_VIDEO = "https://cdn.invalid/t/homepage.mp4";
const URL_IMAGE = "https://cdn.invalid/t/slide-1.jpg";

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "extrep-"));
  const repo = path.join(root, "home-page");
  const clone = path.join(root, "home-page-clone");
  for (const dir of [repo, clone]) await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(clone, "src/Banner.tsx"), `<video><source src={"${URL_VIDEO}"} type="video/mp4" /></video>\nconst slide = "${URL_IMAGE}";\n`);
  return { root, repo, clone };
}

describe("replaceExternalAsset", () => {
  it("writes a video as it is, patches the address and the type, and remembers it", async () => {
    const { root, repo, clone } = await setup();
    try {
      const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);
      const r = await replaceExternalAsset(repo, clone, { url: URL_VIDEO, localPath: "assets/_uploads/x-homepage.mp4", refFiles: ["src/Banner.tsx"] }, new File([webm], "v.webm"), "attention");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.localPath).toBe("/assets/_uploads/x-homepage.webm"); // the extension follows the bytes
      expect(r.resized).toBe(false);
      const src = await fs.readFile(path.join(clone, "src/Banner.tsx"), "utf-8");
      expect(src).toContain('src={"/assets/_uploads/x-homepage.webm"} type="video/webm"');
      expect((await fs.readFile(path.join(clone, "public/assets/_uploads/x-homepage.webm"))).length).toBe(webm.length);
      expect(Object.keys(await readExternalManifest(repo))).toEqual(["assets/_uploads/x-homepage.webm"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("writes a picture and patches the address in the source", async () => {
    const { root, repo, clone } = await setup();
    try {
      const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
      const r = await replaceExternalAsset(repo, clone, { url: URL_IMAGE, localPath: "assets/_uploads/x-slide-1.jpg", refFiles: ["src/Banner.tsx"] }, new File([png], "p.png"), "attention");
      expect(r.ok).toBe(true);
      expect(await fs.readFile(path.join(clone, "src/Banner.tsx"), "utf-8")).toContain('const slide = "/assets/_uploads/x-slide-1.jpg"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a file that is neither a picture nor a video and leaves the source alone", async () => {
    const { root, repo, clone } = await setup();
    try {
      const r = await replaceExternalAsset(repo, clone, { url: URL_IMAGE, localPath: "assets/_uploads/x.jpg", refFiles: ["src/Banner.tsx"] }, new File([Buffer.from("hello, not media")], "t.txt"), "attention");
      expect(r.ok).toBe(false);
      expect(await fs.readFile(path.join(clone, "src/Banner.tsx"), "utf-8")).toContain(URL_IMAGE);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
