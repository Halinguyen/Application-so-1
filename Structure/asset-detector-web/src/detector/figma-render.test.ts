import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FigmaNode } from "./figma-match";
import { FigmaRenderError, readCachedRender, renderMissing } from "./figma-render";

const node = (id: string): FigmaNode => ({ id, name: id, type: "RECTANGLE", parent: null, frame: "f", w: 20, h: 10, visible: true, hasImage: false, solid: false });
const png = () => sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();

afterEach(() => vi.unstubAllGlobals());

function stubFigma(onApi: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    if (input.startsWith("https://api.figma.com/")) {
      calls.push(input);
      return onApi(input);
    }
    return new Response(new Uint8Array(await png()));
  });
  return calls;
}

describe("renderMissing", () => {
  it("renders many nodes in ONE Figma call and never asks again for cached ones", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "figma-cache-"));
    const nodes = ["1:1", "1:2", "I9:9;3:4"].map(node);
    const calls = stubFigma(() => Response.json({ images: { "1:1": "https://s3/a", "1:2": "https://s3/b", "I9:9;3:4": "https://s3/c" } }));

    const first = await renderMissing("KEY", nodes, "tok", root);
    expect(first.rendered).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain("ids=1:1,1:2,I9:9;3:4");
    expect(await readCachedRender("KEY", nodes[2], root)).not.toBeNull();

    await renderMissing("KEY", nodes, "tok", root);
    expect(calls).toHaveLength(1); // nothing left to ask for
  });

  it("reports Figma's rate limit with the wait, and a node Figma could not render as failed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "figma-cache-"));
    stubFigma(() => new Response("{}", { status: 429, headers: { "Retry-After": "7200" } }));
    await expect(renderMissing("KEY", [node("1:1")], "tok", root)).rejects.toMatchObject({ status: 429, message: expect.stringContaining("2 giờ") });
    await expect(renderMissing("KEY", [node("1:1")], "tok", root)).rejects.toBeInstanceOf(FigmaRenderError);

    stubFigma(() => Response.json({ images: { "1:1": null } }));
    expect(await renderMissing("KEY", [node("1:1")], "tok", root)).toEqual({ rendered: [], failed: ["1:1"] });
  });
});
