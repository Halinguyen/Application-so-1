import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import type { FigmaNode } from "./figma-match";

// The Local Asset Repository: what a one-time Figma export (ZIP) leaves on this machine, so mapping never needs Figma again.
//
//   export.zip
//     nodes.json            { fileKey, frameBySection?, nodes: FigmaNode[] }
//     assets/<nodeId>.png   one PNG per exported node ("I74:387;74:370" is written "I74_387_74_370")
//
// nodes.json goes into figma-snapshots/<game>.json (layer names, sizes, ids); the PNGs into .figma-cache/<fileKey>/.

export interface ImportOptions {
  cacheRoot?: string;
  snapshotDir?: string;
}

export interface ImportResult {
  fileKey: string;
  nodes: number;
  assets: number;
  /** Files in the ZIP that were not used, with the reason. */
  skipped: string[];
  warnings: string[];
}

const MAX_UNZIPPED = 400 * 1024 * 1024;
const ASSET_NAME = /^assets\/([A-Za-z0-9_.-]+)\.png$/;

export const assetFileName = (nodeId: string) => nodeId.replace(/[:;]/g, "_");

function isNode(n: unknown): n is FigmaNode {
  const o = n as FigmaNode;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.type === "string" &&
    typeof o.frame === "string" &&
    typeof o.w === "number" &&
    typeof o.h === "number" &&
    (o.parent === null || typeof o.parent === "string")
  );
}

export async function importFigmaExport(gameId: string, zip: Uint8Array, opts: ImportOptions = {}): Promise<ImportResult> {
  const cacheRoot = opts.cacheRoot ?? path.join(process.cwd(), ".figma-cache");
  const snapshotDir = opts.snapshotDir ?? path.join(process.cwd(), "src/detector/figma-snapshots");
  if (!/^[a-z0-9-]+$/.test(gameId)) throw new Error("gameId không hợp lệ");

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => f.originalSize <= MAX_UNZIPPED });
  } catch {
    throw new Error("Không đọc được file ZIP.");
  }
  if (Object.values(files).reduce((sum, f) => sum + f.byteLength, 0) > MAX_UNZIPPED) throw new Error("ZIP quá lớn (giới hạn 400MB sau khi giải nén).");

  const metaFile = files["nodes.json"];
  if (!metaFile) throw new Error("ZIP thiếu nodes.json (đây không phải bản export của plugin).");
  let meta: { fileKey?: unknown; frameBySection?: Record<string, string>; nodes?: unknown };
  try {
    meta = JSON.parse(new TextDecoder().decode(metaFile));
  } catch {
    throw new Error("nodes.json không phải JSON hợp lệ.");
  }
  if (typeof meta.fileKey !== "string" || !/^[0-9a-zA-Z]{22,128}$/.test(meta.fileKey)) {
    throw new Error("nodes.json thiếu fileKey hợp lệ (đoạn 22+ ký tự trong đường link Figma).");
  }
  if (!Array.isArray(meta.nodes) || !meta.nodes.every(isNode)) throw new Error("nodes.json: danh sách node sai định dạng.");
  const nodes = meta.nodes as FigmaNode[];
  const known = new Set(nodes.map((n) => assetFileName(n.id)));

  const skipped: string[] = [];
  const warnings: string[] = [];
  const dir = path.join(cacheRoot, meta.fileKey);
  await mkdir(dir, { recursive: true });
  let assets = 0;
  for (const [name, bytes] of Object.entries(files)) {
    if (name === "nodes.json" || name.endsWith("/")) continue;
    const m = name.match(ASSET_NAME);
    if (!m) {
      skipped.push(`${name}: không phải assets/<nodeId>.png`);
    } else if (!known.has(m[1])) {
      skipped.push(`${name}: không có node tương ứng trong nodes.json`);
    } else if (bytes[0] !== 0x89 || bytes[1] !== 0x50) {
      skipped.push(`${name}: không phải ảnh PNG`);
    } else {
      await writeFile(path.join(dir, `${m[1]}.png`), bytes);
      assets++;
    }
  }

  // Merge into the game's snapshot: the frames in this export replace their old nodes, the other frames are kept.
  const snapshotFile = path.join(snapshotDir, `${gameId}.json`);
  let previous: { frameBySection?: Record<string, string>; nodes?: FigmaNode[]; fileKey?: string } = {};
  try {
    previous = JSON.parse(await readFile(snapshotFile, "utf8"));
  } catch {
    // first import for this game
  }
  const sameFile = previous.fileKey === undefined || previous.fileKey === meta.fileKey;
  const frameBySection = meta.frameBySection ?? (sameFile ? previous.frameBySection : undefined) ?? {};
  if (Object.keys(frameBySection).length === 0) {
    warnings.push("Chưa có frameBySection (section → frame Figma): wizard sẽ không đề xuất gì cho tới khi khai báo.");
  }
  const importedFrames = new Set(nodes.map((n) => n.frame));
  const kept = sameFile ? (previous.nodes ?? []).filter((n) => !importedFrames.has(n.frame)) : [];
  if (assets === 0) warnings.push("ZIP không có ảnh nào dùng được.");
  const withoutImage = nodes.filter((n) => n.visible && n.parent !== null && n.hasImage && !known.has(assetFileName(n.id))).length;
  if (withoutImage > 0) warnings.push(`${withoutImage} node có trong nodes.json nhưng không có file ảnh.`);

  await mkdir(snapshotDir, { recursive: true });
  await writeFile(
    snapshotFile,
    JSON.stringify({ game: gameId, fileKey: meta.fileKey, capturedAt: new Date().toISOString(), frameBySection, nodes: [...kept, ...nodes] })
  );
  return { fileKey: meta.fileKey, nodes: nodes.length, assets, skipped, warnings };
}
