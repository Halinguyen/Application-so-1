import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { detectFramework } from '../src/framework-detector.js';
import { layer1Scan } from '../src/layer1-filesystem.js';
import { layer2ScanVite } from '../src/layer2-vite.js';
import { layer2ScanApiBlocks } from '../src/layer2-api-blocks.js';
import { layer2ScanSwiper } from '../src/layer2-swiper.js';
import { mergeDetected } from '../src/layer4-merge.js';
import { layer4GroupResponsive } from '../src/layer4-responsive.js';
import { layer4EnrichAssets } from '../src/layer4-constraints.js';
import type { DetectedAsset, DynamicBlock, DetectedSwiper } from '../src/types.js';

const REPO_PATH = path.resolve(__dirname, '../../game-template-repo/phuong-hoang-tru-tien/home-page');

/**
 * Locks in the current known-correct state of the full pipeline against the
 * one real repo this project targets. This is a regression safety net: if a
 * future change to any layer breaks one of these already-verified facts
 * (manually checked, multiple times, across this project's history), this
 * test fails loudly instead of silently shipping a regression.
 */
describe('integration: phuong-hoang-tru-tien full pipeline', () => {
  let assets: DetectedAsset[];
  let dynamicBlocks: DynamicBlock[];
  let swipers: DetectedSwiper[];

  beforeAll(async () => {
    const framework = await detectFramework(REPO_PATH);
    const layer1 = await layer1Scan(REPO_PATH);
    const layer2 = await layer2ScanVite(REPO_PATH);
    const apiBlocks = await layer2ScanApiBlocks(REPO_PATH);
    const swiperResult = await layer2ScanSwiper(REPO_PATH);
    const merged = await mergeDetected(layer1.assets, layer2.references);
    const responsive = await layer4GroupResponsive(merged);
    const finalAssets = [...responsive.grouped, ...responsive.ungrouped];
    const enriched = await layer4EnrichAssets(finalAssets, REPO_PATH);

    assets = enriched.enriched;
    dynamicBlocks = apiBlocks.dynamicBlocks;
    swipers = swiperResult.swipers;

    // keep framework/layer1 reachable for the framework test below
    (globalThis as any).__framework = framework;
  }, 30000);

  it('detects the framework as vite-spa (not nextjs/dotnet-mvc)', () => {
    expect((globalThis as any).__framework.framework).toBe('vite-spa');
  });

  it('produces a unique id for every asset', () => {
    const ids = assets.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('detects exactly 6 external assets (1 CDN video + 5 CDN slide images)', () => {
    const external = assets.filter(a => a.isExternal);
    expect(external).toHaveLength(6);
    expect(external.filter(a => a.type === 'video')).toHaveLength(1);
    expect(external.filter(a => a.type === 'image')).toHaveLength(5);
  });

  it('marks every favicon asset as auto-managed and not needing review', () => {
    const favicons = assets.filter(a => a.isAutoManaged);
    expect(favicons.length).toBeGreaterThan(0);
    for (const f of favicons) {
      expect(f.needsManualReview).toBe(false);
      expect(f.metadata?.operatorEditable).toBe(false);
    }
  });

  it('detects exactly 2 dynamic blocks with correct, non-"other" sections', () => {
    expect(dynamicBlocks).toHaveLength(2);
    const button = dynamicBlocks.find(b => b.type === 'api-buttons');
    const leaderboard = dynamicBlocks.find(b => b.type === 'api-leaderboard');
    expect(button?.section).toBe('global');
    expect(leaderboard?.section).toBe('home-rank');
    expect(leaderboard?.apiEndpoint).toBe('/Ranking/GetRanking');
    expect(leaderboard?.tabs).toHaveLength(2);
  });

  it('detects exactly 3 swipers with the correct visual modes', () => {
    expect(swipers).toHaveLength(3);
    const modes = swipers.map(s => s.visualMode).sort();
    expect(modes).toEqual(['coverflow', 'single', 'single']);
  });

  it('resolves the coverflow swiper\'s slide data back to its real static source (not "data-driven")', () => {
    const coverflow = swipers.find(s => s.visualMode === 'coverflow');
    expect(coverflow?.isDataDriven).toBe(false);
    expect(coverflow?.slideCount).toBe(5);
    expect(coverflow?.dataSource).toContain('utils/constant.ts');
  });

  it('groups the home-banner asset (768/banner.jpg + 1920/banner.png) across a file-extension change', () => {
    const bannerGroup = assets.find(a => a.canonicalPath.includes('home/banner') && a.fileName.startsWith('banner.'));
    expect(bannerGroup?.responsive).toBe('per-breakpoint');
    expect(Object.keys(bannerGroup?.variants || {}).sort()).toEqual(['desktop', 'tablet']);
  });

  it('has no asset with an out-of-range confidence value', () => {
    for (const a of assets) {
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });
});
