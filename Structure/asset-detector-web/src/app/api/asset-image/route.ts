import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveGame } from "@/detector/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get("path");
  if (!rel) {
    return NextResponse.json({ error: "missing ?path=" }, { status: 400 });
  }
  const { repoPath } = resolveGame(request.nextUrl.searchParams.get("game"));

  // rel is a canonicalPath as layer1-filesystem.ts recorded it — repo-relative
  // from repoPath, already carrying whichever static-root folder that
  // framework uses ("public/assets/..." for Vite/Next, "wwwroot/..." for
  // .NET). Resolving straight against repoPath (not a hardcoded "public"
  // join) works for all of them without the caller needing to know or strip
  // the framework's root folder name. Still refuse anything that escapes
  // repoPath (defense against a crafted ../.. path param).
  const resolved = path.resolve(repoPath, rel);
  if (!resolved.startsWith(repoPath + path.sep) && resolved !== repoPath) {
    return NextResponse.json({ error: "path outside repo" }, { status: 400 });
  }

  try {
    const buf = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
