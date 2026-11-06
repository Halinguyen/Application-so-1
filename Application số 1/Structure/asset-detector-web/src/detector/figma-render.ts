import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { padToNodeFrame } from "./figma-frame";
import type { FigmaNode } from "./figma-match";

// Renders of Figma nodes, cached on disk. Figma's render endpoint has a very small quota on a Starter plan (one call can lock
// it for days), so nodes are always asked for in batches, never one by one when several are needed.

const CHUNK = 100;

export class FigmaRenderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const DEFAULT_CACHE_ROOT = () => path.join(process.cwd(), ".figma-cache");
const cacheFile = (root: string, fileKey: string, nodeId: string) => path.join(root, fileKey, `${nodeId.replace(/[:;]/g, "_")}.png`);

export async function readCachedRender(fileKey: string, node: FigmaNode, cacheRoot = DEFAULT_CACHE_ROOT()): Promise<Buffer | null> {
  try {
    return await padToNodeFrame(await readFile(cacheFile(cacheRoot, fileKey, node.id)), node);
  } catch {
    return null;
  }
}

/** Renders the nodes that are not cached yet in as few Figma calls as possible and caches them. Returns the ids now available. */
export async function renderMissing(
  fileKey: string,
  nodes: FigmaNode[],
  token: string,
  cacheRoot = DEFAULT_CACHE_ROOT()
): Promise<{ rendered: string[]; failed: string[] }> {
  const missing: FigmaNode[] = [];
  for (const n of nodes) if (!(await readCachedRender(fileKey, n, cacheRoot))) missing.push(n);
  const rendered: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const res = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?format=png&scale=2&use_absolute_bounds=true&ids=${encodeURIComponent(chunk.map((n) => n.id).join(","))}`,
      { headers: { "X-Figma-Token": token } }
    );
    if (res.status === 429) {
      const hours = Math.ceil(Number(res.headers.get("Retry-After") ?? 0) / 3600);
      throw new FigmaRenderError(`Figma đang giới hạn tốc độ gọi API${hours ? `, thử lại sau khoảng ${hours} giờ` : ""}`, 429);
    }
    if (!res.ok) throw new FigmaRenderError(`Figma trả lỗi ${res.status}`, 502);
    const urls = ((await res.json()) as { images?: Record<string, string | null> }).images ?? {};
    for (const n of chunk) {
      const url = urls[n.id];
      const img = url ? await fetch(url).catch(() => null) : null;
      if (!img?.ok) {
        failed.push(n.id);
        continue;
      }
      const file = cacheFile(cacheRoot, fileKey, n.id);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await img.arrayBuffer()));
      rendered.push(n.id);
    }
  }
  return { rendered, failed };
}
