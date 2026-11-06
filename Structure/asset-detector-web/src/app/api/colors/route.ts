import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { resolveGame } from "@/detector/config";
import { getCloneDir } from "@/app/api/clone/route";
import { clearColorRules, readColorRules, setColorRule } from "@/detector/color-store";
import { refreshOverridesCss } from "@/detector/visual-editing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function setup(gameId: string | null) {
  const g = resolveGame(gameId);
  return { ...g, cloneDir: getCloneDir(g.repoPath) };
}

/** GET ?gameId=  ->  the colour rules saved from the editor. */
export async function GET(request: NextRequest) {
  try {
    const { repoPath } = setup(request.nextUrl.searchParams.get("gameId"));
    return NextResponse.json({ rules: await readColorRules(repoPath) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** POST { gameId, selector, prop: "background"|"text"|"border", to: "#rrggbb" } -> colours ONLY the pressed area. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { gameId?: string; selector?: unknown; prop?: unknown; to?: unknown };
    const { gameId, repoPath, cloneDir } = setup(body.gameId ?? null);
    if (!existsSync(cloneDir)) return NextResponse.json({ error: "Chưa có bản sao — bấm Tạo bản sao trước." }, { status: 409 });
    const r = await setColorRule(repoPath, { selector: body.selector, prop: body.prop, to: body.to });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await refreshOverridesCss(repoPath, cloneDir, gameId);
    return NextResponse.json({ rules: r.rules });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** DELETE ?gameId=  ->  every colour change goes back to the template's. */
export async function DELETE(request: NextRequest) {
  try {
    const { gameId, repoPath, cloneDir } = setup(request.nextUrl.searchParams.get("gameId"));
    await clearColorRules(repoPath);
    if (existsSync(cloneDir)) await refreshOverridesCss(repoPath, cloneDir, gameId);
    return NextResponse.json({ rules: [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
