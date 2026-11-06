import { NextRequest, NextResponse } from "next/server";
import { importFigmaExport } from "@/detector/figma-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Loads a ZIP made by the Figma export plugin into the local asset repository (see figma-import.ts). Body: multipart { game, file }.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const game = form?.get("game");
  const file = form?.get("file");
  if (typeof game !== "string" || !(file instanceof File)) return NextResponse.json({ error: "Thiếu game hoặc file ZIP" }, { status: 400 });
  try {
    return NextResponse.json(await importFigmaExport(game, new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
