import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchSlots, type FigmaNode, type MatchSlot } from "./figma-match";
import { readSlotContext } from "./figma-context";
import type { DetectionResult } from "./types";
import type { FigmaSuggestionView } from "@/app/components/wizard/types";

// The Figma design of a game, captured once into figma-snapshots/<gameId>.json (so the wizard needs no Figma access to
// propose a mapping; only rendering a node's image does, see /api/figma/render).
export interface FigmaSnapshot {
  game: string;
  fileKey: string;
  capturedAt: string;
  frameBySection: Record<string, string>;
  nodes: FigmaNode[];
}

const SNAPSHOT_DIR = path.join(process.cwd(), "src/detector/figma-snapshots");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(SNAPSHOT_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadFigmaSnapshot(gameId: string): Promise<FigmaSnapshot | null> {
  return readJson<FigmaSnapshot>(`${gameId}.json`);
}

/** Proposals for the image slots of a game, or [] when no Figma design was captured for it. */
export async function suggestFigmaMatches(gameId: string, data: DetectionResult, repoPath: string): Promise<FigmaSuggestionView[]> {
  const snapshot = await loadFigmaSnapshot(gameId);
  if (!snapshot) return [];
  const truth = await readJson<{ pairs: Record<string, string | null> }>(`${gameId}.ground-truth.json`);

  // Same inputs as figma-match.test.ts: every local image slot takes part, so a slot can claim the node that is its own.
  // An asset no code refers to is not shown anywhere: it must not claim a node from one that is.
  const assets = data.assets.filter((a) => a.type === "image" && !a.isFooter && !a.isExternal && a.dimensions && (a.isAutoManaged || a.referenceCount > 0));
  // The website's JSX says at which size / under which alt text each image is shown: the design is drawn for that.
  const slots: MatchSlot[] = await Promise.all(
    assets.map(async (a) => {
      const usages = (await readSlotContext(repoPath, a.references)).map((c) => ({ w: c.displayW, h: c.displayH, aspect: c.aspect, altTokens: c.altTokens }));
      return {
        id: a.id,
        fileName: a.fileName,
        section: a.section,
        width: a.dimensions!.width,
        height: a.dimensions!.height,
        usages,
      };
    })
  );
  const pocKeys = new Set(Object.keys(truth?.pairs ?? {}));
  const keyOf = new Map(assets.map((a) => [a.id, `${a.section}/${a.fileName}`]));

  return matchSlots(snapshot.nodes, slots, { frameBySection: snapshot.frameBySection })
    .filter((s) => s.nodeId)
    .map((s) => ({ ...s, nodeId: s.nodeId!, fileKey: snapshot.fileKey, poc: pocKeys.has(keyOf.get(s.slotId) ?? "") }));
}
