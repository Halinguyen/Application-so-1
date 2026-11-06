import { NextRequest, NextResponse } from "next/server";
import { runDetection } from "@/detector/run";
import { requireTemplate } from "@/detector/template-source";

// Not a `use cache` candidate — this reads the target repo's filesystem
// fresh every call (hashes, dimensions via sharp) and is meant to reflect
// a "re-scan" action, not serve a stale snapshot.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const gameId = request.nextUrl.searchParams.get("game") ?? undefined;
    const unavailable = await requireTemplate(gameId);
    if (unavailable) return NextResponse.json({ error: unavailable }, { status: 424 });
    const result = await runDetection(gameId, { force: request.nextUrl.searchParams.get("refresh") === "1" });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
