import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { GAME_REPO_MAP, isGameEnabled } from "@/detector/config";
import { TEMPLATE_ROOT } from "@/detector/paths";
import { readRegistryEntry } from "@/detector/template-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: for every game, whether its template is on disk now and where it comes from (the manifest). */
export async function GET() {
  const games = Object.entries(GAME_REPO_MAP).filter(([gameId]) => isGameEnabled(gameId)).map(([gameId, repoDir]) => {
    const entry = readRegistryEntry(gameId);
    return {
      gameId,
      repoDir,
      onDisk: existsSync(path.join(TEMPLATE_ROOT, gameId, repoDir)),
      framework: entry?.framework ?? null,
      source: entry?.source ? { url: entry.source.url, commit: entry.source.commit } : null,
      notes: entry?.notes ?? [],
    };
  });
  return NextResponse.json({ games });
}
