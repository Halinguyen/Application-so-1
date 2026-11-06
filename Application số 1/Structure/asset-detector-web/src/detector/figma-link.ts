import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FigmaNode } from "./figma-match";

// "Paste a Figma link" path of the Local Asset Repository: reads the node tree of the linked frames through the REST API (one
// call, no renders) and merges it into figma-snapshots/<game>.json exactly like a ZIP import does. The PNGs are rendered later,
// in batches, by /api/figma/prefetch, so the render quota is spent once and only on nodes the wizard proposes.

export class FigmaLinkError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface FigmaLink {
  fileKey: string;
  /** Frames named in the link's node-id (empty: the page's top-level frames are used). */
  nodeIds: string[];
}

const CANDIDATE_TYPES = new Set(["RECTANGLE", "INSTANCE", "GROUP", "FRAME", "COMPONENT"]);

export function parseFigmaUrl(raw: string): FigmaLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(url.hostname)) return null;
  // /design/<key>/<name>, /file/<key>/<name>, and /design/<key>/branch/<branchKey>/<name> (the branch has its own key)
  const parts = url.pathname.split("/").filter(Boolean);
  if (!["design", "file"].includes(parts[0] ?? "")) return null;
  const fileKey = parts[2] === "branch" ? parts[3] : parts[1];
  if (!fileKey || !/^[0-9a-zA-Z]{22,128}$/.test(fileKey)) return null;
  const node = url.searchParams.get("node-id");
  return { fileKey, nodeIds: node ? node.split(",").map((n) => n.replace(/-/g, ":")) : [] };
}

interface ApiNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  fills?: { type: string; visible?: boolean }[];
  characters?: string;
  absoluteBoundingBox?: { width: number; height: number };
  children?: ApiNode[];
}

const hasImageFill = (n: ApiNode) => !!n.fills?.some((f) => f.type === "IMAGE" && f.visible !== false);
const isSolid = (n: ApiNode) => n.type === "RECTANGLE" && !hasImageFill(n) && !!n.fills?.some((f) => f.type === "SOLID" && f.visible !== false);

/** Same node list the export plugin writes to nodes.json (see figma-exporter/code.js), built from the REST tree of the given frames. */
export function nodesFromFrames(frames: ApiNode[]): FigmaNode[] {
  const nodes: FigmaNode[] = [];
  const walk = (node: ApiNode, parent: string, frame: string) => {
    const box = node.absoluteBoundingBox;
    if (box) {
      const info: FigmaNode = {
        id: node.id,
        name: node.name,
        type: node.type,
        parent,
        frame,
        w: Math.round(box.width),
        h: Math.round(box.height),
        visible: node.visible !== false,
        hasImage: hasImageFill(node),
        solid: isSolid(node),
      };
      if (node.type === "TEXT") info.text = String(node.characters ?? "").slice(0, 60);
      nodes.push(info);
    }
    for (const c of node.children ?? []) walk(c, node.id, frame);
  };
  for (const f of frames) {
    const box = f.absoluteBoundingBox;
    nodes.push({ id: f.id, name: f.name, type: f.type, parent: null, frame: f.id, w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0), visible: true, hasImage: false, solid: false });
    for (const c of f.children ?? []) walk(c, f.id, f.id);
  }
  return nodes;
}

/** Nodes that can be rendered as an asset (the plugin's rule): drawn, a container/shape, slot-sized. */
export const isRenderable = (n: FigmaNode) =>
  n.visible && n.parent !== null && CANDIDATE_TYPES.has(n.type) && n.w >= 8 && n.h >= 8 && n.w <= 4000 && n.h <= 4000;

// Section -> frame, by the frame's name. Only the page sections the matcher knows; a name that fits none is left out
// (the operator is told) rather than guessed.
const FRAME_RULES: { test: RegExp; sections: string[] }[] = [
  { test: /trang\s*ch[uủ]|home/i, sections: ["home-news", "home-banner", "float-home", "header"] },
  { test: /x[eế]p\s*h[aạ]ng|rank/i, sections: ["rank", "home-rank"] },
];

export function inferFrameBySection(nodes: FigmaNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of nodes.filter((n) => n.parent === null)) {
    const rule = FRAME_RULES.find((r) => r.test.test(f.name));
    if (rule) for (const s of rule.sections) out[s] ??= f.id;
  }
  return out;
}

async function figmaGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (res.status === 429) throw new FigmaLinkError("Figma đang giới hạn tốc độ gọi API, thử lại sau.", 429);
  if (res.status === 403 || res.status === 401) throw new FigmaLinkError("FIGMA_TOKEN không có quyền đọc file này (cần scope file_content:read).", 403);
  if (res.status === 404) throw new FigmaLinkError("Không tìm thấy file/frame Figma trong link.", 404);
  if (!res.ok) throw new FigmaLinkError(`Figma trả lỗi ${res.status}`, 502);
  return (await res.json()) as T;
}

export async function fetchFrames(link: FigmaLink, token: string): Promise<ApiNode[]> {
  let ids = link.nodeIds;
  if (ids.length === 0) {
    // No node in the link: every top-level frame of the first page.
    const file = await figmaGet<{ document: { children: { children?: ApiNode[] }[] } }>(`https://api.figma.com/v1/files/${link.fileKey}?depth=2`, token);
    ids = (file.document.children[0]?.children ?? []).filter((n) => n.type === "FRAME").map((n) => n.id);
    if (ids.length === 0) throw new FigmaLinkError("Trang đầu của file Figma không có frame nào.", 422);
  }
  const res = await figmaGet<{ nodes: Record<string, { document: ApiNode } | null> }>(
    `https://api.figma.com/v1/files/${link.fileKey}/nodes?ids=${encodeURIComponent(ids.join(","))}`,
    token
  );
  const frames = ids.map((id) => res.nodes[id]?.document).filter((d): d is ApiNode => !!d);
  if (frames.length === 0 || frames.some((f) => f.type !== "FRAME")) {
    throw new FigmaLinkError("Link phải trỏ tới frame (trang) của thiết kế, không phải layer con; chọn frame rồi sao chép lại link.", 422);
  }
  return frames;
}

export interface LinkResult {
  fileKey: string;
  frames: string[];
  nodes: number;
  /** Nodes that still need a render before they can be reviewed (see /api/figma/prefetch). */
  renderable: number;
  warnings: string[];
}

export async function importFigmaLink(
  gameId: string,
  rawUrl: string,
  token: string,
  snapshotDir = path.join(process.cwd(), "src/detector/figma-snapshots")
): Promise<LinkResult> {
  if (!/^[a-z0-9-]+$/.test(gameId)) throw new FigmaLinkError("gameId không hợp lệ", 400);
  const link = parseFigmaUrl(rawUrl);
  if (!link) throw new FigmaLinkError("Không phải link Figma dạng figma.com/design/<file>/…", 400);

  const frames = await fetchFrames(link, token);
  const nodes = nodesFromFrames(frames);

  const snapshotFile = path.join(snapshotDir, `${gameId}.json`);
  let previous: { fileKey?: string; frameBySection?: Record<string, string>; nodes?: FigmaNode[] } = {};
  try {
    previous = JSON.parse(await readFile(snapshotFile, "utf8"));
  } catch {
    // first import for this game
  }
  const sameFile = previous.fileKey === undefined || previous.fileKey === link.fileKey;
  // A hand-declared mapping of an earlier import wins over the guess from frame names.
  const frameBySection = { ...inferFrameBySection(nodes), ...(sameFile ? previous.frameBySection : undefined) };
  const importedFrames = new Set(nodes.map((n) => n.frame));
  const kept = sameFile ? (previous.nodes ?? []).filter((n) => !importedFrames.has(n.frame)) : [];

  const warnings: string[] = [];
  if (Object.keys(frameBySection).length === 0) {
    warnings.push(`Không đoán được frame nào ứng với section nào từ tên frame (${frames.map((f) => f.name).join(", ")}): cần khai báo frameBySection.`);
  }
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(snapshotFile, JSON.stringify({ game: gameId, fileKey: link.fileKey, capturedAt: new Date().toISOString(), frameBySection, nodes: [...kept, ...nodes] }));
  return { fileKey: link.fileKey, frames: frames.map((f) => f.name), nodes: nodes.length, renderable: nodes.filter(isRenderable).length, warnings };
}
