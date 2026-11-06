import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { injectEditIds, injectEditIdsInDir } from "./edit-id";
import { installNextAdapter } from "./ve-adapter-next";

describe("pictures imported through a barrel file", () => {
  it("tags an <img> whose src only names the imported identifier", () => {
    const src = `export const A = () => <div className="absolute"><img src={cdn({ path: bannerPC })} /></div>;`;
    const r = injectEditIds(src, "src/A.tsx", [{ line: 0, attribute: "src", assetPath: "src/assets/banner/1920/banner.png", alias: "bannerPC" }]);
    expect(r.entries).toHaveLength(1);
    expect(r.code).toContain("data-edit-id=");
  });

  it("does not match a longer identifier that merely contains the alias", () => {
    const src = `export const A = () => <div className="absolute"><img src={bannerPCx} /></div>;`;
    const r = injectEditIds(src, "src/A.tsx", [{ line: 0, attribute: "src", assetPath: "src/assets/banner/1920/banner.png", alias: "bannerPC" }]);
    expect(r.entries.every((e) => e.slot !== "banner.banner")).toBe(true); // falls to the generic data branch, never to this asset
  });

  it("resolves the barrel from the detector's index.ts references", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ve-barrel-"));
    try {
      await fs.mkdir(path.join(dir, "src/assets/banner"), { recursive: true });
      await fs.mkdir(path.join(dir, "src/components"), { recursive: true });
      await fs.writeFile(path.join(dir, "src/assets/banner/index.ts"), `import bannerPC from "./1920/banner.png";\nexport { bannerPC };\n`);
      await fs.writeFile(path.join(dir, "src/components/B.tsx"), `import { bannerPC as hero } from "../assets/banner";\nexport const B = () => <div className="absolute"><img src={f(hero)} /></div>;\n`);
      const manifest = await injectEditIdsInDir(dir, "g", [
        { file: "src/assets/banner/index.ts", line: 1, attribute: "src", assetPath: "./1920/banner.png", type: "import" } as never,
      ]);
      expect(manifest.entries.map((e) => e.slot)).toEqual(["banner.banner"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Next.js multiple root layouts", () => {
  it("patches every (group)/layout.tsx that renders <html>", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ve-layouts-"));
    try {
      for (const g of ["(site)", "(landing)"]) {
        await fs.mkdir(path.join(dir, "src/app", g), { recursive: true });
        await fs.writeFile(path.join(dir, "src/app", g, "layout.tsx"), `export default function L({children}:{children:any}){return <html><head></head><body>{children}</body></html>}`);
      }
      const r = await installNextAdapter(dir, { editorOrigin: null, css: "" });
      expect(r.installed).toBe(true);
      for (const g of ["(site)", "(landing)"]) {
        expect(await fs.readFile(path.join(dir, "src/app", g, "layout.tsx"), "utf-8")).toContain("__ve_css");
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
