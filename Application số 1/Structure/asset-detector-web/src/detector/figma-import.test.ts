import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { FigmaNode } from "./figma-match";
import { importFigmaExport } from "./figma-import";

const KEY = "wDARmroVWOMtuCENhzj8aB";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const node = (id: string, frame: string, parent: string | null = frame): FigmaNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent,
  frame,
  w: 10,
  h: 10,
  visible: true,
  hasImage: true,
  solid: false,
});
const zipOf = (nodes: FigmaNode[], extra: Record<string, Uint8Array> = {}, meta: object = {}) =>
  zipSync({ "nodes.json": strToU8(JSON.stringify({ fileKey: KEY, frameBySection: { home: "f1" }, nodes, ...meta })), ...extra });

async function dirs() {
  return { cacheRoot: await mkdtemp(path.join(os.tmpdir(), "fi-cache-")), snapshotDir: await mkdtemp(path.join(os.tmpdir(), "fi-snap-")) };
}

describe("importFigmaExport", () => {
  it("writes the PNGs by node id and the node metadata as the game's snapshot", async () => {
    const o = await dirs();
    const res = await importFigmaExport("demo-game", zipOf([node("f1", "f1", null), node("I1:2;3:4", "f1")], { "assets/I1_2_3_4.png": PNG }), o);
    expect(res).toMatchObject({ fileKey: KEY, nodes: 2, assets: 1, skipped: [] });
    expect(await readdir(path.join(o.cacheRoot, KEY))).toEqual(["I1_2_3_4.png"]);
    const snap = JSON.parse(await readFile(path.join(o.snapshotDir, "demo-game.json"), "utf8"));
    expect(snap.frameBySection).toEqual({ home: "f1" });
    expect(snap.nodes.map((n: FigmaNode) => n.id)).toEqual(["f1", "I1:2;3:4"]);
  });

  it("replaces the nodes of the frames it brings and keeps the other frames", async () => {
    const o = await dirs();
    await importFigmaExport("demo-game", zipOf([node("f1", "f1", null), node("a", "f1")]), o);
    await importFigmaExport("demo-game", zipOf([node("f2", "f2", null), node("b", "f2")], {}, { frameBySection: undefined }), o);
    await importFigmaExport("demo-game", zipOf([node("f1", "f1", null), node("c", "f1")]), o);
    const snap = JSON.parse(await readFile(path.join(o.snapshotDir, "demo-game.json"), "utf8"));
    expect(snap.nodes.map((n: FigmaNode) => n.id).sort()).toEqual(["b", "c", "f1", "f2"]);
  });

  it("refuses files that are not what the plugin exports, and never writes outside the cache", async () => {
    const o = await dirs();
    await expect(importFigmaExport("demo-game", new Uint8Array([1, 2, 3]), o)).rejects.toThrow("ZIP");
    await expect(importFigmaExport("demo-game", zipSync({ "x.txt": strToU8("hi") }), o)).rejects.toThrow("nodes.json");
    await expect(importFigmaExport("demo-game", zipOf([node("f1", "f1", null)], {}, { fileKey: "short" }), o)).rejects.toThrow("fileKey");
    await expect(importFigmaExport("../evil", zipOf([]), o)).rejects.toThrow("gameId");

    const res = await importFigmaExport(
      "demo-game",
      zipOf([node("f1", "f1", null), node("ok", "f1")], {
        "assets/ok.png": PNG,
        "assets/ghost.png": PNG,
        "assets/../../evil.png": PNG,
        "assets/ok2.png": strToU8("not a png"),
      }),
      o
    );
    expect(res.assets).toBe(1);
    expect(res.skipped.some((s) => s.startsWith("assets/ghost.png"))).toBe(true);
    expect(res.skipped.some((s) => s.includes("evil.png"))).toBe(true);
    expect(await readdir(path.join(o.cacheRoot, KEY))).toEqual(["ok.png"]);
  });
});
