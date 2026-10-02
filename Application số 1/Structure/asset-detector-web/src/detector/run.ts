import { detectFramework } from "./framework-detector";
import { layer1Scan } from "./layer1-filesystem";
import { layer2ScanVite } from "./layer2-vite";
import { layer2ScanNextjs } from "./layer2-nextjs";
import { layer2ScanDotNet } from "./layer2-dotnet";
import { layer2ScanApiBlocks } from "./layer2-api-blocks";
import { layer2ScanSwiper } from "./layer2-swiper";
import { mergeDetected } from "./layer4-merge";
import { layer4GroupResponsive } from "./layer4-responsive";
import { layer4EnrichAssets } from "./layer4-constraints";
import type { DetectionResult } from "./types";
import { resolveGame } from "./config";
import { readCachedDetection, writeCachedDetection } from "./detect-cache";

/**
 * Runs the full detection pipeline against the given game (falls back to
 * DEFAULT_GAME_ID if omitted/unknown — see resolveGame). Mirrors
 * asset-detector-poc/src/index.ts step for step — that CLI script is the
 * source of truth this was ported from (83 passing unit + integration tests
 * there cover this exact sequence).
 */
export async function runDetection(
  gameIdInput?: string,
  opts: { force?: boolean } = {}
): Promise<DetectionResult> {
  const { gameId, repoPath } = resolveGame(gameIdInput);
  // Full scan is slow (23s on than-ma-ao-hoa: AST parse + sharp per image), so
  // reuse the last result until a file under repoPath changes or Re-scan forces it.
  if (!opts.force) {
    const cached = await readCachedDetection(gameId, repoPath);
    if (cached) return cached;
  }
  const result = await runDetectionUncached(gameIdInput);
  await writeCachedDetection(gameId, repoPath, result);
  return result;
}

async function runDetectionUncached(gameIdInput?: string): Promise<DetectionResult> {
  const startTime = Date.now();
  const { gameId, repoPath } = resolveGame(gameIdInput);

  const framework = await detectFramework(repoPath);

  const layer1 = await layer1Scan(repoPath);

  let references: DetectionResult["references"] = [];
  if (framework.framework === "vite-spa") {
    const layer2 = await layer2ScanVite(repoPath);
    references = layer2.references;
  } else if (framework.framework === "nextjs") {
    const layer2 = await layer2ScanNextjs(repoPath);
    references = layer2.references;
  } else if (framework.framework === "dotnet-mvc") {
    const layer2 = await layer2ScanDotNet(repoPath);
    references = layer2.references;
  }

  const apiBlocksResult = await layer2ScanApiBlocks(repoPath);
  const swiperResult = await layer2ScanSwiper(repoPath);

  const merged = await mergeDetected(layer1.assets, references);
  const avgConfidence =
    merged.length > 0
      ? merged.reduce((s, a) => s + a.confidence, 0) / merged.length
      : 0;
  const needsReview = merged.filter((a) => a.needsManualReview).length;

  const responsive = await layer4GroupResponsive(merged);
  const finalAssets = [...responsive.grouped, ...responsive.ungrouped];

  const enrichResult = await layer4EnrichAssets(finalAssets, repoPath);
  const enrichedAssets = enrichResult.enriched;

  return {
    gameId,
    repoPath,
    framework,
    assets: enrichedAssets,
    references,
    dynamicBlocks: apiBlocksResult.dynamicBlocks,
    swipers: swiperResult.swipers,
    summary: {
      totalAssets: enrichedAssets.length,
      totalReferences: references.length,
      totalDynamicBlocks: apiBlocksResult.dynamicBlocks.length,
      totalSwipers: swiperResult.swipers.length,
      avgConfidence,
      needsReview,
      byType: layer1.stats.byType,
      bySection: enrichedAssets.reduce(
        (acc, a) => {
          acc[a.section] = (acc[a.section] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    },
    detectedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}
