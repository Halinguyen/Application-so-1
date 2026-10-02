import { detectFramework } from './framework-detector.js';
import { layer1Scan } from './layer1-filesystem.js';
import { layer2ScanNextJs } from './layer2-nextjs.js';
import { layer2ScanVite } from './layer2-vite.js';
import { layer2ScanApiBlocks } from './layer2-api-blocks.js';
import { layer2ScanSwiper } from './layer2-swiper.js';
import { layer4GroupResponsive } from './layer4-responsive.js';
import { layer4EnrichAssets } from './layer4-constraints.js';
import { mergeDetected } from './layer4-merge.js';
import { generateReport } from './report-generator.js';
import { DetectionResult } from './types.js';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf('--repo');
  const gameIdIdx = args.indexOf('--game-id');

  if (repoIdx === -1) {
    console.error('Usage: tsx src/index.ts --repo <path> [--game-id <id>]');
    process.exit(1);
  }

  const repoPath = path.resolve(args[repoIdx + 1]);
  const gameId = gameIdIdx !== -1 ? args[gameIdIdx + 1] : path.basename(repoPath);

  console.log(`\n🎮 Detecting: ${gameId}`);
  console.log(`📁 Repo: ${repoPath}\n`);

  const startTime = Date.now();

  // Step 1: Framework
  console.log('[1/4] Detecting framework...');
  const framework = await detectFramework(repoPath);
  console.log(`      ✓ ${framework.framework} ${framework.version} (${framework.router || 'n/a'})\n`);

  // Step 2: Layer 1
  console.log('[2/4] Scanning filesystem...');
  const layer1 = await layer1Scan(repoPath);
  console.log(`      ✓ ${layer1.stats.total} assets found`);
  console.log(`      ⏭️  ${layer1.stats.footerSkipped} footer files skipped`);
  console.log(`      ⏭️  ${layer1.stats.vendorSkipped} vendor files skipped\n`);

  // Step 3: Layer 2
  console.log('[3/4] Scanning references...');
  let references: any[] = [];
  let footerRefsSkipped = 0;
  if (framework.framework === 'nextjs' || framework.framework === 'vite-spa') {
    const layer2 = framework.framework === 'nextjs'
      ? await layer2ScanNextJs(repoPath)
      : await layer2ScanVite(repoPath);
    references = layer2.references;
    footerRefsSkipped = layer2.footerFilesSkipped;
    console.log(`      ✓ ${references.length} references found`);
    console.log(`      ⏭️  ${footerRefsSkipped} footer files skipped\n`);
  } else {
    console.log(`      ⚠ .NET not implemented in POC yet\n`);
  }

  // Step 3.5: Scan API blocks
  console.log('[3.5/5] Scanning API blocks...');
  const apiBlocksResult = await layer2ScanApiBlocks(repoPath);
  console.log(`      ✓ ${apiBlocksResult.dynamicBlocks.length} dynamic blocks found`);
  console.log(`      ℹ️  ${apiBlocksResult.apiCallsFound.length} API calls detected`);
  if (apiBlocksResult.warnings.length > 0) {
    for (const w of apiBlocksResult.warnings) {
      console.log(`      ⚠️  ${w}`);
    }
  }
  console.log('');

  // Step 3.6: Scan swipers
  console.log('[3.6/5] Scanning swipers...');
  const swiperResult = await layer2ScanSwiper(repoPath);
  console.log(`      ✓ ${swiperResult.swipers.length} swipers found in ${swiperResult.filesWithSwiper} files\n`);

  // Step 4: Merge
  console.log('[4/5] Merging...');
  const assets = await mergeDetected(layer1.assets, references);
  const avgConfidence = assets.length > 0
    ? assets.reduce((s, a) => s + a.confidence, 0) / assets.length
    : 0;
  const needsReview = assets.filter(a => a.needsManualReview).length;
  console.log(`      ✓ ${assets.length} assets merged`);
  console.log(`      ✓ Avg confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`      ⚠ ${needsReview} assets need manual review\n`);

  // Step 4.5: Group responsive
  console.log('[4.5/6] Grouping responsive variants...');
  const responsiveResult = await layer4GroupResponsive(assets);
  const finalAssets = [
    ...responsiveResult.grouped,
    ...responsiveResult.ungrouped,
  ];
  console.log(`      ✓ ${responsiveResult.stats.perBreakpointGroups} responsive groups`);
  console.log(`      ✓ ${responsiveResult.stats.sharedOnlyGroups} shared assets\n`);

  // Step 5: Enrich assets với constraints + metadata
  console.log('[5/6] Enriching with constraints + metadata...');
  const enrichResult = await layer4EnrichAssets(finalAssets, repoPath);
  const enrichedAssets = enrichResult.enriched;
  console.log(`      ✓ ${enrichResult.stats.withDimensions} assets có dimensions`);
  console.log(`      ✓ ${enrichResult.stats.withConstraints} assets có constraints`);
  console.log(`      ✓ ${enrichResult.stats.withMetadata} assets có metadata`);
  console.log(`      ✓ ${enrichResult.stats.withInjection} assets có injection config\n`);

  // Build result
  const result: DetectionResult = {
    gameId,
    repoPath,
    framework,
    assets: enrichedAssets,                    // ← dùng enrichedAssets
    references,
    dynamicBlocks: apiBlocksResult.dynamicBlocks,   // ← NEW
    swipers: swiperResult.swipers,                  // ← NEW
    summary: {
      totalAssets: enrichedAssets.length,
      totalReferences: references.length,
      totalDynamicBlocks: apiBlocksResult.dynamicBlocks.length,  // ← NEW
      totalSwipers: swiperResult.swipers.length,                 // ← NEW
      avgConfidence,
      needsReview,
      byType: layer1.stats.byType,
      bySection: enrichedAssets.reduce((acc, a) => {
        acc[a.section] = (acc[a.section] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    detectedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  // Write output
  const outputDir = path.join(process.cwd(), 'output', gameId);
  await mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(result, null, 2));
  await writeFile(path.join(outputDir, 'assets.json'), JSON.stringify(enrichedAssets, null, 2));
  await writeFile(path.join(outputDir, 'references.json'), JSON.stringify(references, null, 2));
  await writeFile(path.join(outputDir, 'report.md'), generateReport(result));

  await writeFile(
    path.join(outputDir, 'dynamic-blocks.json'),
    JSON.stringify(apiBlocksResult.dynamicBlocks, null, 2)
  );

  await writeFile(
    path.join(outputDir, 'api-calls.json'),
    JSON.stringify(apiBlocksResult.apiCallsFound, null, 2)
  );

  await writeFile(
    path.join(outputDir, 'responsive-groups.json'),
    JSON.stringify(responsiveResult.groups, null, 2)
  );

  await writeFile(
    path.join(outputDir, 'enriched-assets.json'),
    JSON.stringify(enrichedAssets, null, 2)
  );

  await writeFile(
    path.join(outputDir, 'swipers.json'),
    JSON.stringify(swiperResult.swipers, null, 2)
  );

  console.log(`✅ Done in ${result.durationMs}ms`);
  console.log(`📄 Output: ${outputDir}/\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
