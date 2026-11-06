import { describe, it, expect } from 'vitest';
import {
  stripExtension,
  detectMissingBreakpoints,
  buildResponsiveId,
  layer4GroupResponsive,
} from '../src/layer4-responsive.js';
import type { DetectedAsset, AssetVariant } from '../src/types.js';

function asset(canonicalPath: string, overrides: Partial<DetectedAsset> = {}): DetectedAsset {
  const fileName = canonicalPath.split('/').pop()!;
  return {
    id: `asset.${fileName}`,
    canonicalPath,
    publicPath: '/' + canonicalPath.replace(/^public\//, ''),
    type: 'image',
    fileName,
    extension: fileName.split('.').pop() || '',
    size: 100,
    hash: 'h',
    responsive: 'shared',
    references: [],
    referenceCount: 0,
    detectedBy: ['filesystem'],
    confidence: 0.5,
    needsManualReview: true,
    isVendor: false,
    isFooter: false,
    section: 'other',
    isAutoManaged: false,
    isExternal: false,
    ...overrides,
  };
}

describe('stripExtension', () => {
  it('removes a single extension', () => {
    expect(stripExtension('banner.png')).toBe('banner');
  });
  it('only removes the last extension when there are multiple dots', () => {
    expect(stripExtension('banner.min.png')).toBe('banner.min');
  });
  it('leaves a filename with no extension untouched', () => {
    expect(stripExtension('README')).toBe('README');
  });
});

describe('detectMissingBreakpoints', () => {
  it('returns empty when no variants at all (nothing to flag)', () => {
    expect(detectMissingBreakpoints({})).toEqual([]);
  });
  it('returns empty when all 3 breakpoints are present', () => {
    const v = {} as any;
    v.mobile = v.tablet = v.desktop = {};
    expect(detectMissingBreakpoints(v)).toEqual([]);
  });
  it('flags the breakpoints that are absent', () => {
    const v = { desktop: {} } as any;
    expect(detectMissingBreakpoints(v).sort()).toEqual(['mobile', 'tablet']);
  });
});

describe('buildResponsiveId', () => {
  it('produces different ids for different filenames under the same 3-segment parent path', () => {
    // Regression test: an earlier version derived the id from only the last
    // 3 path segments, ignoring the filename — every asset under the same
    // parent folder (e.g. .../home/news/) collided on one id.
    const groupA = { groupKey: 'k1', basePath: 'public/assets/home/news', fileName: 'icon-app.png', variants: {} };
    const groupB = { groupKey: 'k2', basePath: 'public/assets/home/news', fileName: 'btn-prev.png', variants: {} };
    expect(buildResponsiveId(groupA)).not.toBe(buildResponsiveId(groupB));
  });
});

describe('layer4GroupResponsive', () => {
  it('groups two breakpoint variants that differ in file extension (banner.jpg + banner.png)', async () => {
    const assets = [
      asset('public/assets/home/banner/768/banner.jpg'),
      asset('public/assets/home/banner/1920/banner.png'),
    ];
    const result = await layer4GroupResponsive(assets);
    expect(result.stats.perBreakpointGroups).toBe(1);
    const grouped = result.grouped[0];
    expect(Object.keys(grouped.variants || {}).sort()).toEqual(['desktop', 'tablet']);
  });

  it('leaves an asset with no breakpoint folder as "shared"', async () => {
    const assets = [asset('public/assets/header/logo-game.png')];
    const result = await layer4GroupResponsive(assets);
    expect(result.stats.sharedOnlyGroups).toBe(1);
    expect(result.ungrouped[0].responsive).toBe('shared');
  });

  it('does not crash on a group with only 1 variant, and flags the other 2 as missing', async () => {
    const assets = [asset('public/assets/home/news/1920/icon-app.png')];
    const result = await layer4GroupResponsive(assets);
    expect(result.grouped).toHaveLength(1);
    expect(result.grouped[0].missingBreakpoints?.sort()).toEqual(['mobile', 'tablet']);
  });

  it('preserves the real referenceCount/confidence/section of the picked primary variant instead of fabricating defaults', async () => {
    // Regression test: pickPrimaryVariant used to synthesize a fake
    // DetectedAsset (confidence 0.9, section 'other', referenceCount 0)
    // instead of reusing the real, already-computed one.
    const desktopVariant = asset('public/assets/tintuc/1920/banner_trang2.png', {
      confidence: 1,
      referenceCount: 4,
      section: 'tintuc',
    });
    const tabletVariant = asset('public/assets/tintuc/768/banner_trang2.png', {
      confidence: 0.5,
      referenceCount: 0,
      section: 'tintuc',
    });
    const result = await layer4GroupResponsive([desktopVariant, tabletVariant]);
    const grouped = result.grouped[0];
    expect(grouped.referenceCount).toBe(4);
    expect(grouped.section).toBe('tintuc');
  });

  it('does not falsely cross-link two distinct files that share a basename in different base folders', async () => {
    const assets = [
      asset('public/assets/home/rank/768/bg-rank.png'),
      asset('public/assets/rank/1920/bg-rank.png'),
    ];
    const result = await layer4GroupResponsive(assets);
    // Different basePath ("home/rank" vs "rank") => must stay 2 separate groups.
    expect(result.stats.perBreakpointGroups).toBe(2);
  });
});
