import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pruneExcludedRoutes } from "./prune-routes";

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "prune-"));
const w = async (dir: string, rel: string, text: string) => {
  await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
  await fs.writeFile(path.join(dir, rel), text);
};
const gone = (p: string) => expect(fs.stat(p)).rejects.toThrow();
const there = (p: string) => expect(fs.stat(p)).resolves.toBeTruthy();

describe("pruneExcludedRoutes", () => {
  it("removes /choigameN routes, imports, files and the assets only they used (react-router)", async () => {
    const dir = await tmp();
    try {
      await w(dir, "src/main.tsx", `import Home from './page/Home.tsx';\nimport Choigame1 from './page/LandingH5/Choigame1.tsx';\nimport Choigame2 from './page/LandingH5/Choigame2.tsx';\nconst r = (<Routes>\n\t<Route path="/" element={<Home />} />\n\t<Route path="/choigame1" element={<Choigame1 />} />\n\t<Route path="/choigame2" element={<Choigame2 />} />\n</Routes>);\n`);
      await w(dir, "src/page/Home.tsx", `export default () => <img src="/assets/home/logo.png" />;`);
      await w(dir, "src/page/LandingH5/Choigame1.tsx", `export default () => <img src="/assets/landing/only-here.png" />;`);
      await w(dir, "src/page/LandingH5/Choigame2.tsx", `export default () => <img src="/assets/home/logo.png" />;`);
      await w(dir, "public/assets/home/logo.png", "x");
      await w(dir, "public/assets/landing/only-here.png", "x");
      const r = await pruneExcludedRoutes(dir);
      expect([...r.routes].sort()).toEqual(["/choigame1", "/choigame2"]);
      const main = await fs.readFile(path.join(dir, "src/main.tsx"), "utf-8");
      expect(main).not.toMatch(/choigame/i);
      expect(main).toMatch(/path="\/" element=\{<Home \/>\}/);
      await gone(path.join(dir, "src/page/LandingH5/Choigame1.tsx"));
      await gone(path.join(dir, "public/assets/landing/only-here.png"));
      await there(path.join(dir, "public/assets/home/logo.png")); // Home.tsx still names it
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("removes app/**/choigame folders (Next.js) and leaves other routes alone", async () => {
    const dir = await tmp();
    try {
      await w(dir, "src/app/(site)/choigame3/page.tsx", `export default () => <img src="/img/c3.png" />;`);
      await w(dir, "src/app/(site)/rank/page.tsx", `export default () => <img src="/img/rank.png" />;`);
      await w(dir, "public/img/c3.png", "x");
      await w(dir, "public/img/rank.png", "x");
      const r = await pruneExcludedRoutes(dir);
      expect(r.routes).toEqual(["/choigame3"]);
      await gone(path.join(dir, "src/app/(site)/choigame3"));
      await there(path.join(dir, "src/app/(site)/rank/page.tsx"));
      await gone(path.join(dir, "public/img/c3.png"));
      await there(path.join(dir, "public/img/rank.png"));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("does nothing when no page is excluded", async () => {
    const dir = await tmp();
    try {
      await w(dir, "src/main.tsx", `<Route path="/rank" element={<Rank />} />\n`);
      expect(await pruneExcludedRoutes(dir)).toEqual({ routes: [], files: [], assets: [] });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
