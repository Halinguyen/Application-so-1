import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

// "attention" (sharp's saliency-based auto-crop) is the default and works
// well most of the time, but it occasionally misjudges the focal point on
// small/detail assets (icons, buttons, logos) — these let the operator pin
// the crop to a specific edge/corner instead of guessing again.
// "attention" is also AUTOMATIC about the shape: when the upload and the target differ a lot in proportion (a wide banner for a
// tall phone banner), cutting a slice would throw most of the picture away, so the whole picture is kept instead (see
// FIT_RATIO). "crop" always cuts (the salient part), "fit" always keeps the whole picture inside the frame of the original file,
// "original" keeps the picture's own proportion (the file is not forced into the original file's frame at all).
export type CropAnchor =
  | "attention"
  | "crop"
  | "fit"
  | "original"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const SHARP_POSITION: Record<Exclude<CropAnchor, "attention" | "crop" | "fit" | "original">, string> = {
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
  return anchor === "attention" || anchor === "crop" || anchor === "fit" || anchor === "original" ? "attention" : SHARP_POSITION[anchor];
}

/** Sizes packed into a favicon.ico built from an upload. */
const ICO_SIZES = [16, 32, 48];

/**
 * Builds a real .ico (PNG images packed in an ICO container: 16, 32 and 48 px) from an uploaded picture, so the one
 * picture that fills the whole icon family also gives a valid favicon.ico instead of raw PNG bytes under a .ico name.
 */
export async function buildIco(uploadBuf: Buffer, anchor: CropAnchor = "attention"): Promise<Buffer> {
  const pngs: Buffer[] = [];
  for (const size of ICO_SIZES) {
    pngs.push(await sharp(uploadBuf).resize(size, size, { fit: "cover", position: resolvePosition(anchor) }).png({ compressionLevel: 9 }).toBuffer());
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + entries.length;
  pngs.forEach((png, i) => {
    const o = i * 16;
    entries.writeUInt8(ICO_SIZES[i], o); // width (0 would mean 256)
    entries.writeUInt8(ICO_SIZES[i], o + 1); // height
    entries.writeUInt8(0, o + 2); // palette
    entries.writeUInt8(0, o + 3); // reserved
    entries.writeUInt16LE(1, o + 4); // colour planes
    entries.writeUInt16LE(32, o + 6); // bits per pixel
    entries.writeUInt32LE(png.length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...pngs]);
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
  // sharp cannot read or write .ico: pack the upload into a proper icon file
  if (path.extname(targetPath).toLowerCase() === ".ico") return buildIco(uploadBuf, anchor).catch(() => uploadBuf);
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

/** Proportion difference (as a factor) above which "attention" keeps the whole picture instead of cutting a slice of it. */
export const FIT_RATIO = 1.8;

/**
 * When the whole picture should be kept: the upload is laid on a canvas of the target's exact size. A picture with
 * transparency (logo, button) gets transparent padding; a photo/artwork gets a blurred, enlarged copy of itself behind it.
 * Returns null when the picture is to be cut as usual.
 */
export async function keepWholePicture(uploadBuf: Buffer, width: number, height: number, anchor: CropAnchor, ext = ".png"): Promise<Buffer | null> {
  if (anchor !== "fit" && anchor !== "attention") return null;
  const meta = await sharp(uploadBuf).metadata();
  if (!meta.width || !meta.height) return null;
  const src = meta.width / meta.height;
  const dst = width / height;
  const factor = Math.max(src / dst, dst / src);
  if (anchor === "attention" && factor <= FIT_RATIO) return null;
  if (factor < 1.02) return null; // same shape: nothing to keep apart

  // Transparent padding only when the picture really has see-through pixels AND the target format can hold them (a PNG saved
  // with an all-opaque alpha channel, or a .jpg target, would turn the padding black).
  const seeThrough = !!meta.hasAlpha && !(await sharp(uploadBuf).stats()).isOpaque && !/^\.jpe?g$/i.test(ext);
  let insideSrc = sharp(uploadBuf);
  if (meta.hasAlpha && !seeThrough) insideSrc = insideSrc.flatten({ background: "#ffffff" });
  const inside = await insideSrc.resize(width, height, { fit: "inside" }).png().toBuffer();
  if (seeThrough) {
    return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: inside, gravity: "centre" }])
      .png()
      .toBuffer();
  }
  const backdrop = await sharp(uploadBuf).flatten({ background: "#ffffff" }).resize(width, height, { fit: "cover", position: "attention" }).blur(28).modulate({ brightness: 0.75 }).png().toBuffer();
  return sharp(backdrop).composite([{ input: inside, gravity: "centre" }]).png().toBuffer();
}

async function resizeUploadToDimensions(
  uploadBuf: Buffer,
  width: number,
  height: number,
  ext: string,
  anchor: CropAnchor,
  maxFileSize: number
): Promise<Buffer> {
  // Not a raster image sharp can decode (a video uploaded into an image slot,
  // a corrupt file…): keep the upload untouched instead of failing the whole clone.
  if (!(await sharp(uploadBuf).metadata().then(() => true, () => false))) return uploadBuf;

  const normalizedExt = ext.toLowerCase();
  const source = await keepWholePicture(uploadBuf, width, height, anchor, normalizedExt);
  // "original": the file keeps the proportion of the picture the operator gave (scaled to fit inside the original file's size, no
  // crop, no padding). For a picture the page lays out by its own proportion (w-full, height follows the file).
  const pipeline =
    anchor === "original"
      ? sharp(uploadBuf).resize(width, height, { fit: "inside" })
      : sharp(source ?? uploadBuf).resize(width, height, { fit: "cover", position: resolvePosition(anchor) });

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
