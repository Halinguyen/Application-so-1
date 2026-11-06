import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runDetection } from "@/detector/run";
import { resolveGame } from "@/detector/config";
import { suggestFigmaMatches } from "@/detector/figma-source";
import { buildMappingResults, type Verdict } from "@/detector/figma-mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mapping Results of a game: asset paths + Figma node + confidence + the operator's verdict. ?download=1 saves it as a file.
export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  if (!/^[a-z0-9-]+$/.test(game)) return NextResponse.json({ error: "bad game" }, { status: 400 });
  const { gameId, repoPath } = resolveGame(game);
  const data = await runDetection(gameId);
  const suggestions = await suggestFigmaMatches(gameId, data, repoPath);

  let verdicts: Record<string, Verdict> = {};
  try {
    verdicts = JSON.parse(await readFile(path.join(process.cwd(), ".figma-review", `${gameId}.json`), "utf8")).verdicts ?? {};
  } catch {
    // nothing reviewed yet
  }
  const assets = data.assets.filter((a) => a.type === "image" && !a.isFooter && !a.isExternal && (a.isAutoManaged || a.referenceCount > 0));
  const body = { game: gameId, generatedAt: new Date().toISOString(), results: buildMappingResults(assets, suggestions, verdicts) };
  return NextResponse.json(body, {
    headers: request.nextUrl.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="${gameId}.mapping.json"` } : undefined,
  });
}
