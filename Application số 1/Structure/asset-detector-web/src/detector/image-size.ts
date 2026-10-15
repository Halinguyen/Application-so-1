import sharp from "sharp";
import path from "node:path";

/** Pixel size of a repo file, or null when it is missing or not a raster sharp can read (.ico, video…). */
export async function readImageSize(repoPath: string, relPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(path.join(repoPath, relPath)).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}
