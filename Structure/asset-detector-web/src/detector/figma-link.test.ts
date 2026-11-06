import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importFigmaLink, inferFrameBySection, isRenderable, nodesFromFrames, parseFigmaUrl } from "./figma-link";

const KEY = "wDARmroVWOMtuCENhzj8aB";

describe("parseFigmaUrl", () => {
  it("reads the file key and converts node-id dashes to colons", () => {
    expect(parseFigmaUrl(`https://www.figma.com/design/${KEY}/Game?node-id=4-2&t=x`)).toEqual({ fileKey: KEY, nodeIds: ["4:2"] });
    expect(parseFigmaUrl(`https://figma.com/file/${KEY}/Game`)).toEqual({ fileKey: KEY, nodeIds: [] });
  });
  it("uses the branch key for a branch link", () => {
    expect(parseFigmaUrl(`https://www.figma.com/design/${KEY}/branch/${"b".repeat(22)}/Game`)?.fileKey).toBe("b".repeat(22));
  });
  it("rejects other hosts and malformed links", () => {
    expect(parseFigmaUrl(`https://evil.com/design/${KEY}/x`)).toBeNull();
    expect(parseFigmaUrl("not a url")).toBeNull();
    expect(parseFigmaUrl("https://www.figma.com/design/short/x")).toBeNull();
  });
});

const tree = {
  id: "4:2",
  name: "Trang chủ",
  type: "FRAME",
  absoluteBoundingBox: { width: 1920, height: 1080 },
  children: [
    { id: "4:3", name: "bg", type: "RECTANGLE", fills: [{ type: "IMAGE" }], absoluteBoundingBox: { width: 300.4, height: 200 } },
    { id: "4:4", name: "label", type: "TEXT", characters: "NẠP", absoluteBoundingBox: { width: 50, height: 20 } },
    { id: "4:5", name: "solid", type: "RECTANGLE", fills: [{ type: "SOLID" }], visible: false, absoluteBoundingBox: { width: 100, height: 100 } },
  ],
};

describe("nodesFromFrames", () => {
  it("lists the frame first, then its descendants with the plugin fields", () => {
    const nodes = nodesFromFrames([tree]);
    expect(nodes[0]).toMatchObject({ id: "4:2", parent: null, frame: "4:2", w: 1920 });
    expect(nodes[1]).toMatchObject({ id: "4:3", parent: "4:2", frame: "4:2", w: 300, hasImage: true, solid: false });
    expect(nodes[2]).toMatchObject({ type: "TEXT", text: "NẠP" });
    expect(nodes[3]).toMatchObject({ visible: false, solid: true });
  });
  it("renders only visible shapes and containers of slot size", () => {
    expect(nodesFromFrames([tree]).filter(isRenderable).map((n) => n.id)).toEqual(["4:3"]);
  });
});

describe("inferFrameBySection", () => {
  it("maps frames by name and leaves unknown names out", () => {
    const nodes = nodesFromFrames([tree, { ...tree, id: "34:278", name: "Bảng xếp hạng", children: [] }, { ...tree, id: "9:9", name: "Misc", children: [] }]);
    const m = inferFrameBySection(nodes);
    expect(m.header).toBe("4:2");
    expect(m.rank).toBe("34:278");
    expect(Object.values(m)).not.toContain("9:9");
  });
});

describe("importFigmaLink", () => {
  it("fetches the frames and writes the snapshot", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "figma-link-"));
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ nodes: { "4:2": { document: tree } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await importFigmaLink("demo", `https://www.figma.com/design/${KEY}/G?node-id=4-2`, "tok", dir);
      expect(r).toMatchObject({ fileKey: KEY, frames: ["Trang chủ"], nodes: 4, renderable: 1, warnings: [] });
      const saved = JSON.parse(await readFile(path.join(dir, "demo.json"), "utf8"));
      expect(saved.frameBySection.header).toBe("4:2");
      expect(saved.nodes).toHaveLength(4);
      expect(String(fetchMock.mock.calls[0][0])).toContain("/nodes?ids=4%3A2");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("refuses a link that is not a frame", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ nodes: { "4:3": { document: tree.children[0] } } }), { status: 200 }));
    try {
      await expect(importFigmaLink("demo", `https://www.figma.com/design/${KEY}/G?node-id=4-3`, "tok", os.tmpdir())).rejects.toThrow(/frame/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
