import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resizeUploadToMatchRemote, type CropAnchor } from "./resize-upload";
import { isRasterOrSvg, persistUpload, readUploadBuffer, sniffVideoExt } from "./upload-store";

/**
 * A picture or video hosted on a CDN has no file to overwrite: the upload is saved under the clone's public/ and the
 * source files that spell the CDN address are rewritten to the new local address (in the CLONE only). The wizard (step 2)
 * and the preview editor share this code.
 */
export interface ExternalSpec {
  url: string;
  localPath: string;
  refFiles: string[];
}

type ExternalManifestEntry = ExternalSpec;

export function getExternalManifestPath(repoPath: string): string {
  return path.join(path.dirname(repoPath), "home-page-uploads-manifest.json");
}

export async function readExternalManifest(repoPath: string): Promise<Record<string, ExternalManifestEntry>> {
  try {
    return JSON.parse(await fs.readFile(getExternalManifestPath(repoPath), "utf-8"));
  } catch {
    return {};
  }
}

export async function writeExternalManifestEntry(repoPath: string, entry: ExternalManifestEntry) {
  const manifest = await readExternalManifest(repoPath);
  manifest[entry.localPath] = entry;
  await fs.writeFile(getExternalManifestPath(repoPath), JSON.stringify(manifest, null, 2));
}

export type ExternalResult =
  | {
      ok: true;
      id: string;
      url: string;
      localPath: string;
      refFilesPatched: string[];
      originalBytes: number;
      finalBytes: number;
      resized: boolean;
    }
  | { ok: false; warning: string };

export async function replaceExternalAsset(
  repoPath: string,
  cloneDir: string,
  spec: ExternalSpec,
  value: FormDataEntryValue,
  anchor: CropAnchor
): Promise<ExternalResult> {
  let localPath = spec.localPath; // the extension may change when the upload is a video of another type
  let uploadBuf: Buffer;
  try {
    uploadBuf = await readUploadBuffer(value);
  } catch (e) {
    return { ok: false, warning: `${localPath}: ${e instanceof Error ? e.message : String(e)}` };
  }
  // A video (the home banner of phuong-hoang-tru-tien is a CDN .mp4) is written as it is: no crop, and its file
  // extension follows the bytes so the <source type> stays right.
  const videoExt = sniffVideoExt(uploadBuf);
  if (!videoExt && !(await isRasterOrSvg(uploadBuf))) {
    return { ok: false, warning: `${localPath}: file không phải ảnh hoặc video (PNG/JPG/WebP/SVG/MP4/WebM) — chưa thay, giữ nguyên asset gốc.` };
  }
  if (videoExt) localPath = localPath.replace(/\.[a-z0-9]+$/i, "") + videoExt;

  // Fetch the CDN URL being replaced to read ITS dimensions, then resize the upload to match — the same "never write
  // an off-size asset" guarantee local file replacement has.
  const finalBuf = videoExt ? uploadBuf : await resizeUploadToMatchRemote(uploadBuf, spec.url, path.extname(localPath), anchor);
  const destPath = path.join(cloneDir, "public", localPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, finalBuf);
  await persistUpload(repoPath, path.join("public", localPath), finalBuf);
  await writeExternalManifestEntry(repoPath, { url: spec.url, localPath, refFiles: spec.refFiles });

  const publicUrl = "/" + localPath.replace(/\\/g, "/");
  const refFilesPatched: string[] = [];
  for (const refFile of spec.refFiles) {
    const srcPath = path.join(cloneDir, refFile);
    if (!existsSync(srcPath)) continue;
    const content = await fs.readFile(srcPath, "utf-8");
    if (!content.includes(spec.url)) continue;
    let patched = content.split(spec.url).join(publicUrl);
    // <source src="/x.webm" type="video/mp4"> would not play: keep the type in step with the new file
    if (videoExt) {
      const mime = videoExt === ".webm" ? "video/webm" : "video/mp4";
      const escaped = publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patched = patched.replace(new RegExp("(src=[{\"'`]+" + escaped + "[^>]*?type=[\"'])video/[a-z0-9]+", "g"), "$1" + mime);
    }
    await fs.writeFile(srcPath, patched);
    refFilesPatched.push(refFile);
  }
  return {
    ok: true,
    id: localPath,
    url: spec.url,
    localPath: publicUrl,
    refFilesPatched,
    originalBytes: uploadBuf.byteLength,
    finalBytes: finalBuf.byteLength,
    resized: finalBuf !== uploadBuf,
  };
}
