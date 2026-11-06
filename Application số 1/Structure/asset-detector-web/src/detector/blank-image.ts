import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";

/**
 * Writes a fully transparent image over `targetPath` in the clone, with the dimensions of the template's own file, so the
 * image disappears from the page without anything around it moving.
 * Returns the bytes, or a warning when the format cannot be transparent / the original cannot be read.
 */
export async function writeBlankImage(repoPath: string, cloneDir: string, targetPath: string): Promise<{ buf: Buffer } | string> {
  const ext = path.extname(targetPath).toLowerCase();
  if (ext !== ".png" && ext !== ".webp") return `${targetPath}: định dạng ${ext || "?"} không trong suốt được — giữ ảnh gốc.`;
  let meta: Metadata;
  try {
    meta = await sharp(path.join(repoPath, targetPath)).metadata();
  } catch {
    return `${targetPath}: không đọc được ảnh gốc để làm trống — giữ ảnh gốc.`;
  }
  if (!meta.width || !meta.height) return `${targetPath}: không biết kích thước ảnh gốc — giữ ảnh gốc.`;
  const blank = sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const buf = await (ext === ".png" ? blank.png({ compressionLevel: 9 }) : blank.webp({ lossless: true })).toBuffer();
  const dest = path.join(cloneDir, targetPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return { buf };
}
