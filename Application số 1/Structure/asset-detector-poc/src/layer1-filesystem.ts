import { RawAsset, AssetType } from './types.js';
import fg from 'fast-glob';
import { stat, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

const ASSET_EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'avif', 'ico'],
  video: ['mp4', 'webm', 'mov'],
  audio: ['mp3', 'wav', 'ogg'],
  font: ['woff', 'woff2', 'ttf', 'otf'],
};

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/*.min.js',
  '**/*.map',
  '**/.turbo/**',
  '**/.vercel/**',
];

const FOOTER_PATTERNS = [
  /[/\\]footer[/\\]/i,
  /[/\\]sdk[/\\]/i,
  /Footer\.(tsx|jsx|ts|js)$/i,
  /footer\.(tsx|jsx|ts|js)$/i,
];

const VENDOR_PATTERNS = [
  /\/lib\//i,
  /\/vendor\//i,
  /bootstrap/i,
  /jquery/i,
  /font-awesome/i,
];

export interface Layer1Result {
  assets: RawAsset[];
  stats: {
    total: number;
    footerSkipped: number;
    vendorSkipped: number;
    byType: Record<AssetType, number>;
  };
}

export async function layer1Scan(repoPath: string): Promise<Layer1Result> {
  const allExts = Object.values(ASSET_EXTENSIONS).flat();
  const files = await fg(`**/*.{${allExts.join(',')}}`, {
    cwd: repoPath,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  const assets: RawAsset[] = [];
  let footerSkipped = 0;
  let vendorSkipped = 0;
  const byType: Record<AssetType, number> = {
    image: 0, video: 0, audio: 0, font: 0, other: 0,
  };

  for (const file of files) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    if (FOOTER_PATTERNS.some(p => p.test(relativePath))) {
      footerSkipped++;
      continue;
    }

    if (VENDOR_PATTERNS.some(p => p.test(relativePath))) {
      vendorSkipped++;
      continue;
    }

    const statResult = await stat(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = classifyByExt(ext);
    const buffer = await readFile(file);
    const hash = createHash('sha256').update(buffer).digest('hex');

    assets.push({
      absolutePath: file,
      relativePath,
      fileName: path.basename(file),
      extension: ext,
      type,
      size: statResult.size,
      hash,
      detectedBy: 'filesystem',
      confidence: 1.0,
    });

    byType[type]++;
  }

  return {
    assets,
    stats: {
      total: assets.length,
      footerSkipped,
      vendorSkipped,
      byType,
    },
  };
}

function classifyByExt(ext: string): AssetType {
  if (ASSET_EXTENSIONS.image.includes(ext)) return 'image';
  if (ASSET_EXTENSIONS.video.includes(ext)) return 'video';
  if (ASSET_EXTENSIONS.audio.includes(ext)) return 'audio';
  if (ASSET_EXTENSIONS.font.includes(ext)) return 'font';
  return 'other';
}
