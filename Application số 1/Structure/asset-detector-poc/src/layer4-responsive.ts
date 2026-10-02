import { DetectedAsset, AssetVariant, BreakpointName } from './types.js';

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
  // Lookup thật để pickPrimaryVariant có thể trả về đúng DetectedAsset gốc
  // (giữ nguyên references/confidence/section/isFooter) thay vì fabricate
  // 1 object giả — asset footer/auto-managed nằm trong folder breakpoint
  // (vd. home/footer/1920/logo.png) không được phép mất flag isFooter khi
  // group.
  const byCanonicalPath = new Map(assets.map(a => [a.canonicalPath, a]));

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

    // variantCount >= 1: có ít nhất 1 breakpoint folder → group thành
    // per-breakpoint, kể cả khi chỉ có đúng 1 variant (flag missing breakpoints
    // cho các breakpoint còn lại — xem Acceptance Phase B: "Không lỗi crash
    // khi có group chỉ 1 variant").

    // Build merged asset — ưu tiên sharedAsset nếu có, không thì lấy asset
    // GỐC (không fabricate) tương ứng với breakpoint ưu tiên cao nhất.
    const primaryAsset = group.sharedAsset
      || pickPrimaryVariant(group.variants, byCanonicalPath);

    const missing = detectMissingBreakpoints(group.variants);

    const mergedAsset: DetectedAsset = {
      ...primaryAsset,
      id: buildResponsiveId(group),
      canonicalPath: primaryAsset.canonicalPath,      // giữ path của primary
      publicPath: primaryAsset.publicPath,
      responsive: 'per-breakpoint',
      variants: group.variants,
      missingBreakpoints: missing.length > 0 ? missing : undefined,
      // Merge confidence: giữ cao nhất (không tối ưu thêm ở đây)
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
    // Group theo tên file KHÔNG kèm extension — 2 breakpoint variant của
    // cùng 1 slot có thể khác định dạng file (vd. banner/768/banner.jpg +
    // banner/1920/banner.png, đúng ví dụ minh hoạ đầu tài liệu này). Nếu
    // group theo fileName đầy đủ (kèm extension) như bản gốc, cặp này sẽ
    // không bao giờ group được với nhau.
    const stem = stripExtension(fileName);
    const groupKey = `${basePath}/${stem}`;

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

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
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
  variants: Partial<Record<BreakpointName, AssetVariant>>,
  byCanonicalPath: Map<string, DetectedAsset>
): DetectedAsset {
  // Ưu tiên desktop > tablet > mobile
  const priority: BreakpointName[] = ['desktop', 'tablet', 'mobile'];

  for (const bp of priority) {
    const v = variants[bp];
    if (v) {
      const real = byCanonicalPath.get(v.path);
      if (real) return real;
    }
  }

  throw new Error('No variants found');
}

export function detectMissingBreakpoints(
  variants: Partial<Record<BreakpointName, AssetVariant>>
): BreakpointName[] {
  // Với game này, repo có 768 + 1920. Có thể không có 375.
  const all: BreakpointName[] = ['mobile', 'tablet', 'desktop'];
  const missing: BreakpointName[] = [];

  // Chỉ flag khi có ít nhất 1 variant
  if (Object.keys(variants).length === 0) return [];

  for (const bp of all) {
    if (!variants[bp]) missing.push(bp);
  }

  return missing;
}

export function buildResponsiveId(group: ResponsiveGroup): string {
  const pathParts = group.basePath.split('/');
  return `asset.${pathParts.slice(-3).join('-')}-${stripExtension(group.fileName)}`.replace(/\//g, '-');
}
