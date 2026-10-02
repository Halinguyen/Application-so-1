import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

// "attention" (sharp's saliency-based auto-crop) is the default and works
// well most of the time, but it occasionally misjudges the focal point on
// small/detail assets (icons, buttons, logos) — these let the operator pin
// the crop to a specific edge/corner instead of guessing again.
export type CropAnchor =
  | "attention"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const SHARP_POSITION: Record<Exclude<CropAnchor, "attention">, string> = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  "top-left": "left top",
  "top-right": "right top",
  "bottom-left": "left bottom",
  "bottom-right": "right bottom",
};

function resolvePosition(anchor: CropAnchor): string {
  return anchor === "attention" ? "attention" : SHARP_POSITION[anchor];
}

/**
 * Resizes/compresses an operator-uploaded replacement image to match the
 * EXACT pixel dimensions of the file it's replacing at `targetPath`.
 *
 * Why per-target-path rather than a single "recommended size" passed from
 * the detector: a per-breakpoint asset's tablet and desktop copies are
 * different real files with different real dimensions (the merged/primary
 * asset's `constraints.recommendedWidth/Height` only reflects ONE of them).
 * Reading each target's own current file directly handles that correctly
 * without needing per-variant dimension data plumbed through the client
 * form — and it's exactly the class of bug just fixed for the fake news
 * slides (an image with the wrong intrinsic size breaking a layout that
 * assumes a specific size), now prevented for every real operator upload.
 *
 * Falls back to the original, unresized upload if the target's current
 * dimensions can't be read (missing file, non-raster format) — never
 * blocks the upload outright.
 */
export async function resizeUploadToMatchTarget(
  uploadBuf: Buffer,
  repoPath: string,
  targetPath: string,
  anchor: CropAnchor = "attention",
  maxFileSize = 2 * 1024 * 1024
): Promise<Buffer> {
  const originalAbsPath = path.join(repoPath, targetPath);
  if (!existsSync(originalAbsPath)) return uploadBuf;

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(originalAbsPath).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    return uploadBuf; // not a raster image sharp can read (e.g. .ico) — leave as-is
  }
  if (!width || !height) return uploadBuf;

  return resizeUploadToDimensions(uploadBuf, width, height, path.extname(targetPath), anchor, maxFileSize);
}

/**
 * Same guarantee as resizeUploadToMatchTarget, for external (CDN-hosted)
 * assets that have no local file to read the original's dimensions from:
 * fetches the asset's current remote URL, reads ITS dimensions, then
 * resizes the upload to match — instead of writing the upload's raw,
 * arbitrary dimensions unchecked.
 *
 * Falls back to the original, unresized upload if the URL can't be fetched
 * or isn't a raster image sharp can read (e.g. a video CDN URL) — same
 * never-block guarantee as the local-file path.
 */
export async function resizeUploadToMatchRemote(
  uploadBuf: Buffer,
  sourceUrl: string,
  ext: string,
  anchor: CropAnchor = "attention",
  maxFileSize = 2 * 1024 * 1024
): Promise<Buffer> {
  let width: number | undefined;
  let height: number | undefined;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return uploadBuf;
    const remoteBuf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(remoteBuf).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    return uploadBuf; // network error, or not a raster image (e.g. a video URL) — leave as-is
  }
  if (!width || !height) return uploadBuf;

  return resizeUploadToDimensions(uploadBuf, width, height, ext, anchor, maxFileSize);
}

async function resizeUploadToDimensions(
  uploadBuf: Buffer,
  width: number,
  height: number,
  ext: string,
  anchor: CropAnchor,
  maxFileSize: number
): Promise<Buffer> {
  const normalizedExt = ext.toLowerCase();
  const pipeline = sharp(uploadBuf).resize(width, height, { fit: "cover", position: resolvePosition(anchor) });

  const encode = (quality: number) => {
    if (normalizedExt === ".jpg" || normalizedExt === ".jpeg") return pipeline.clone().jpeg({ quality });
    if (normalizedExt === ".webp") return pipeline.clone().webp({ quality });
    // Default to PNG for .png and anything else raster-replaceable — lossless
    // format, so "quality" here maps to compressionLevel instead.
    return pipeline.clone().png({ compressionLevel: Math.round((100 - quality) / 11) });
  };

  // Compress, then step down quality a few times if still over the cap —
  // good enough for an operator-upload guard, not a full binary search.
  let quality = 82;
  let out = await encode(quality).toBuffer();
  for (let i = 0; i < 3 && out.byteLength > maxFileSize; i++) {
    quality -= 15;
    out = await encode(Math.max(quality, 35)).toBuffer();
  }

  return out;
}
