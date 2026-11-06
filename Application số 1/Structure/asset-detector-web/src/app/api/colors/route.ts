import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { resolveGame } from "@/detector/config";
import { getCloneDir } from "@/app/api/clone/route";
import { changeColor, readColorChanges, revertColors } from "@/detector/color-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function setup(gameId: string | null) {
  const g = resolveGame(gameId);
  return { ...g, cloneDir: getCloneDir(g.repoPath) };
}

/** GET ?gameId=  ->  the colours changed from the editor: { "#faea05": { to: "#00ff66", ... } } */
export async function GET(request: NextRequest) {
  try {
    const { repoPath } = setup(request.nextUrl.searchParams.get("gameId"));
    return NextResponse.json({ changes: await readColorChanges(repoPath) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** POST { gameId, from: "#rrggbb" (as shown in the preview), to: "#rrggbb" } -> rewrites the clone's source, remembers it. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { gameId?: string; from?: string; to?: string };
    const { repoPath, cloneDir } = setup(body.gameId ?? null);
    if (!existsSync(cloneDir)) return NextResponse.json({ error: "Chưa có bản sao — bấm Tạo bản sao trước." }, { status: 409 });
    const r = await changeColor(repoPath, cloneDir, String(body.from ?? ""), String(body.to ?? ""));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ changed: r, changes: await readColorChanges(repoPath) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** DELETE ?gameId=  ->  every changed colour goes back to the template's. */
export async function DELETE(request: NextRequest) {
  try {
    const { repoPath, cloneDir } = setup(request.nextUrl.searchParams.get("gameId"));
    const reverted = existsSync(cloneDir) ? await revertColors(repoPath, cloneDir) : 0;
    return NextResponse.json({ reverted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
