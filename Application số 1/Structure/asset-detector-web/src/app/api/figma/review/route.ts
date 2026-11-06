import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The operator's verdict on each proposed Figma node, kept on disk (.figma-review/<game>.json): it is the hand-checked
// mapping the matcher's precision is measured against.
interface Verdict {
  nodeId: string;
  decision: "approved" | "rejected";
  slotKey: string;
  at: string;
}

function fileFor(game: string) {
  return path.join(process.cwd(), ".figma-review", `${game}.json`);
}

export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  if (!/^[a-z0-9-]+$/.test(game)) return NextResponse.json({ error: "bad game" }, { status: 400 });
  try {
    return NextResponse.json(JSON.parse(await readFile(fileFor(game), "utf8")));
  } catch {
    return NextResponse.json({ game, verdicts: {} });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { game?: string; slotId?: string; slotKey?: string; nodeId?: string; decision?: string } | null;
  if (!body?.game || !/^[a-z0-9-]+$/.test(body.game) || !body.slotId || !body.nodeId || !body.slotKey || (body.decision !== "approved" && body.decision !== "rejected")) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  let current: { game: string; verdicts: Record<string, Verdict> } = { game: body.game, verdicts: {} };
  try {
    current = JSON.parse(await readFile(fileFor(body.game), "utf8"));
  } catch {
    // first verdict
  }
  current.verdicts[body.slotId] = { nodeId: body.nodeId, decision: body.decision, slotKey: body.slotKey, at: new Date().toISOString() };
  await mkdir(path.dirname(fileFor(body.game)), { recursive: true });
  await writeFile(fileFor(body.game), JSON.stringify(current, null, 2));
  return NextResponse.json({ ok: true });
}
