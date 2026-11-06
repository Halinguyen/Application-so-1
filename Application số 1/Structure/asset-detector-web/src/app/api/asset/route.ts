import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveGame } from "@/detector/config";
import { getCloneDir } from "@/app/api/clone/route";
import { readExternalSlots, readSlots } from "@/detector/layout-store";
import { replaceExternalAsset } from "@/detector/external-replace";
import { allowedTargetPaths, publicPathOf } from "@/detector/asset-match";
import { resizeUploadToMatchTarget, type CropAnchor } from "@/detector/resize-upload";
import { getUploadsDir, isRasterOrSvg, persistUpload, readUploadBuffer, removePersistedUpload } from "@/detector/upload-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANCHORS: CropAnchor[] = ["attention", "crop", "fit", "original", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];

function setup(gameId: string | null) {
  const g = resolveGame(gameId);
  return { ...g, cloneDir: getCloneDir(g.repoPath) };
}

/** Only files that belong to a detected asset slot may be written: nothing else, whatever the client sends. */
async function checkedTargets(repoPath: string, requested: unknown): Promise<string[] | { error: string }> {
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > 12 || !requested.every((x) => typeof x === "string")) {
    return { error: "targetPaths phải là danh sách file của một asset" };
  }
  const allowed = allowedTargetPaths(await readSlots(repoPath));
  const norm = (requested as string[]).map((t) => t.replace(/\\/g, "/"));
  const bad = norm.find((t) => !allowed.has(t));
  if (bad) return { error: `"${bad}" không phải file của asset nào đã nhận diện — không ghi.` };
  return norm;
}

/** GET ?gameId=  ->  the files replaced so far (kept in home-page-uploads), as repo-relative paths. */
export async function GET(request: NextRequest) {
  const { repoPath } = setup(request.nextUrl.searchParams.get("gameId"));
  const root = getUploadsDir(repoPath);
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else out.push(path.relative(root, abs).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return NextResponse.json({ replaced: out.sort() });
}

/**
 * POST multipart: gameId, targetPaths (JSON array of the files to write), anchor, and `file` OR `url`.
 * Same guarantees as the wizard: non-images refused, the picture is cropped/compressed to the EXACT size of
 * each file it replaces, and it is kept so the next "Generate clone" lays it back.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const gameField = form.get("gameId");
    const { repoPath, cloneDir } = setup(typeof gameField === "string" ? gameField : null);

    // A picture/video hosted on a CDN: only an address of a detected external slot may be replaced
    const externalUrl = form.get("external");
    if (typeof externalUrl === "string" && externalUrl !== "") {
      const slot = (await readExternalSlots(repoPath)).find((x) => x.url === externalUrl);
      if (!slot) return NextResponse.json({ error: "Địa chỉ này không phải asset ngoài đã nhận diện — không thay." }, { status: 400 });
      const value = form.get("file") ?? form.get("url");
      if (value === null || (typeof value === "string" && value.trim() === "")) return NextResponse.json({ error: "Chưa chọn file hoặc dán link." }, { status: 400 });
      if (!existsSync(cloneDir)) return NextResponse.json({ error: "Chưa có bản sao — bấm Tạo bản sao trước." }, { status: 409 });
      const a = String(form.get("anchor") ?? "attention") as CropAnchor;
      const r = await replaceExternalAsset(repoPath, cloneDir, { url: slot.url, localPath: slot.localPath, refFiles: slot.refFiles }, value, ANCHORS.includes(a) ? a : "attention");
      if (!r.ok) return NextResponse.json({ error: r.warning }, { status: 400 });
      return NextResponse.json({ external: { localPath: r.localPath, refFilesPatched: r.refFilesPatched } });
    }

    const targets = await checkedTargets(repoPath, JSON.parse(String(form.get("targetPaths") ?? "null")));
    if (!Array.isArray(targets)) return NextResponse.json(targets, { status: 400 });

    const anchorRaw = String(form.get("anchor") ?? "attention") as CropAnchor;
    const anchor = ANCHORS.includes(anchorRaw) ? anchorRaw : "attention";

    const value = form.get("file") ?? form.get("url");
    if (value === null || (typeof value === "string" && value.trim() === "")) {
      return NextResponse.json({ error: "Chưa chọn file hoặc dán link ảnh." }, { status: 400 });
    }
    if (!existsSync(cloneDir)) return NextResponse.json({ error: "Chưa có bản sao — bấm Tạo bản sao trước." }, { status: 409 });

    let upload: Buffer;
    try {
      upload = await readUploadBuffer(value);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
    if (!(await isRasterOrSvg(upload))) {
      return NextResponse.json({ error: "File này không phải ảnh (PNG/JPG/WebP/SVG) — chưa thay, giữ ảnh gốc." }, { status: 400 });
    }

    const replaced: { targetPath: string; publicPath: string; bytes: number }[] = [];
    for (const targetPath of targets) {
      const finalBuf = await resizeUploadToMatchTarget(upload, repoPath, targetPath, anchor);
      const dest = path.join(cloneDir, targetPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, finalBuf);
      await persistUpload(repoPath, targetPath, finalBuf);
      replaced.push({ targetPath, publicPath: publicPathOf(targetPath), bytes: finalBuf.byteLength });
    }
    return NextResponse.json({ replaced });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** DELETE ?gameId=&targetPath=a&targetPath=b  ->  puts the template's own files back (and forgets the upload). */
export async function DELETE(request: NextRequest) {
  try {
    const { repoPath, cloneDir } = setup(request.nextUrl.searchParams.get("gameId"));
    const targets = await checkedTargets(repoPath, request.nextUrl.searchParams.getAll("targetPath"));
    if (!Array.isArray(targets)) return NextResponse.json(targets, { status: 400 });
    const restored: { targetPath: string; publicPath: string }[] = [];
    for (const targetPath of targets) {
      const original = path.join(repoPath, targetPath);
      if (existsSync(original) && existsSync(cloneDir)) {
        const dest = path.join(cloneDir, targetPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(original, dest);
      }
      await removePersistedUpload(repoPath, targetPath);
      restored.push({ targetPath, publicPath: publicPathOf(targetPath) });
    }
    return NextResponse.json({ restored });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
