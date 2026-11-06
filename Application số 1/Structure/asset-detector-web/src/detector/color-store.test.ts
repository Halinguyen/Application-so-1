import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyPersistedColors, changeColor, readColorChanges, revertColors } from "./color-store";

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "colorstore-"));
  const repo = path.join(root, "home-page");
  const clone = path.join(root, "home-page-clone");
  for (const dir of [repo, clone]) {
    await fs.mkdir(path.join(dir, "src/components"), { recursive: true });
    await fs.writeFile(path.join(dir, "src/index.scss"), "a{color:#FAEA05;border:1px solid #818181}");
    await fs.writeFile(path.join(dir, "src/components/Rank.tsx"), 'export const R = () => <div className="bg-[#faea05]" />;');
  }
  return { root, repo, clone };
}
const read = (dir: string, f: string) => fs.readFile(path.join(dir, f), "utf-8");

describe("color store", () => {
  it("changes a colour everywhere in the clone, keeps the template, and remembers it", async () => {
    const { root, repo, clone } = await setup();
    try {
      const r = await changeColor(repo, clone, "#faea05", "#00FF66");
      expect(r).toMatchObject({ ok: true, hex: "#faea05", to: "#00ff66", replaced: 2 });
      expect(await read(clone, "src/index.scss")).toBe("a{color:#00ff66;border:1px solid #818181}");
      expect(await read(clone, "src/components/Rank.tsx")).toContain("bg-[#00ff66]");
      expect(await read(repo, "src/index.scss")).toContain("#FAEA05"); // the template is untouched
      expect((await readColorChanges(repo))["#faea05"].to).toBe("#00ff66");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("changing the same colour again (picked as its new value) does not stack", async () => {
    const { root, repo, clone } = await setup();
    try {
      await changeColor(repo, clone, "#faea05", "#00ff66");
      const r = await changeColor(repo, clone, "#00ff66", "#112233");
      expect(r).toMatchObject({ ok: true, hex: "#faea05", to: "#112233" });
      expect(await read(clone, "src/index.scss")).toBe("a{color:#112233;border:1px solid #818181}");
      expect(Object.keys(await readColorChanges(repo))).toEqual(["#faea05"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reverts everything, and re-applies after a fresh copy of the template", async () => {
    const { root, repo, clone } = await setup();
    try {
      await changeColor(repo, clone, "#faea05", "#00ff66");
      // a fresh clone: template copied again, then the remembered colours applied
      await fs.copyFile(path.join(repo, "src/index.scss"), path.join(clone, "src/index.scss"));
      expect(await applyPersistedColors(repo, clone)).toBeGreaterThan(0);
      expect(await read(clone, "src/index.scss")).toContain("#00ff66");
      expect(await revertColors(repo, clone)).toBeGreaterThan(0);
      expect((await read(clone, "src/index.scss")).toLowerCase()).toContain("#faea05");
      expect(await readColorChanges(repo)).toEqual({});
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("says so when the colour is not a hex code in the source, and rejects bad input", async () => {
    const { root, repo, clone } = await setup();
    try {
      const r = await changeColor(repo, clone, "#010203", "#00ff66");
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.error).toMatch(/không có dưới dạng mã hex/);
      expect((await changeColor(repo, clone, "#faea05", "red")).ok).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
