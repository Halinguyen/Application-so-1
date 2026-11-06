import type { Suggestion } from "./figma-match";

// Mapping Results: for every slot, which files of the website it stands for, which Figma node was proposed (with how sure the
// matcher is) and what the operator decided. This is the manifest the rest of the pipeline reads.

export interface MappedAsset {
  id: string;
  section: string;
  fileName: string;
  canonicalPath: string;
  injection?: { targetPaths?: string[] };
}

export interface Verdict {
  nodeId: string;
  decision: "approved" | "rejected";
}

export interface MappingResult {
  slot: string;
  slotId: string;
  /** Every file this slot writes (one per breakpoint for a per-breakpoint asset). */
  assetPaths: string[];
  proposed: { nodeId: string; nodeName: string; confidence: number; margin: number; status: "auto" | "review"; reasons: string[] } | null;
  verdict: Verdict | null;
  /** The node to use: the operator's pick when approved, nothing otherwise (a rejected or unreviewed proposal is never applied). */
  finalNodeId: string | null;
}

export function buildMappingResults(assets: MappedAsset[], suggestions: Suggestion[], verdicts: Record<string, Verdict>): MappingResult[] {
  const bySlot = new Map(suggestions.map((s) => [s.slotId, s]));
  return assets.map((a): MappingResult => {
    const s = bySlot.get(a.id);
    const verdict = verdicts[a.id] ?? null;
    return {
      slot: `${a.section}/${a.fileName}`,
      slotId: a.id,
      assetPaths: a.injection?.targetPaths?.length ? a.injection.targetPaths : [a.canonicalPath],
      proposed:
        s && s.nodeId && s.status !== "none"
          ? { nodeId: s.nodeId, nodeName: s.nodeName, confidence: Math.round(s.score * 100) / 100, margin: Math.round(s.margin * 100) / 100, status: s.status, reasons: s.reasons }
          : null,
      verdict: verdict ? { nodeId: verdict.nodeId, decision: verdict.decision } : null,
      finalNodeId: verdict?.decision === "approved" ? verdict.nodeId : null,
    };
  });
}
