import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { TEMPLATE_ROOT } from "@/detector/paths";
import { GAME_REPO_MAP } from "@/detector/config";
import { listCloneSchemas, readCloneSchema, type CloneSchema } from "@/detector/clone-schema";
import { freezeGame } from "@/detector/freeze";
import { hashTree } from "@/detector/template-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GAME_TEMPLATE_ROOT = TEMPLATE_ROOT;

function summarize(s: CloneSchema, drift: boolean) {
  const mapped = GAME_REPO_MAP[s.gameId];
  const livePath = mapped ? path.join(GAME_TEMPLATE_ROOT, s.gameId, mapped) : null;
  const liveExists = !!livePath && existsSync(livePath);
  return {
    gameId: s.gameId,
    status: s.status,
    templateVersion: s.templateRef.version,
    verification: s.verification,
    liveTemplateExists: liveExists,
    // Safe to delete the live template only when frozen (both checks passed).
    canRemoveLiveTemplate: s.status === "frozen",
    // Live folder edited since the freeze -> schema/snapshot are stale. Hashing
    // hundreds of MB, so only on request (?drift=1).
    liveChangedSinceFreeze: drift && liveExists && livePath ? hashTree(livePath).hash !== s.templateRef.contentHash : null,
    updatedAt: s.updatedAt,
  };
}

// GET /api/schema            -> every game's schema status
// GET /api/schema?game=<id>  -> one game (add &drift=1 to compare the live folder with the snapshot)
export async function GET(request: NextRequest) {
  try {
    const drift = request.nextUrl.searchParams.get("drift") === "1";
    const game = request.nextUrl.searchParams.get("game");
    if (game) {
      const schema = readCloneSchema(game);
      if (!schema) return NextResponse.json({ error: `Chưa có schema cho "${game}".` }, { status: 404 });
      return NextResponse.json(summarize(schema, drift));
    }
    return NextResponse.json(listCloneSchemas().map((s) => summarize(s, drift)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST /api/schema  {"gameId": "<id>"}  -> freeze + verify (can take a minute)
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { gameId?: string };
    if (!body.gameId || !GAME_REPO_MAP[body.gameId]) {
      return NextResponse.json({ error: "gameId không hợp lệ." }, { status: 400 });
    }
    const schema = await freezeGame(body.gameId);
    return NextResponse.json(summarize(schema, false));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
