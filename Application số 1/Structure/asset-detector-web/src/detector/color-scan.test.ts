import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { blockOf, findHexLiterals, isHexColor, normalizeHex, replaceHex, scanColors } from "./color-scan";

describe("hex colours", () => {
  it("normalises short, upper-case and alpha forms to #rrggbb", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#FaEa05")).toBe("#faea05");
    expect(normalizeHex("#ff000080")).toBe("#ff0000");
  });

  it("finds colours in CSS and in Tailwind arbitrary values but not anchors or ids", () => {
    expect(findHexLiterals("a { color: #fff; background: #FAEA05; }", true)).toEqual(["#fff", "#FAEA05"]);
    expect(findHexLiterals('<a href="#about" className="bg-[#d2322e] text-[#fff]">', false)).toEqual(["#d2322e", "#fff"]);
    expect(findHexLiterals('<a href="#add">x</a><div id="#abcdef-1" />', false)).toEqual([]);
  });

  it("replaces only whole colours and keeps an alpha part", () => {
    const r = replaceHex("a{color:#fff;b:#fff9c5;c:#FFFFFF80;d:#FFF}", ["#fff", "#FFFFFF80"], "#112233");
    expect(r.text).toBe("a{color:#112233;b:#fff9c5;c:#11223380;d:#112233}");
    expect(r.replaced).toBe(3);
  });

  it("validates the target colour", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(["#fff", "red", "#12345", "javascript:1"].some(isHexColor)).toBe(false);
  });

  it("names the block a file draws", () => {
    expect(blockOf("src/components/home/Rank.tsx")).toBe("Bảng xếp hạng");
    expect(blockOf("src/layout/HeaderHome.tsx")).toBe("Header");
    expect(blockOf("src/components/news/NewsList.tsx")).toBe("Tin tức");
    expect(blockOf("src/index.scss")).toBe("Toàn trang (CSS chung)");
  });
});

describe("scanColors", () => {
  it("groups the same colour across files and spellings", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "colors-"));
    try {
      await fs.mkdir(path.join(dir, "src/components/home"), { recursive: true });
      await fs.writeFile(path.join(dir, "src/index.scss"), "a{color:#FFF;b:#faea05}");
      await fs.writeFile(path.join(dir, "src/components/home/Rank.tsx"), 'const c = "bg-[#ffffff] border-[#faea05]";');
      const list = await scanColors(dir);
      const white = list.find((c) => c.hex === "#ffffff")!;
      expect(white.count).toBe(2);
      expect(white.literals.sort()).toEqual(["#FFF", "#ffffff"]);
      expect(white.blocks.sort()).toEqual(["Bảng xếp hạng", "Toàn trang (CSS chung)"]);
      expect(list).toHaveLength(2);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
