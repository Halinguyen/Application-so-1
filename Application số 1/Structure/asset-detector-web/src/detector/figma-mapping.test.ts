import { describe, expect, it } from "vitest";
import { buildMappingResults } from "./figma-mapping";
import type { Suggestion } from "./figma-match";

const asset = (id: string, file: string, targetPaths?: string[]) => ({ id, section: "home-news", fileName: file, canonicalPath: `public/assets/${file}`, injection: targetPaths ? { targetPaths } : undefined });
const sug = (slotId: string, nodeId: string | null, score: number, status: Suggestion["status"]): Suggestion => ({
  slotId,
  nodeId,
  nodeName: nodeId ?? "",
  score,
  margin: 0.3,
  status,
  reasons: [],
  alternatives: [],
  exportKind: "render",
});

describe("buildMappingResults", () => {
  it("lists every file a slot writes, the proposal with its confidence, and applies only what the operator approved", () => {
    const res = buildMappingResults(
      [asset("a", "btn-nap.png", ["public/assets/1920/btn-nap.png", "public/assets/768/btn-nap.png"]), asset("b", "ios.png"), asset("c", "frame.png"), asset("d", "apk.png")],
      [sug("a", "27:165", 1, "auto"), sug("b", "I1:2", 0.567, "review"), sug("c", null, 0, "none"), sug("d", "I3:4", 0.9, "auto")],
      { a: { nodeId: "27:165", decision: "approved" }, b: { nodeId: "OTHER", decision: "approved" }, d: { nodeId: "I3:4", decision: "rejected" } }
    );
    expect(res[0].assetPaths).toEqual(["public/assets/1920/btn-nap.png", "public/assets/768/btn-nap.png"]);
    expect(res[0]).toMatchObject({ slot: "home-news/btn-nap.png", finalNodeId: "27:165", proposed: { confidence: 1, status: "auto" } });
    expect(res[1]).toMatchObject({ assetPaths: ["public/assets/ios.png"], finalNodeId: "OTHER", proposed: { nodeId: "I1:2", confidence: 0.57 } }); // the operator picked another node than proposed
    expect(res[2]).toMatchObject({ proposed: null, verdict: null, finalNodeId: null });
    expect(res[3]).toMatchObject({ finalNodeId: null, verdict: { decision: "rejected" } }); // an auto proposal that was rejected is not applied
  });

  it("never applies an unreviewed proposal, even an automatic one", () => {
    const [r] = buildMappingResults([asset("a", "x.png")], [sug("a", "1:1", 1, "auto")], {});
    expect(r.proposed?.status).toBe("auto");
    expect(r.finalNodeId).toBeNull();
  });
});
