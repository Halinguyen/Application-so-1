import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { initializeCanvas, readPsd, type Layer } from "ag-psd";

// ag-psd wants a canvas factory even in useImageData mode. We never draw, so a
// plain RGBA buffer is enough and avoids a native canvas dependency.
initializeCanvas(
  () => {
    throw new Error("canvas is not available — PSD is read as raw image data");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData
);

// Parses an operator-supplied PSD into a flat list of exportable "candidates"
// (visible raster layers + groups with 2+ visible layers) and caches each as a
// PNG in the OS temp dir so the wizard can show thumbnails and later fetch the
// full-size image without re-parsing the PSD. Layer names in real design files
// are unreliable, so we also expose bounds — the matcher leans on ratio/size.

export interface PsdLayerInfo {
  id: number;
  name: string;
  /** "Group / Sub / Layer" — group names are often more descriptive than the layer's own. */
  path: string;
  kind: "layer" | "group";
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PsdInfo {
  psdId: string;
  width: number;
  height: number;
  layers: PsdLayerInfo[];
}

const CACHE_ROOT = path.join(os.tmpdir(), "asset-detector-psd");
const MIN_SIDE = 8;
const MAX_CANDIDATES = 400;

/** Largest PSD we accept (upload or link). Decoding needs several times this in RAM. */
export const MAX_PSD_BYTES = 1024 * 1024 * 1024;

export const PSD_ID_RE = /^[a-f0-9]{16}$/;

function cacheDir(psdId: string) {
  return path.join(CACHE_ROOT, psdId);
}

interface Leaf {
  layer: Layer;
  raw: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
}

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function parsePsd(buf: Buffer): Promise<PsdInfo> {
  const psdId = createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const dir = cacheDir(psdId);
  const metaPath = path.join(dir, "meta.json");
  if (await exists(metaPath)) return JSON.parse(await readFile(metaPath, "utf8")) as PsdInfo;

  const psd = readPsd(buf, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true, totalMemoryLimit: 4 * 1024 * 1024 * 1024 });
  await mkdir(dir, { recursive: true });

  const layers: PsdLayerInfo[] = [];
  let nextId = 0;

  // Returns visible leaves under `list` (in paint order) so a parent group can
  // composite them. Emits candidates as a side effect.
  async function walk(list: Layer[] | undefined, prefix: string, hiddenParent: boolean): Promise<Leaf[]> {
    const collected: Leaf[] = [];
    for (const layer of list ?? []) {
      const hidden = hiddenParent || !!layer.hidden;
      const name = layer.name || "(không tên)";
      const fullPath = prefix ? `${prefix} / ${name}` : name;

      if (layer.children) {
        const leaves = await walk(layer.children, fullPath, hidden);
        collected.push(...leaves);
        if (!hidden && leaves.length >= 2 && layers.length < MAX_CANDIDATES) {
          const left = Math.min(...leaves.map((l) => l.left));
          const top = Math.min(...leaves.map((l) => l.top));
          const right = Math.max(...leaves.map((l) => l.left + l.width));
          const bottom = Math.max(...leaves.map((l) => l.top + l.height));
          const width = right - left;
          const height = bottom - top;
          if (width >= MIN_SIDE && height >= MIN_SIDE) {
            const png = await sharp({
              create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
            })
              .composite(
                leaves.map((l) => ({
                  input: l.raw,
                  raw: { width: l.width, height: l.height, channels: 4 as const },
                  left: l.left - left,
                  top: l.top - top,
                }))
              )
              .png()
              .toBuffer();
            const id = nextId++;
            await writeFile(path.join(dir, `${id}.png`), png);
            layers.push({ id, name, path: fullPath, kind: "group", left, top, width, height });
          }
        }
        continue;
      }

      const data = layer.imageData;
      if (hidden || !data || data.width < MIN_SIDE || data.height < MIN_SIDE) continue;
      const raw = Buffer.from(data.data.buffer, data.data.byteOffset, data.data.byteLength);
      const leaf: Leaf = {
        layer,
        raw,
        left: layer.left ?? 0,
        top: layer.top ?? 0,
        width: data.width,
        height: data.height,
      };
      collected.push(leaf);
      if (layers.length < MAX_CANDIDATES) {
        const png = await sharp(raw, { raw: { width: data.width, height: data.height, channels: 4 } })
          .png()
          .toBuffer();
        const id = nextId++;
        await writeFile(path.join(dir, `${id}.png`), png);
        layers.push({ id, name, path: fullPath, kind: "layer", left: leaf.left, top: leaf.top, width: data.width, height: data.height });
      }
    }
    return collected;
  }

  await walk(psd.children, "", false);

  const info: PsdInfo = { psdId, width: psd.width, height: psd.height, layers };
  await writeFile(metaPath, JSON.stringify(info));
  return info;
}

/** Full-size PNG, or a downscaled thumbnail (cached next to it). Null if unknown. */
export async function readLayerPng(psdId: string, layerId: number, thumb: boolean): Promise<Buffer | null> {
  if (!PSD_ID_RE.test(psdId) || !Number.isInteger(layerId) || layerId < 0) return null;
  const full = path.join(cacheDir(psdId), `${layerId}.png`);
  if (!(await exists(full))) return null;
  if (!thumb) return readFile(full);
  const thumbPath = path.join(cacheDir(psdId), `${layerId}.t.png`);
  if (await exists(thumbPath)) return readFile(thumbPath);
  const out = await sharp(full).resize(240, 240, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  await writeFile(thumbPath, out);
  return out;
}
