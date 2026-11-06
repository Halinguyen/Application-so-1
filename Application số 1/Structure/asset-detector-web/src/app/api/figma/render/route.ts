import { NextRequest, NextResponse } from "next/server";
import { loadFigmaSnapshot } from "@/detector/figma-source";
import { FigmaRenderError, readCachedRender, renderMissing } from "@/detector/figma-render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One node of a game's Figma design as a PNG (cached on disk). Only nodes listed in the game's snapshot are served, so this is
// not an open proxy to the token's other files. Needs FIGMA_TOKEN (read-only scope file_content:read) unless already cached;
// prefer /api/figma/prefetch, which renders everything the wizard proposes in one Figma call.
export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  const node = request.nextUrl.searchParams.get("node") ?? "";
  const snapshot = /^[a-z0-9-]+$/.test(game) ? await loadFigmaSnapshot(game) : null;
  const figmaNode = snapshot?.nodes.find((n) => n.id === node);
  if (!snapshot || !figmaNode) return NextResponse.json({ error: "unknown game/node" }, { status: 404 });

  const headers = { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" };
  const cached = await readCachedRender(snapshot.fileKey, figmaNode);
  if (cached) return new NextResponse(new Uint8Array(cached), { headers });

  const token = process.env.FIGMA_TOKEN;
  if (!token) return NextResponse.json({ error: "Thiếu FIGMA_TOKEN trong môi trường máy chủ" }, { status: 503 });
  try {
    await renderMissing(snapshot.fileKey, [figmaNode], token);
  } catch (e) {
    if (e instanceof FigmaRenderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const fresh = await readCachedRender(snapshot.fileKey, figmaNode);
  if (!fresh) return NextResponse.json({ error: "Figma không render được node này" }, { status: 502 });
  return new NextResponse(new Uint8Array(fresh), { headers });
}
