import { NextRequest, NextResponse } from "next/server";
import { loadFigmaSnapshot } from "@/detector/figma-source";
import { FigmaRenderError, renderMissing } from "@/detector/figma-render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Renders every node the wizard proposes (and its alternatives) in batched Figma calls, so the operator can review them all
// without spending the render quota node by node. Body: { game, nodeIds }.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { game?: string; nodeIds?: string[] } | null;
  const snapshot = body?.game && /^[a-z0-9-]+$/.test(body.game) ? await loadFigmaSnapshot(body.game) : null;
  if (!snapshot || !Array.isArray(body?.nodeIds)) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const wanted = new Set(body.nodeIds);
  const nodes = snapshot.nodes.filter((n) => wanted.has(n.id));

  const token = process.env.FIGMA_TOKEN;
  if (!token) return NextResponse.json({ error: "Thiếu FIGMA_TOKEN trong môi trường máy chủ" }, { status: 503 });
  try {
    return NextResponse.json(await renderMissing(snapshot.fileKey, nodes, token));
  } catch (e) {
    if (e instanceof FigmaRenderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
