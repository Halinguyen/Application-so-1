import { NextRequest, NextResponse } from "next/server";
import { readLayerPng } from "@/detector/psd-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET ?psd=<id>&layer=<n>[&thumb=1] → PNG of one parsed PSD layer/group.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const buf = await readLayerPng(sp.get("psd") ?? "", Number(sp.get("layer")), sp.get("thumb") === "1");
  if (!buf) return NextResponse.json({ error: "Không tìm thấy layer (PSD có thể đã hết hạn cache, hãy tải lại)" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
