import { describe, it, expect } from 'vitest';
import {
  matchesAsset,
  detectSection,
  isFavicon,
  buildAssetId,
  isExternalUrl,
  detectExternalType,
  normalize,
} from '../src/layer4-merge.js';
import type { RawAsset, AssetReference } from '../src/types.js';

function raw(relativePath: string, overrides: Partial<RawAsset> = {}): RawAsset {
  const fileName = relativePath.split('/').pop()!;
  return {
    absolutePath: `/repo/${relativePath}`,
    relativePath,
    fileName,
    extension: fileName.split('.').pop() || '',
    type: 'image',
    size: 1000,
    hash: 'deadbeef',
    detectedBy: 'filesystem',
    confidence: 1,
    ...overrides,
  };
}

function ref(assetPath: string, overrides: Partial<AssetReference> = {}): AssetReference {
  return { file: 'src/App.tsx', line: 1, type: 'jsx-attr', assetPath, usage: '', confidence: 0.9, ...overrides };
}

describe('matchesAsset', () => {
  it('matches a root-relative reference against its repo-relative asset', () => {
    expect(matchesAsset('/assets/home/banner/logo.png', raw('public/assets/home/banner/logo.png'))).toBe(true);
  });

  it('does not match an unrelated path', () => {
    expect(matchesAsset('/assets/home/banner/other.png', raw('public/assets/home/banner/logo.png'))).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesAsset('/Assets/Home/Banner/LOGO.PNG', raw('public/assets/home/banner/logo.png'))).toBe(true);
  });

  it('strips a query string from the reference before comparing', () => {
    expect(matchesAsset('/assets/home/banner/logo.png?v=3', raw('public/assets/home/banner/logo.png'))).toBe(true);
  });

  it('resolves a template-literal prefix+suffix pattern (top${idx}.png)', () => {
    expect(matchesAsset('/assets/home/rank/top${}.png', raw('public/assets/home/rank/top1.png'))).toBe(true);
    expect(matchesAsset('/assets/home/rank/top${}.png', raw('public/assets/home/rank/top2.png'))).toBe(true);
  });

  it('does not let a template-literal prefix bleed into an unrelated folder', () => {
    expect(matchesAsset('/assets/home/rank/top${}.png', raw('public/assets/home/other/top1.png'))).toBe(false);
  });

  it('resolves a template-literal suffix-only pattern (${basePath}/btn-nap.png)', () => {
    expect(matchesAsset('${}/btn-nap.png', raw('public/assets/home/news/1920/btn-nap.png'))).toBe(true);
  });

  it('does NOT cross-link two different files that merely share a basename in different folders', () => {
    // Regression test: an earlier "match by bare filename" fallback caused
    // /assets/rank/1920/bg-rank.png to falsely match home/rank/768/bg-rank.png.
    expect(matchesAsset('/assets/rank/1920/bg-rank.png', raw('public/assets/home/rank/768/bg-rank.png'))).toBe(false);
  });

  it('matches a reference that is exactly the bare filename', () => {
    expect(matchesAsset('logo.png', raw('public/assets/header/logo.png'))).toBe(true);
  });
});

describe('normalize', () => {
  it('strips ~, @/, ./, leading slashes, query strings, and lowercases', () => {
    expect(normalize('~/Assets/Foo.PNG?v=1')).toBe('assets/foo.png');
    expect(normalize('@/assets/Foo.png')).toBe('assets/foo.png');
    expect(normalize('./assets/Foo.png')).toBe('assets/foo.png');
    expect(normalize('///assets/Foo.png')).toBe('assets/foo.png');
  });
});

describe('detectSection', () => {
  it('classifies by specific path hierarchy first', () => {
    expect(detectSection('public/assets/home/rank/all.png', [])).toBe('home-rank');
    expect(detectSection('public/assets/home/news/1920/banner.png', [])).toBe('home-news');
    expect(detectSection('public/assets/float-home/btn-apk.png', [])).toBe('float-home');
  });

  it('falls back to filename keywords when no folder rule matches', () => {
    expect(detectSection('public/assets/misc/btn-something.png', [])).toBe('buttons');
    expect(detectSection('public/assets/misc/my-logo.png', [])).toBe('logo');
    expect(detectSection('public/assets/misc/top3.png', [])).toBe('rank');
  });

  it('falls back to the reference file path when filename gives no hint', () => {
    const refs = [ref('/assets/misc/plain.png', { file: 'src/layout/HeaderHome.tsx' })];
    expect(detectSection('public/assets/misc/plain.png', refs)).toBe('header');
  });

  it('returns "other" when nothing matches', () => {
    expect(detectSection('public/assets/misc/plain.png', [])).toBe('other');
  });
});

describe('isFavicon', () => {
  it('matches real favicon files', () => {
    expect(isFavicon('public/favicon/favicon.ico')).toBe(true);
    expect(isFavicon('public/favicon/android-chrome-192x192.png')).toBe(true);
    expect(isFavicon('public/assets/tintuc/apple-touch-icon.png')).toBe(true);
    expect(isFavicon('public/vite.svg')).toBe(true);
  });

  it('does not false-positive on an unrelated file that merely contains "icon"', () => {
    expect(isFavicon('public/assets/home/rank/icon-app.png')).toBe(false);
  });

  it('does not match a file that merely contains the substring "favicon" mid-name without the right suffix', () => {
    expect(isFavicon('public/assets/my-favicon-banner.png')).toBe(false);
  });
});

describe('buildAssetId', () => {
  it('produces different ids for same-basename files in different folders', () => {
    const a = buildAssetId('public/favicon/apple-touch-icon.png');
    const b = buildAssetId('public/assets/tintuc/apple-touch-icon.png');
    expect(a).not.toBe(b);
  });

  it('strips the public/ prefix and extension, and slashes become dashes', () => {
    expect(buildAssetId('public/assets/header/logo-game.png')).toBe('asset.assets-header-logo-game');
  });
});

describe('isExternalUrl / detectExternalType', () => {
  it('recognizes http(s) URLs as external', () => {
    expect(isExternalUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isExternalUrl('http://cdn.example.com/a.png')).toBe(true);
  });

  it('does not treat a relative path as external', () => {
    expect(isExternalUrl('/assets/a.png')).toBe(false);
  });

  it('excludes localhost URLs', () => {
    expect(isExternalUrl('http://localhost:3000/a.png')).toBe(false);
  });

  it('detects type by extension, case-insensitively', () => {
    expect(detectExternalType('https://cdn.example.com/a.PNG')).toBe('image');
    expect(detectExternalType('https://cdn.example.com/a.mp4')).toBe('video');
    expect(detectExternalType('https://cdn.example.com/a.woff2')).toBe('font');
    expect(detectExternalType('https://cdn.example.com/a.unknownext')).toBe('other');
  });
});
