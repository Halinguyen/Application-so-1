import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { toDirectUrl } from "./share-link";

// Shared by the clone route (wizard step 2) and the asset API (replace from the preview editor), so
// both accept exactly the same inputs and keep the same guarantees.

/**
 * Every "Generate clone" wipes the clone dir and rebuilds it from the template, so operator uploads are
 * kept here and laid back over the fresh copy. Mirrors the clone dir's own relative layout.
 */
export function getUploadsDir(repoPath: string): string {
  return path.join(path.dirname(repoPath), "home-page-uploads");
}

export async function persistUpload(repoPath: string, relativePath: string, buf: Buffer): Promise<void> {
  const dest = path.join(getUploadsDir(repoPath), relativePath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

/** Forgets a persisted upload (the template's own file shows again on the next clone). */
export async function removePersistedUpload(repoPath: string, relativePath: string): Promise<void> {
  await fs.rm(path.join(getUploadsDir(repoPath), relativePath), { force: true });
}

// A slot's replacement image can arrive either as an uploaded File or, when the operator pastes a URL
// instead of picking a file, as a plain string — fetched server-side (not from the browser) so it isn't
// subject to the CDN's CORS policy.
export async function readUploadBuffer(value: FormDataEntryValue): Promise<Buffer> {
  if (value instanceof File) {
    return Buffer.from(await value.arrayBuffer());
  }
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) throw new Error("no file or URL provided");
  if (!/^https?:\/\//i.test(url)) throw new Error(`unsupported URL: ${url}`);
  // Drive/Dropbox share links are web pages - turn them into direct downloads.
  const res = await fetch(toDirectUrl(url));
  if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
  // A page instead of media (login wall, unshared file) would otherwise be saved as the image.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error(`link trả về trang web chứ không phải file ảnh (cần chia sẻ công khai hoặc dùng link tải trực tiếp): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function isRasterOrSvg(buf: Buffer): Promise<boolean> {
  if (await sharp(buf).metadata().then(() => true, () => false)) return true;
  return /^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 256).toString("utf8"));
}
