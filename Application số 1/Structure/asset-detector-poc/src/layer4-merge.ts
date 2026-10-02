import { RawAsset, AssetReference, DetectedAsset, AssetType } from './types.js';
import { createHash } from 'crypto';

export async function mergeDetected(
  rawAssets: RawAsset[],
  references: AssetReference[]
): Promise<DetectedAsset[]> {
  const detected: DetectedAsset[] = [];

  for (const raw of rawAssets) {
    // Favicon handling
    if (isFavicon(raw.relativePath)) {
      detected.push({
        id: buildAssetId(raw.relativePath),
        canonicalPath: raw.relativePath,
        publicPath: '/' + raw.relativePath.replace(/^(public|static)\//, ''),
        type: raw.type,
        fileName: raw.fileName,
        extension: raw.extension,
        size: raw.size,
        hash: raw.hash,
        responsive: 'shared',
        references: [],
        referenceCount: 0,
        detectedBy: ['filesystem'],
        confidence: 1.0,                 // ← Cao vì chắc chắn là favicon
        needsManualReview: false,        // ← Không cần review
        isVendor: false,
        isFooter: false,
        section: 'favicon',              // ← Section riêng
        isAutoManaged: true,             // ← Flag mới
        isExternal: false,
      });
      continue;
    }

    // ... xử lý bình thường cho asset khác (giữ nguyên logic cũ)
    const matchedRefs = references.filter(ref => matchesAsset(ref.assetPath, raw));
    let confidence = 0.5;
    if (matchedRefs.length > 0) confidence += 0.3;
    if (matchedRefs.length >= 2) confidence += 0.2;
    confidence = Math.min(confidence, 1.0);

    const section = detectSection(raw.relativePath, matchedRefs);

    detected.push({
      id: buildAssetId(raw.relativePath),
      canonicalPath: raw.relativePath,
      publicPath: '/' + raw.relativePath.replace(/^(public|static)\//, ''),
      type: raw.type,
      fileName: raw.fileName,
      extension: raw.extension,
      size: raw.size,
      hash: raw.hash,
      responsive: 'shared',
      references: matchedRefs,
      referenceCount: matchedRefs.length,
      detectedBy: matchedRefs.length > 0 ? ['filesystem', 'static-ref'] : ['filesystem'],
      confidence,
      needsManualReview: confidence < 0.7,
      isVendor: false,
      isFooter: false,
      section,
      isAutoManaged: false,
      isExternal: false,
    });
  }

  // Append external assets (xem 3B)
  detected.push(...extractExternalAssets(references));

  return detected;
}

/**
 * `asset.${fileName-không-đuôi}` (bản cũ) làm 2 file trùng tên ở 2 folder
 * khác nhau (vd. favicon/apple-touch-icon.png và tintuc/apple-touch-icon.png,
 * hoặc header/logo-game.png và home/banner/logo-game.png) va vào cùng 1 id.
 * Dùng cả path để đảm bảo duy nhất — canonicalPath vốn đã unique per file.
 */
export function buildAssetId(relativePath: string): string {
  const withoutPrefix = relativePath.replace(/^(public|static)\//, '');
  const withoutExt = withoutPrefix.replace(/\.[^.]+$/, '');
  return `asset.${withoutExt.replace(/\//g, '-')}`;
}

export function matchesAsset(refPath: string, raw: RawAsset): boolean {
  const normalized = normalize(refPath);
  const rel = normalize(raw.relativePath);
  const fileName = normalize(raw.fileName);

  // Case 1: Direct match
  if (rel === normalized) return true;
  if (rel.endsWith('/' + normalized)) return true;
  if (normalized.endsWith('/' + rel)) return true;
  if (normalized === fileName) return true;

  // Case 2: Template literal pattern `/assets/home/rank/top${}.png`
  if (normalized.includes('${}')) {
    const prefix = normalized.replace(/\$\{\}.*$/, '').replace(/^\/+/, '');
    const suffix = normalized.replace(/^.*\$\{\}/, '');

    // Check if rel starts with prefix and ends with suffix.
    // `rel` is repo-relative (e.g. "public/assets/home/rank/top1.png") while
    // `prefix` comes from a root-relative reference ("assets/home/rank/top"),
    // so strip the "public/"/"static/" folder before comparing prefixes —
    // the existing endsWith-based Case 1 checks don't need this because a
    // suffix match is insensitive to what's stripped off the front.
    if (prefix && suffix) {
      const relForPrefix = rel.replace(/^(public|static)\//, '');
      if (relForPrefix.startsWith(prefix) && relForPrefix.endsWith(suffix)) return true;
    }

    // Check with filename only (case `${}/btn-nap.png`). `suffix` keeps the
    // leading "/" from the original reference ("/btn-nap.png") but a bare
    // `fileName` never has one, so compare against a slash-prefixed filename
    // instead of stripping the slash off suffix — otherwise this branch can
    // never match.
    if (!prefix && suffix) {
      if (('/' + fileName).endsWith(suffix)) return true;
    }
  }

  // NOTE: a "Case 3: match by bare filename" fallback (`normalized.endsWith('/' + fileName)`)
  // was deliberately dropped here — this repo has multiple same-named files in different
  // folders (e.g. two independent "bg-rank.png" under /assets/home/rank/ and /assets/rank/),
  // and a bare-filename fallback silently cross-links them to the wrong reference. Case 1's
  // `normalized === fileName` already covers the legitimate bare-filename case safely.

  return false;
}

export function normalize(p: string): string {
  return p
    .replace(/^~/, '')
    .replace(/^@\//, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\?.*$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

export function detectSection(filePath: string, refs: AssetReference[]): string {
  const p = filePath.toLowerCase().replace(/\\/g, '/');

  // Priority: match path hierarchy từ specific → generic
  const pathRules: Array<[RegExp, string]> = [
    // Specific folders
    [/\/float-home\//, 'float-home'],
    [/\/float-bxh\//, 'float-bxh'],
    [/\/header\//, 'header'],
    [/\/footer\//, 'footer'],
    [/\/favicon\//, 'favicon'],

    // Home sub-sections
    [/\/home\/banner\//, 'home-banner'],
    [/\/home\/news\//, 'home-news'],
    [/\/home\/rank\//, 'home-rank'],

    // Top-level sections
    [/\/tintuc\//, 'tintuc'],
    [/\/rank\//, 'rank'],
    [/\/news\//, 'news'],
    [/\/banner\//, 'banner'],
    [/\/icon\//, 'icons'],

    // Component-based (fallback từ references)
  ];

  for (const [regex, section] of pathRules) {
    if (regex.test(p)) return section;
  }

  // Fallback 1: dùng tên file
  const fileName = p.split('/').pop() || '';
  if (fileName.includes('favicon') || fileName === 'vite.svg') return 'favicon';
  if (fileName.includes('logo')) return 'logo';
  if (fileName.startsWith('btn-')) return 'buttons';
  if (fileName.includes('frame')) return 'frame';
  if (fileName.includes('bg-') || fileName.startsWith('bg')) return 'background';
  if (fileName.includes('banner')) return 'banner';
  if (fileName.match(/^top\d+\./)) return 'rank';

  // Fallback 2: dùng reference file path
  for (const ref of refs) {
    const refLower = ref.file.toLowerCase();
    if (refLower.includes('/float-home/')) return 'float-home';
    if (refLower.includes('/float-bxh/')) return 'float-bxh';
    if (refLower.includes('/header')) return 'header';
    if (refLower.includes('/home/')) return 'home';
    if (refLower.includes('/news/')) return 'news';
    if (refLower.includes('/tintuc/')) return 'tintuc';
    if (refLower.includes('/rank')) return 'rank';
    if (refLower.includes('/layout/')) return 'layout';
  }

  return 'other';
}

const FAVICON_PATTERNS = [
  /\/favicon\//i,
  /favicon\.(ico|png|svg)$/i,
  /android-chrome-\d+x\d+\.png$/i,
  /apple-touch-icon\.png$/i,
  /(^|[/\\])vite\.svg$/i,
];

export function isFavicon(filePath: string): boolean {
  const p = filePath.toLowerCase();
  return FAVICON_PATTERNS.some(pattern => pattern.test(p));
}

const EXTERNAL_URL_PATTERN = /^https?:\/\//i;

export function isExternalUrl(url: string): boolean {
  if (!EXTERNAL_URL_PATTERN.test(url)) return false;
  // Không tính localhost
  if (url.includes('localhost')) return false;
  return true;
}

export function detectExternalType(url: string): AssetType {
  const urlLower = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|svg|webp|avif|ico)(\?|$)/i.test(urlLower)) return 'image';
  if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(urlLower)) return 'video';
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(urlLower)) return 'audio';
  if (/\.(woff|woff2|ttf|otf|eot)(\?|$)/i.test(urlLower)) return 'font';
  return 'other';
}

function extractExternalAssets(references: AssetReference[]): DetectedAsset[] {
  const externalRefs = references.filter(ref => isExternalUrl(ref.assetPath));

  // Dedupe by URL
  const seen = new Set<string>();
  const assets: DetectedAsset[] = [];

  for (const ref of externalRefs) {
    if (seen.has(ref.assetPath)) continue;
    seen.add(ref.assetPath);

    const url = ref.assetPath;
    const urlPath = (() => {
      try { return new URL(url).pathname; } catch { return url; }
    })();
    const fileName = urlPath.split('/').pop() || 'external';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    assets.push({
      id: `external.${createHash('sha256').update(url).digest('hex').slice(0, 12)}`,
      canonicalPath: url,
      publicPath: url,                              // Giữ nguyên URL
      type: detectExternalType(url),
      fileName,
      extension,
      size: 0,                                       // Không biết size
      hash: '',
      responsive: 'shared',
      references: externalRefs.filter(r => r.assetPath === url),
      referenceCount: externalRefs.filter(r => r.assetPath === url).length,
      detectedBy: ['static-ref'],
      confidence: 0.9,
      needsManualReview: false,
      isVendor: false,
      isFooter: false,
      section: 'external',
      isAutoManaged: false,
      isExternal: true,
      externalUrl: url,
    });
  }

  return assets;
}
