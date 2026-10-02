# Phase B + C — Responsive Variants + Constraints + Metadata

## Metadata
- **Game ID:** phuong-hoang-tru-tien
- **Repo Path:** ./game-template-repo/phuong-hoang-tru-tien/home-page/
- **POC Project:** ./asset-detector-poc/
- **Input:** `manifest.json` (đã có Phase A + A-ADAPT)
- **Output:** `manifest.json` updated với responsive variants + constraints

## Mục Tiêu

### Phase B — Responsive Variants Grouping
Group các asset cùng base name thành **1 slot với nhiều variants** (mobile/tablet/desktop).

**Ví dụ:**
```
Trước:                               Sau:
- banner/768/banner.jpg              - asset.banner (responsive)
- banner/1920/banner.png               ├── mobile:  375/banner.jpg
                                       ├── tablet:  768/banner.jpg
                                       └── desktop: 1920/banner.png
```

### Phase C — Constraints + Metadata
Với mỗi asset, thêm:
- **Constraints**: ratio, size, format, maxFileSize
- **Metadata**: label, description, priority, operator editable
- **Injection**: strategy, target paths

## Nguyên Tắc Cho Agent
- Chỉ xử lý game `phuong-hoang-tru-tien`
- Không động vào code Layer 1, Layer 2
- Không mở rộng scope
- Report theo OUTPUT FORMAT ở cuối file
- Sau mỗi phase (B, C) chạy verify checklist

## Context — Cấu trúc asset hiện tại

Từ manifest hiện tại, cấu trúc folder có dạng:

```
public/assets/
├── header/
│   ├── logo-game.png
│   └── btn-download.png
├── float-home/
│   ├── btn-apk.png
│   ├── btn-bxh.png
│   └── ...
├── home/
│   ├── banner/
│   │   ├── logo-game.png
│   │   ├── 768/
│   │   │   ├── banner.jpg
│   │   │   └── text-game.png
│   │   └── 1920/
│   │       ├── banner.png
│   │       ├── logo-18.png
│   │       └── text-game.png
│   ├── news/
│   │   ├── 768/
│   │   │   ├── banner.png
│   │   │   ├── btn-cskh.png
│   │   │   └── ...
│   │   └── 1920/
│   │       ├── banner.png
│   │       ├── btn-cskh.png
│   │       └── ...
│   └── rank/
│       ├── all.png
│       ├── custom.png
│       ├── top1.png
│       ├── top2.png
│       ├── top3.png
│       ├── 768/
│       │   └── bg-rank.png
│       └── 1920/
│           └── bg-rank.png
├── tintuc/
│   ├── 768/
│   │   ├── banner_trang2.png
│   │   └── ...
│   └── 1920/
│       ├── banner_trang2.png
│       └── ...
└── rank/
    ├── 768/
    │   ├── bg-rank.png
    │   └── title-rank.png
    └── 1920/
        ├── bg-rank.png
        └── title-rank.png
```

**Các pattern responsive cần detect:**
1. Folder `768/` và `1920/` = tablet và desktop (KHÔNG có mobile 375)
2. Cùng file name trong các folder khác nhau = responsive variants
3. File không có folder breakpoint = shared (dùng cho mọi viewport)

**Lưu ý:** Repo này CHỈ CÓ 2 breakpoints (768, 1920), KHÔNG có 375. Cần handle graceful.

---

# PHASE B — RESPONSIVE VARIANTS GROUPING

## Bước B.1 — Update Types (30 phút)

Mở `src/types.ts`, thêm types mới:

```typescript
// Thêm vào src/types.ts

export type ResponsiveMode = 'shared' | 'per-breakpoint';

export type BreakpointName = 'mobile' | 'tablet' | 'desktop';

export interface AssetVariant {
  breakpoint: BreakpointName;
  path: string;
  publicPath: string;
  fileName: string;
  size: number;
  hash: string;
  width?: number;
  height?: number;
  ratio?: string;
}

export interface ResponsiveInfo {
  mode: ResponsiveMode;
  variants?: Partial<Record<BreakpointName, AssetVariant>>;
  missingBreakpoints?: BreakpointName[];   // breakpoints không có file
}
```

**Update `DetectedAsset`:**

```typescript
export interface DetectedAsset {
  // ... existing fields
  responsive: ResponsiveMode;              // ← đã có
  variants?: Partial<Record<BreakpointName, AssetVariant>>;  // ← NEW
  missingBreakpoints?: BreakpointName[];   // ← NEW
}
```

## Bước B.2 — Tạo file `src/layer4-responsive.ts`

```typescript
import { DetectedAsset, AssetVariant, BreakpointName, RawAsset } from './types.js';
import path from 'path';

/**
 * Detect responsive variants từ danh sách assets.
 *
 * Pattern:
 *  - `xxx/768/file.png` và `xxx/1920/file.png` → 1 asset với 2 variants (tablet, desktop)
 *  - `xxx/file.png` (không có folder breakpoint) → shared
 *  - `xxx/375/file.png` (nếu có) → mobile
 */

const BREAKPOINT_FOLDER_PATTERN = /^(375|768|1024|1440|1920|mobile|tablet|desktop)$/i;

const FOLDER_TO_BREAKPOINT: Record<string, BreakpointName> = {
  '375': 'mobile',
  '768': 'tablet',
  '1024': 'tablet',
  '1440': 'desktop',
  '1920': 'desktop',
  'mobile': 'mobile',
  'tablet': 'tablet',
  'desktop': 'desktop',
};

export interface ResponsiveGroup {
  groupKey: string;                  // key dùng để group (đường dẫn không có breakpoint)
  basePath: string;                  // vd: public/assets/home/banner
  fileName: string;                  // vd: banner.png
  variants: Partial<Record<BreakpointName, AssetVariant>>;
  sharedAsset?: DetectedAsset;       // nếu không có folder breakpoint
}

export interface ResponsiveResult {
  groups: ResponsiveGroup[];
  grouped: DetectedAsset[];
  ungrouped: DetectedAsset[];
  stats: {
    totalGroups: number;
    totalAssetsInGroups: number;
    perBreakpointGroups: number;
    sharedOnlyGroups: number;
  };
}

export async function layer4GroupResponsive(
  assets: DetectedAsset[]
): Promise<ResponsiveResult> {
  // Step 1: Parse từng asset → xem có breakpoint folder không
  const parsed = assets.map(a => parseAssetPath(a));

  // Step 2: Group theo groupKey
  const groups = new Map<string, ResponsiveGroup>();

  for (const p of parsed) {
    const key = p.groupKey;

    if (!groups.has(key)) {
      groups.set(key, {
        groupKey: key,
        basePath: p.basePath,
        fileName: p.fileName,
        variants: {},
      });
    }

    const group = groups.get(key)!;

    if (p.breakpoint) {
      // Asset nằm trong folder breakpoint
      group.variants[p.breakpoint] = buildVariant(p.asset, p.breakpoint);
    } else {
      // Asset không có folder breakpoint → shared
      group.sharedAsset = p.asset;
    }
  }

  // Step 3: Build DetectedAsset mới từ groups
  const grouped: DetectedAsset[] = [];
  const ungrouped: DetectedAsset[] = [];

  for (const group of groups.values()) {
    const variantCount = Object.keys(group.variants).length;

    if (variantCount === 0) {
      // Chỉ có shared asset
      if (group.sharedAsset) {
        ungrouped.push({
          ...group.sharedAsset,
          responsive: 'shared',
        });
      }
      continue;
    }

    if (variantCount === 1 && !group.sharedAsset) {
      // Chỉ có 1 variant → vẫn cần group (vì có folder breakpoint)
      // nhưng flag missing breakpoints
    }

    // Build merged asset
    const primaryAsset = group.sharedAsset
      || pickPrimaryVariant(group.variants);

    const missing = detectMissingBreakpoints(group.variants);

    const mergedAsset: DetectedAsset = {
      ...primaryAsset,
      id: buildResponsiveId(group),
      canonicalPath: primaryAsset.canonicalPath,      // giữ path của primary
      publicPath: primaryAsset.publicPath,
      responsive: 'per-breakpoint',
      variants: group.variants,
      missingBreakpoints: missing.length > 0 ? missing : undefined,
      // Merge confidence: giữ cao nhất
      confidence: Math.max(
        primaryAsset.confidence,
        ...Object.values(group.variants).map(() => 0.9)
      ),
    };

    grouped.push(mergedAsset);
  }

  return {
    groups: Array.from(groups.values()),
    grouped,
    ungrouped,
    stats: {
      totalGroups: groups.size,
      totalAssetsInGroups: grouped.reduce((sum, g) => sum + Object.keys(g.variants || {}).length, 0),
      perBreakpointGroups: grouped.length,
      sharedOnlyGroups: ungrouped.length,
    },
  };
}

interface ParsedAsset {
  asset: DetectedAsset;
  groupKey: string;
  basePath: string;
  fileName: string;
  breakpoint?: BreakpointName;
}

function parseAssetPath(asset: DetectedAsset): ParsedAsset {
  // canonicalPath: "public/assets/home/banner/1920/banner.png"
  const parts = asset.canonicalPath.split('/');
  const fileName = parts[parts.length - 1];

  // Kiểm tra xem phần folder áp chót có phải breakpoint không
  const maybeBreakpoint = parts[parts.length - 2];
  const isBreakpoint = BREAKPOINT_FOLDER_PATTERN.test(maybeBreakpoint);

  if (isBreakpoint) {
    const breakpoint = FOLDER_TO_BREAKPOINT[maybeBreakpoint.toLowerCase()];
    const basePath = parts.slice(0, -2).join('/');
    const groupKey = `${basePath}/${fileName}`;

    return {
      asset,
      groupKey,
      basePath,
      fileName,
      breakpoint,
    };
  }

  // Không có breakpoint folder → shared
  const basePath = parts.slice(0, -1).join('/');
  const groupKey = `${basePath}/${fileName}`;

  return {
    asset,
    groupKey,
    basePath,
    fileName,
  };
}

function buildVariant(asset: DetectedAsset, breakpoint: BreakpointName): AssetVariant {
  return {
    breakpoint,
    path: asset.canonicalPath,
    publicPath: asset.publicPath,
    fileName: asset.fileName,
    size: asset.size,
    hash: asset.hash,
  };
}

function pickPrimaryVariant(
  variants: Partial<Record<BreakpointName, AssetVariant>>
): DetectedAsset {
  // Ưu tiên desktop > tablet > mobile
  const priority: BreakpointName[] = ['desktop', 'tablet', 'mobile'];

  for (const bp of priority) {
    const v = variants[bp];
    if (v) {
      // Build a fake DetectedAsset from variant
      // (chỉ dùng để lấy metadata cơ bản)
      return {
        id: '',
        canonicalPath: v.path,
        publicPath: v.publicPath,
        type: 'image',
        fileName: v.fileName,
        extension: v.fileName.split('.').pop() || '',
        size: v.size,
        hash: v.hash,
        responsive: 'per-breakpoint',
        references: [],
        referenceCount: 0,
        detectedBy: ['filesystem'],
        confidence: 0.9,
        needsManualReview: false,
        isVendor: false,
        isFooter: false,
        section: 'other',
        isAutoManaged: false,
        isExternal: false,
      };
    }
  }

  throw new Error('No variants found');
}

function detectMissingBreakpoints(
  variants: Partial<Record<BreakpointName, AssetVariant>>
): BreakpointName[] {
  // Với game này, repo có 768 + 1920. Có thể không có 375.
  // Chỉ flag mobile là missing nếu desktop có nhưng mobile không có.
  const all: BreakpointName[] = ['mobile', 'tablet', 'desktop'];
  const missing: BreakpointName[] = [];

  // Chỉ flag khi có ít nhất 1 variant
  if (Object.keys(variants).length === 0) return [];

  for (const bp of all) {
    if (!variants[bp]) missing.push(bp);
  }

  return missing;
}

function buildResponsiveId(group: ResponsiveGroup): string {
  // Lấy tên file không có extension + path viết tắt
  const fileName = group.fileName.replace(/\.[^.]+$/, '');
  const pathParts = group.basePath.split('/');
  const pathHint = pathParts.slice(-2).join('-');
  return `asset.${pathParts.slice(-3).join('-')}`.replace(/\//g, '-');
}
```

## Bước B.3 — Update `src/index.ts`

Tích hợp Phase B:

```typescript
// Trong src/index.ts
import { layer4GroupResponsive } from './layer4-responsive.js';

// ...sau khi mergeDetected() xong, TRƯỚC khi build result

// Step 4.5: Group responsive
console.log('[4.5/6] Grouping responsive variants...');
const responsiveResult = await layer4GroupResponsive(assets);
const finalAssets = [
  ...responsiveResult.grouped,
  ...responsiveResult.ungrouped,
];
console.log(`      ✓ ${responsiveResult.stats.perBreakpointGroups} responsive groups`);
console.log(`      ✓ ${responsiveResult.stats.sharedOnlyGroups} shared assets`);
console.log(`      ⚠️  ${responsiveResult.stats.totalGroups - responsiveResult.stats.perBreakpointGroups - responsiveResult.stats.sharedOnlyGroups} ungrouped\n`);

// Update result với finalAssets thay vì assets
const result: DetectionResult = {
  // ...
  assets: finalAssets,                       // ← dùng finalAssets
  references,
  dynamicBlocks: apiBlocksResult.dynamicBlocks,
  // ...
};

// Write extra file
await writeFile(
  path.join(outputDir, 'responsive-groups.json'),
  JSON.stringify(responsiveResult.groups, null, 2)
);
```

## Bước B.4 — Update `report-generator.ts`

Thêm section responsive:

```typescript
// Trong generateReport, sau Summary

const responsive = r.assets.filter(a => a.responsive === 'per-breakpoint');
const shared = r.assets.filter(a => a.responsive === 'shared');

lines.push(`\n## Responsive\n`);
lines.push(`- Per-breakpoint groups: ${responsive.length}`);
lines.push(`- Shared assets: ${shared.length}`);
lines.push('');

if (responsive.length > 0) {
  lines.push(`### Responsive Groups (${responsive.length})\n`);
  for (const a of responsive) {
    lines.push(`- \`${a.canonicalPath}\``);
    const variants = a.variants || {};
    for (const [bp, v] of Object.entries(variants)) {
      lines.push(`  - ${bp}: \`${v.path}\` (${(v.size / 1024).toFixed(1)} KB)`);
    }
    if (a.missingBreakpoints && a.missingBreakpoints.length > 0) {
      lines.push(`  - ⚠️ missing: ${a.missingBreakpoints.join(', ')}`);
    }
  }
}
```

## Bước B.5 — Chạy detect lại

```bash
cd asset-detector-poc
npm run typecheck
npm run detect:phuong-hoang
```

## Bước B.6 — Verify Phase B

```bash
echo "=== Responsive groups ==="
cat output/phuong-hoang-tru-tien/responsive-groups.json | jq '.[] | {file: .fileName, variantCount: (.variants | keys | length)}'

echo ""
echo "=== Summary ==="
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary'

echo ""
echo "=== Per-breakpoint assets ==="
cat output/phuong-hoang-tru-tien/assets.json | jq '[.[] | select(.responsive == "per-breakpoint")] | length'

echo ""
echo "=== Sample responsive asset ==="
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.responsive == "per-breakpoint") | {path: .canonicalPath, variants: (.variants | keys), missing: .missingBreakpoints}' | head -40
```

## ✅ Acceptance Phase B

- [ ] `responsive-groups.json` được tạo
- [ ] Manifest có `assets` với `responsive: "per-breakpoint"` và `variants`
- [ ] Các cặp `768/xxx` + `1920/xxx` được group thành 1 asset
- [ ] Asset không có folder breakpoint → `responsive: "shared"`
- [ ] `missingBreakpoints` flag đúng (mobile thường missing)
- [ ] Typecheck pass
- [ ] Không lỗi crash khi có group chỉ 1 variant

---

# PHASE C — CONSTRAINTS + METADATA

## Bước C.1 — Cài dependencies

```bash
cd asset-detector-poc
npm install sharp
```

**Lý do:** `sharp` để đọc dimensions của ảnh.

## Bước C.2 — Update Types

Thêm vào `src/types.ts`:

```typescript
export interface AssetConstraints {
  ratio?: string;                  // "16:9", "1:1", etc.
  recommendedWidth?: number;
  recommendedHeight?: number;
  maxFileSize?: number;            // bytes
  allowedFormats?: string[];       // ['png', 'jpg', 'webp']
  allowTransparent?: boolean;
}

export interface AssetMetadata {
  label: string;                   // "Home Banner"
  description?: string;            // "Banner chính trang chủ"
  priority: 'high' | 'medium' | 'low';
  operatorEditable: boolean;       // có cho operator thay không
  group: string;                   // "banner", "logo", "button", ...
}

export interface InjectionConfig {
  strategy: 'file-override' | 'env-inject' | 'manual';
  targetPaths: string[];           // list path cần override
  postProcess?: ('resize' | 'optimize' | 'convert')[];
}

// Update DetectedAsset
export interface DetectedAsset {
  // ... existing fields
  constraints?: AssetConstraints;   // ← NEW
  metadata?: AssetMetadata;         // ← NEW
  injection?: InjectionConfig;      // ← NEW
  dimensions?: { width: number; height: number };  // ← NEW
}
```

## Bước C.3 — Tạo file `src/layer4-constraints.ts`

```typescript
import { DetectedAsset, AssetConstraints, AssetMetadata, InjectionConfig } from './types.js';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
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
      targetPaths.push(v.path);
    }
  } else {
    // Single target
    targetPaths.push(asset.canonicalPath);
  }

  const postProcess: InjectionConfig['postProcess'] = [];
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
```

## Bước C.4 — Update `src/index.ts`

```typescript
// Import layer4EnrichAssets
import { layer4EnrichAssets } from './layer4-constraints.js';

// Step 5: Enrich assets với constraints + metadata
console.log('[5/6] Enriching with constraints + metadata...');
const enrichResult = await layer4EnrichAssets(finalAssets, repoPath);
const enrichedAssets = enrichResult.enriched;
console.log(`      ✓ ${enrichResult.stats.withDimensions} assets có dimensions`);
console.log(`      ✓ ${enrichResult.stats.withConstraints} assets có constraints`);
console.log(`      ✓ ${enrichResult.stats.withMetadata} assets có metadata`);
console.log(`      ✓ ${enrichResult.stats.withInjection} assets có injection config\n`);

// Update result.assets = enrichedAssets
const result: DetectionResult = {
  // ...
  assets: enrichedAssets,
  // ...
};

// Write extra file
await writeFile(
  path.join(outputDir, 'enriched-assets.json'),
  JSON.stringify(enrichedAssets, null, 2)
);
```

## Bước C.5 — Update `report-generator.ts`

Thêm section:

```typescript
// Trong generateReport

lines.push(`\n## Constraints Summary\n`);
const withDims = r.assets.filter(a => a.dimensions).length;
const withConstraints = r.assets.filter(a => a.constraints).length;
const withMeta = r.assets.filter(a => a.metadata).length;
const operatorEditable = r.assets.filter(a => a.metadata?.operatorEditable).length;

lines.push(`- With dimensions: ${withDims}`);
lines.push(`- With constraints: ${withConstraints}`);
lines.push(`- With metadata: ${withMeta}`);
lines.push(`- Operator editable: ${operatorEditable}`);
lines.push('');

// Group by metadata.group
lines.push(`### Assets by Group\n`);
const byGroup: Record<string, number> = {};
for (const a of r.assets) {
  const g = a.metadata?.group || 'other';
  byGroup[g] = (byGroup[g] || 0) + 1;
}
for (const [group, count] of Object.entries(byGroup).sort(([, a], [, b]) => b - a)) {
  lines.push(`- ${group}: ${count}`);
}
```

## Bước C.6 — Chạy detect lại

```bash
npm run typecheck
npm run detect:phuong-hoang
```

## Bước C.7 — Verify Phase C

```bash
echo "=== Enriched assets ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[0:3]'

echo ""
echo "=== Dimensions stats ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '[.[] | select(.dimensions != null)] | length'

echo ""
echo "=== Operator editable ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '[.[] | select(.metadata.operatorEditable == true)] | length'

echo ""
echo "=== Sample with constraints ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[] | select(.constraints.ratio != null) | {path: .canonicalPath, dimensions, constraints}' | head -50

echo ""
echo "=== By group ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq 'group_by(.metadata.group) | map({group: .[0].metadata.group, count: length})'
```

## ✅ Acceptance Phase C

- [ ] `enriched-assets.json` được tạo
- [ ] Mỗi image asset có `dimensions` (width, height)
- [ ] Mỗi asset có `constraints` (ratio, maxFileSize, allowedFormats)
- [ ] Mỗi asset có `metadata` (label, priority, operatorEditable, group)
- [ ] Mỗi asset có `injection` (strategy, targetPaths)
- [ ] Favicon/external có `operatorEditable: false`
- [ ] Group phân loại hợp lý (logo, banner, button, rank, ...)
- [ ] Report có section Constraints Summary
- [ ] Typecheck pass
- [ ] Không crash khi `sharp` không đọc được file

---

# PHASE B+C — INTEGRATION TEST

## Bước BC.1 — Chạy full pipeline

```bash
cd asset-detector-poc
npm run detect:phuong-hoang
```

Output mong đợi:

```
🎮 Detecting: phuong-hoang-tru-tien
📁 Repo: ...

[1/4] Detecting framework...
      ✓ vite-spa ^6.3.5 (spa)

[2/4] Scanning filesystem...
      ✓ 71 assets found
      ⏭️  8 footer files skipped

[3/4] Scanning references...
      ✓ 108 references found

[3.5/5] Scanning API blocks...
      ✓ 2 dynamic blocks found

[4/4] Merging...
      ✓ 71 assets merged
      ✓ Avg confidence: 0.87

[4.5/6] Grouping responsive variants...
      ✓ 12 responsive groups
      ✓ 45 shared assets

[5/6] Enriching with constraints + metadata...
      ✓ 63 assets có dimensions
      ✓ 71 assets có constraints
      ✓ 71 assets có metadata
      ✓ 71 assets có injection config

✅ Done in XXXms
📄 Output: ./output/phuong-hoang-tru-tien/
```

## Bước BC.2 — Verify toàn bộ

```bash
echo "=== Manifest summary ==="
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary'

echo ""
echo "=== Files created ==="
ls -la output/phuong-hoang-tru-tien/

echo ""
echo "=== Sample enriched asset (full) ==="
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[] | select(.responsive == "per-breakpoint") | .' | head -60
```

## Bước BC.3 — Test case đặc biệt

```bash
# 1. Asset có responsive variants
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[] | select(.responsive == "per-breakpoint") | {path: .canonicalPath, variants: (.variants | keys), missing: .missingBreakpoints}'

# 2. Asset shared
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[] | select(.responsive == "shared" and .isAutoManaged == false) | {path: .canonicalPath, group: .metadata.group} | first'

# 3. Favicon (auto-managed, không editable)
cat output/phuong-hoang-tru-tien/enriched-assets.json | jq '.[] | select(.isAutoManaged == true) | {path: .canonicalPath, editable: .metadata.operatorEditable}'
```

## Bước BC.4 — Report cuối

Tạo file `./PHASE-B-C-REPORT.md`:

```markdown
# Phase B + C Report: phuong-hoang-tru-tien

## Phase B — Responsive Grouping

### Results
- Total assets: [N]
- Responsive groups: [N]
- Shared assets: [N]
- Missing mobile breakpoints: [N]

### Sample groups
```
[paste 3-5 examples]
```

## Phase C — Constraints + Metadata

### Results
- Assets with dimensions: [N]/[N]
- Assets with constraints: [N]/[N]
- Assets with metadata: [N]/[N]
- Operator editable: [N]
- By group: [breakdown]

### Sample enriched asset
```json
[paste 1 example]
```

## Full Pipeline

### Timeline
- Framework detection: [X]ms
- Layer 1 filesystem: [X]ms
- Layer 2 references: [X]ms
- API blocks: [X]ms
- Merge: [X]ms
- Responsive grouping: [X]ms
- Enrichment: [X]ms
- **Total: [X]ms**

### Output files
- manifest.json
- assets.json
- references.json
- dynamic-blocks.json
- api-calls.json
- responsive-groups.json
- enriched-assets.json
- report.md

## Overall
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Ready for Phase D (Build/Deploy Config): [yes/no]
- Notes: [text]
```

---

# OUTPUT FORMAT (Agent Báo Cáo)

```
## ✅ PHASE B + C COMPLETE

### Phase B — Responsive Grouping
- Total assets trước grouping: [N]
- Responsive groups: [N]
- Shared assets: [N]
- Assets missing mobile: [N]
- Duration: [X]ms

### Phase C — Constraints + Metadata
- Assets với dimensions: [N]/[N]
- Assets với constraints: [N]
- Assets với metadata: [N]
- Operator editable: [N]
- Group distribution: [breakdown]
- Duration: [X]ms

### Files Modified
- src/types.ts
- src/layer4-responsive.ts (new)
- src/layer4-constraints.ts (new)
- src/index.ts
- src/report-generator.ts
- package.json (+ sharp)

### Output Files
- responsive-groups.json (new)
- enriched-assets.json (new)
- manifest.json (updated)

### Typecheck
- npm run typecheck: ✅ / ❌

### Sample Output
```json
[paste 1 enriched asset with variants + constraints + metadata]
```

### Overall
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Ready for Phase D: [yes/no]
- Notes: [text]
```

---

# NẾU FAIL — ROLLBACK

Nếu Phase B hoặc C fail:

1. **Không tự ý mở rộng scope**
2. **Backup manifest trước khi fix:**
   ```bash
   cp output/phuong-hoang-tru-tien/manifest.json \
      output/phuong-hoang-tru-tien/manifest-before-BC.json
   ```
3. **Report cụ thể lỗi:**
   - Phase nào fail
   - Lỗi gì (message, stack)
   - Đã thử gì
4. **Chờ confirm**

---

# KHÔNG LÀM TRONG FILE NÀY

- ❌ Không detect swiper slides
- ❌ Không build Clone Tool
- ❌ Không detect game khác
- ❌ Không thêm DB
- ❌ Không tối ưu confidence thêm

Chỉ Phase B (Responsive) + Phase C (Constraints).

---

# BƯỚC TIẾP THEO

Sau khi Phase B+C pass:

**Phase D — Build & Deploy Config**
- Detect build config từ `package.json` + `vite.config`
- Generate Dockerfile cho Vite SPA
- Detect env vars cần inject khi build
- Detect deploy target (nginx/docker/K8s)
- Output: `manifest.build` + `manifest.deploy`

Sau đó mới đến **Clone Tool** (BƯỚC 3 trong pipeline).