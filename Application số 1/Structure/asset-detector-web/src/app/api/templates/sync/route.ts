import { NextRequest, NextResponse } from "next/server";
import { GAME_REPO_MAP } from "@/detector/config";
import { ensureTemplate } from "@/detector/template-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST { gameId? }: fetches the template of one game (or of every game) from git at the commit pinned in its manifest.
 * Meant for the first start of a fresh volume, e.g. `curl -X POST <tool>/api/templates/sync`; the tool also fetches a
 * template by itself the first time a game is opened, so this only saves the operator the wait.
 */
export async function POST(request: NextRequest) {
  let gameId: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.gameId === "string") gameId = body.gameId;
  } catch {
    /* no body: every game */
  }
  const ids = gameId ? [gameId] : Object.keys(GAME_REPO_MAP);
  if (gameId && !GAME_REPO_MAP[gameId]) return NextResponse.json({ error: `không biết game "${gameId}"` }, { status: 400 });

  const results = [];
  for (const id of ids) results.push(await ensureTemplate(id)); // one at a time: each is a network fetch
  const failed = results.filter((r) => r.state === "failed" || r.state === "no-source");
  return NextResponse.json({ results, ok: failed.length === 0 }, { status: failed.length === 0 ? 200 : 207 });
}
