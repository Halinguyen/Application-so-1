import { NextRequest, NextResponse } from "next/server";
import { FigmaLinkError, importFigmaLink } from "@/detector/figma-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reads the design a Figma link points at into the game's snapshot (see figma-link.ts). Body: { game, url }.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { game?: string; url?: string } | null;
  if (!body?.game || !body.url) return NextResponse.json({ error: "Thiếu game hoặc url" }, { status: 400 });
  const token = process.env.FIGMA_TOKEN;
  if (!token) return NextResponse.json({ error: "Thiếu FIGMA_TOKEN trong môi trường máy chủ" }, { status: 503 });
  try {
    return NextResponse.json(await importFigmaLink(body.game, body.url, token));
  } catch (e) {
    if (e instanceof FigmaLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
