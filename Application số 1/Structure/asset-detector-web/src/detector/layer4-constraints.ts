import { DetectedAsset, AssetConstraints, AssetMetadata, InjectionConfig } from './types';
import sharp from 'sharp';
import { existsSync } from 'fs';
import path from 'path';

export interface ConstraintsResult {
  enriched: DetectedAsset[];
  stats: {
    withDimensions: number;
    withConstraints: number;
    withMetadata: number;
    withInjection: number;
  };
}

export async function layer4EnrichAssets(
  assets: DetectedAsset[],
  repoPath: string
): Promise<ConstraintsResult> {
  const stats = {
    withDimensions: 0,
    withConstraints: 0,
    withMetadata: 0,
    withInjection: 0,
  };

  const enriched: DetectedAsset[] = [];

  for (const asset of assets) {
    const enhanced = { ...asset };

    // Skip external assets (không đọc được)
    if (asset.isExternal) {
      enriched.push({
        ...enhanced,
        metadata: buildMetadata(asset),
      });
      stats.withMetadata++;
      continue;
    }

    // 1. Đọc dimensions của ảnh
    if (asset.type === 'image' && !asset.isAutoManaged) {
      const dims = await readImageDimensions(
        path.join(repoPath, asset.canonicalPath)
      );
      if (dims) {
        enhanced.dimensions = dims;
        stats.withDimensions++;
      }
    }

    // 2. Build constraints
    enhanced.constraints = buildConstraints(asset, enhanced.dimensions);
    stats.withConstraints++;

    // 3. Build metadata
    enhanced.metadata = buildMetadata(asset);
    stats.withMetadata++;

    // 4. Build injection
    enhanced.injection = buildInjection(asset);
    stats.withInjection++;

    enriched.push(enhanced);
  }

  return { enriched, stats };
}

async function readImageDimensions(
  absolutePath: string
): Promise<{ width: number; height: number } | null> {
  try {
    if (!existsSync(absolutePath)) return null;

    const metadata = await sharp(absolutePath).metadata();
    if (metadata.width && metadata.height) {
      return {
        width: metadata.width,
        height: metadata.height,
      };
    }
  } catch {
    // Not an image or can't read
  }
  return null;
}

function buildConstraints(
  asset: DetectedAsset,
  dimensions?: { width: number; height: number }
): AssetConstraints {
  const constraints: AssetConstraints = {};

  // Ratio
  if (dimensions) {
    const gcd = greatestCommonDivisor(dimensions.width, dimensions.height);
    constraints.ratio = `${dimensions.width / gcd}:${dimensions.height / gcd}`;
    constraints.recommendedWidth = dimensions.width;
    constraints.recommendedHeight = dimensions.height;
  }

  // Max size: gấp đôi file hiện tại, tối thiểu 1MB, tối đa 10MB
  const maxFromCurrent = asset.size * 2;
  const min = 1024 * 1024;      // 1MB
  const max = 10 * 1024 * 1024; // 10MB
  constraints.maxFileSize = Math.min(Math.max(maxFromCurrent, min), max);

  // Allowed formats
  const allowedFormats = ['png', 'jpg', 'jpeg', 'webp'];
  if (asset.extension === 'svg') {
    allowedFormats.unshift('svg');
  }
  constraints.allowedFormats = allowedFormats;

  // Transparency
  constraints.allowTransparent = ['png', 'svg', 'webp'].includes(asset.extension);

  return constraints;
}

function buildMetadata(asset: DetectedAsset): AssetMetadata {
  const label = humanizeFileName(asset.fileName);
  const priority = inferPriority(asset);
  const group = inferGroup(asset);
  const operatorEditable = !asset.isAutoManaged
    && !asset.isVendor
    && !asset.isFooter
    && !asset.isExternal;

  return {
    label,
    description: buildDescription(asset),
    priority,
    operatorEditable,
    group,
  };
}

function buildInjection(asset: DetectedAsset): InjectionConfig {
  const targetPaths: string[] = [];

  if (asset.responsive === 'per-breakpoint' && asset.variants) {
    // Multi-target: từng variant 1 file
    for (const v of Object.values(asset.variants)) {
      if (v) targetPaths.push(v.path);
    }
  } else {
    // Single target
    targetPaths.push(asset.canonicalPath);
  }

  const postProcess: NonNullable<InjectionConfig['postProcess']> = [];
  if (asset.type === 'image') {
    if (asset.responsive === 'per-breakpoint') {
      postProcess.push('resize');
    }
    postProcess.push('optimize');
  }

  return {
    strategy: 'file-override',
    targetPaths,
    postProcess: postProcess.length > 0 ? postProcess : undefined,
  };
}

function humanizeFileName(fileName: string): string {
  // "home-banner-1920.png" → "Home Banner 1920"
  return fileName
    .replace(/\.[^.]+$/, '')
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildDescription(asset: DetectedAsset): string {
  const parts: string[] = [];

  if (asset.section !== 'other') {
    parts.push(`Section: ${asset.section}`);
  }

  if (asset.type === 'image' && asset.dimensions) {
    parts.push(`${asset.dimensions.width}×${asset.dimensions.height}`);
  }

  if (asset.size) {
    parts.push(`${(asset.size / 1024).toFixed(0)} KB`);
  }

  if (asset.referenceCount > 0) {
    parts.push(`${asset.referenceCount} refs`);
  }

  return parts.join(' · ');
}

function inferPriority(asset: DetectedAsset): 'high' | 'medium' | 'low' {
  // High: có nhiều references hoặc file lớn
  if (asset.referenceCount >= 3) return 'high';
  if (asset.size > 500 * 1024) return 'high';  // > 500KB

  // Low: auto-managed (favicon), external
  if (asset.isAutoManaged || asset.isExternal) return 'low';

  // Low: ít dùng
  if (asset.referenceCount === 0) return 'low';

  return 'medium';
}

function inferGroup(asset: DetectedAsset): string {
  const fileName = asset.fileName.toLowerCase();
  const pathLower = asset.canonicalPath.toLowerCase();

  if (fileName.includes('logo')) return 'logo';
  if (fileName.includes('banner')) return 'banner';
  if (fileName.startsWith('btn-')) return 'button';
  if (fileName.includes('frame')) return 'frame';
  if (fileName.includes('bg-') || fileName.startsWith('bg')) return 'background';
  if (fileName.includes('icon')) return 'icon';
  if (fileName.includes('rank') || fileName.match(/^top\d/)) return 'rank';
  if (fileName.includes('favicon')) return 'favicon';
  if (pathLower.includes('/rank/')) return 'rank';

  return 'other';
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}
