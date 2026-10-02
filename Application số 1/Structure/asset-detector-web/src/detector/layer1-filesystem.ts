import { RawAsset, AssetType } from './types';
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
  // .NET build output — `dotnet publish` (unlike `dotnet build`) copies
  // wwwroot into bin/, which would otherwise surface every asset twice.
  '**/bin/**',
  '**/obj/**',
  '**/.vs/**',
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

// Self-contained feature modules bundled inside a repo but explicitly out of
// clone scope (user directive) — "Conhan" is a separate gift-code/event
// mini-site (own Controller/Model/View + wwwroot section) found in 3 of the
// 7 .NET repos surveyed (quy-mon-quan, thao-tung-tamquoc,
// thoi-khong-chi-mong), not part of the homepage template being cloned.
// Same treatment as footer/vendor: a recognized folder-naming convention
// shared across repos, not a per-gameId branch.
const OUT_OF_SCOPE_PATTERNS = [
  /[/\\]conhan[/\\]/i,
];

export interface Layer1Result {
  assets: RawAsset[];
  stats: {
    total: number;
    footerSkipped: number;
    vendorSkipped: number;
    outOfScopeSkipped: number;
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
  let outOfScopeSkipped = 0;
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

    if (OUT_OF_SCOPE_PATTERNS.some(p => p.test(relativePath))) {
      outOfScopeSkipped++;
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
      outOfScopeSkipped,
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
