import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearColorRules, colorRulesCss, colorRulesToCss, readColorRules, setColorRule } from "./color-store";

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "colorrules-"));
  return { root, repoPath: path.join(root, "home-page") };
}
const SEL = "#root > div:nth-child(1) > header:nth-child(1) > h1:nth-child(2)";

describe("colour rules (one area, never every use of a colour)", () => {
  it("stores a rule for one selector and turns it into one CSS rule", async () => {
    const { root, repoPath } = await repo();
    try {
      const r = await setColorRule(repoPath, { selector: SEL, prop: "text", to: "#FF3366" });
      expect(r.ok).toBe(true);
      expect(await readColorRules(repoPath)).toEqual([{ selector: SEL, prop: "text", to: "#ff3366" }]);
      expect(await colorRulesCss(repoPath)).toContain(`${SEL}{color:#ff3366 !important}`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("replaces the colour of the same area and property, and keeps other areas separate", async () => {
    const { root, repoPath } = await repo();
    try {
      await setColorRule(repoPath, { selector: SEL, prop: "text", to: "#111111" });
      await setColorRule(repoPath, { selector: SEL, prop: "text", to: "#222222" });
      await setColorRule(repoPath, { selector: SEL, prop: "background", to: "#333333" });
      await setColorRule(repoPath, { selector: "#menu > a:nth-child(1)", prop: "text", to: "#444444" });
      const rules = await readColorRules(repoPath);
      expect(rules).toHaveLength(3);
      expect(rules.find((r) => r.selector === SEL && r.prop === "text")!.to).toBe("#222222");
      expect(colorRulesToCss(rules)).toMatch(/background-color:#333333 !important/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("refuses anything that could break out of the rule, and bad colours", async () => {
    const { root, repoPath } = await repo();
    try {
      for (const selector of ["a{color:red}", "a; b", "a\\9", "", "x".repeat(601), "a/*", 'a[x="1"]']) {
        expect((await setColorRule(repoPath, { selector, prop: "text", to: "#111111" })).ok).toBe(false);
      }
      expect((await setColorRule(repoPath, { selector: SEL, prop: "text", to: "red" })).ok).toBe(false);
      expect((await setColorRule(repoPath, { selector: SEL, prop: "fill", to: "#111111" })).ok).toBe(false);
      expect(await readColorRules(repoPath)).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("clears every rule, and ignores a file in the older global format", async () => {
    const { root, repoPath } = await repo();
    try {
      await fs.mkdir(repoPath, { recursive: true });
      await fs.writeFile(path.join(root, "home-page-colors.json"), JSON.stringify({ "#970000": { literals: ["#970000"], files: ["src/a.tsx"], to: "#088967" } }));
      expect(await readColorRules(repoPath)).toEqual([]);
      await setColorRule(repoPath, { selector: SEL, prop: "text", to: "#111111" });
      await clearColorRules(repoPath);
      expect(await readColorRules(repoPath)).toEqual([]);
      expect(await colorRulesCss(repoPath)).toBe("");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
