import { NextRequest, NextResponse } from "next/server";
import { resolveGame } from "@/detector/config";
import { getCloneDir } from "@/app/api/clone/route";
import {
  buildCss,
  listHistory,
  mergeOverride,
  readLayout,
  readManifest,
  readRoutes,
  readSlots,
  readExternalSlots,
  removeElement,
  restoreHistory,
  writeLayout,
} from "@/detector/layout-store";
import { rewriteCloneCss, templateHash } from "@/detector/visual-editing";
import { colorRulesCss } from "@/detector/color-store";
import { emptyLayout, isValidEditId, LAYOUT_BREAKPOINTS, type LayoutBreakpoint } from "@/detector/layout-schema";
import { isOverridePatch, patchAllowedFor } from "@/detector/layout-patch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function game(input: string | null) {
  const g = resolveGame(input);
  return { ...g, cloneDir: getCloneDir(g.repoPath) };
}

async function snapshot(gameId: string, repoPath: string, cloneDir: string, extra: Record<string, unknown> = {}) {
  const [layout, manifest, history, slots, routes, externalSlots] = await Promise.all([readLayout(repoPath), readManifest(repoPath), listHistory(repoPath), readSlots(repoPath), readRoutes(repoPath), readExternalSlots(repoPath)]);
  const { css, conflicts } = buildCss(layout, manifest, gameId, templateHash(gameId));
  const cssWritten = await rewriteCloneCss(cloneDir, css + (await colorRulesCss(repoPath)));
  return { layout: layout ?? emptyLayout(gameId), manifest, conflicts, history, slots, externalSlots, routes, cssWritten, ...extra };
}

/** GET ?gameId= -> layout, manifest (editable elements), conflicts, history. */
export async function GET(request: NextRequest) {
  try {
    const { gameId, repoPath, cloneDir } = game(request.nextUrl.searchParams.get("gameId"));
    return NextResponse.json(await snapshot(gameId, repoPath, cloneDir));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * PUT { gameId, editId, breakpoint, patch }  patch values: strings/number/boolean, null removes.
 * PUT { gameId, restore: "<history file>" }  rolls back to an earlier saved version.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, repoPath, cloneDir } = game(typeof body.gameId === "string" ? body.gameId : null);

    if (typeof body.restore === "string") {
      await restoreHistory(repoPath, body.restore);
      return NextResponse.json(await snapshot(gameId, repoPath, cloneDir));
    }

    const { editId, breakpoint, patch } = body as { editId: unknown; breakpoint: unknown; patch: unknown };
    if (typeof editId !== "string" || !isValidEditId(editId)) return NextResponse.json({ error: "invalid editId" }, { status: 400 });
    if (!LAYOUT_BREAKPOINTS.includes(breakpoint as LayoutBreakpoint)) return NextResponse.json({ error: "invalid breakpoint" }, { status: 400 });
    if (!isOverridePatch(patch)) return NextResponse.json({ error: "invalid patch" }, { status: 400 });

    // Only elements the injector actually tagged can be edited.
    const manifest = await readManifest(repoPath);
    const entry = manifest?.entries.find((e) => e.editId === editId);
    if (!entry) {
      return NextResponse.json({ error: `"${editId}" không phải phần tử có thể chỉnh (chưa nằm trong manifest)` }, { status: 400 });
    }
    if (!patchAllowedFor(entry.mode, patch)) {
      return NextResponse.json({ error: `"${editId}" là ảnh nằm trong luồng trang: chỉ phóng to/thu nhỏ hoặc ẩn được, không dời hay đổi thứ tự lớp.` }, { status: 400 });
    }

    const current = (await readLayout(repoPath)) ?? emptyLayout(gameId);
    const hash = templateHash(gameId);
    const next = mergeOverride(current, editId, breakpoint as LayoutBreakpoint, patch, hash ? { contentHash: hash } : undefined);
    await writeLayout(repoPath, next);
    return NextResponse.json(await snapshot(gameId, repoPath, cloneDir));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE ?gameId=&editId=  resets one element (or the whole layout without editId). */
export async function DELETE(request: NextRequest) {
  try {
    const { gameId, repoPath, cloneDir } = game(request.nextUrl.searchParams.get("gameId"));
    const editId = request.nextUrl.searchParams.get("editId") ?? undefined;
    if (editId && !isValidEditId(editId)) return NextResponse.json({ error: "invalid editId" }, { status: 400 });
    const current = (await readLayout(repoPath)) ?? emptyLayout(gameId);
    await writeLayout(repoPath, removeElement(current, editId));
    return NextResponse.json(await snapshot(gameId, repoPath, cloneDir));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
