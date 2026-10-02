# Detect Game: phuong-hoang-tru-tien

## Metadata
- **Game ID:** phuong-hoang-tru-tien
- **Game Name:** Phượng Hoàng Trứ Tiên
- **Repo Path:** ./game-template-repo/phuong-hoang-tru-tien/
- **Framework:** Next.js
- **Output Dir:** ./asset-detector-poc/output/phuong-hoang-tru-tien/

## Mục Tiêu
Detect toàn bộ assets trong repo game này, xuất ra JSON để verify.
**KHÔNG cần DB** ở bước này — chỉ cần output JSON đúng format.

## Nguyên Tắc Cho Agent
- Thực thi tuần tự từ Phase 0 → Phase 6
- Sau mỗi phase, chạy verification theo checklist
- Nếu fail → dừng, báo cáo, KHÔNG tiếp tục
- Cuối cùng report theo OUTPUT FORMAT ở Phase 6
- KHÔNG mở rộng scope ngoài requirements

---

# PHASE 0 — AUDIT GAME (30 phút)

## Mục đích
Hiểu cấu trúc repo trước khi detect để adjust code chính xác.

## Bước 0.1 — Kiểm tra framework

```bash
cd game-template-repo/phuong-hoang-tru-tien

echo "=== package.json ==="
cat package.json | head -50

echo ""
echo "=== Next.js version ==="
cat package.json | grep '"next"'
cat package.json | grep '"react"'

echo ""
echo "=== Router detection ==="
ls -la src/app/ 2>/dev/null && echo "→ APP ROUTER"
ls -la src/pages/ 2>/dev/null && echo "→ PAGES ROUTER (src/)"
ls -la pages/ 2>/dev/null && echo "→ PAGES ROUTER (root)"
ls -la app/ 2>/dev/null && echo "→ APP ROUTER (root)"

echo ""
echo "=== Package manager ==="
ls pnpm-lock.yaml yarn.lock package-lock.json 2>/dev/null

echo ""
echo "=== Styling ==="
cat package.json | grep -i tailwind
ls tailwind.config.* 2>/dev/null
```

## Bước 0.2 — Kiểm tra assets

```bash
echo "=== Public folder ==="
find public -type f 2>/dev/null | head -50
echo ""
echo "Total files in public/:"
find public -type f 2>/dev/null | wc -l

echo ""
echo "=== Asset breakdown ==="
find public -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) 2>/dev/null | wc -l
find public -type f -name "*.svg" 2>/dev/null | wc -l
find public -type f -name "*.webp" 2>/dev/null | wc -l
find public -type f \( -name "*.mp4" -o -name "*.webm" \) 2>/dev/null | wc -l
find public -type f \( -name "*.woff" -o -name "*.woff2" -o -name "*.ttf" \) 2>/dev/null | wc -l

echo ""
echo "=== Folder structure in public/ ==="
find public -type d 2>/dev/null
```

## Bước 0.3 — Kiểm tra data-slot, footer, swiper

```bash
echo "=== data-slot ==="
grep -r "data-slot" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -20
grep -r "data-slot" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | wc -l

echo ""
echo "=== Footer detection ==="
find src -iname "*footer*" 2>/dev/null
find public -iname "*footer*" 2>/dev/null
find src -iname "*sdk*" 2>/dev/null

echo ""
echo "=== Swiper library ==="
cat package.json | grep -i -E 'swiper|slider|carousel|embla|slick'

echo ""
echo "=== Swiper usage in code ==="
grep -rl "Swiper\|swiper" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null

echo ""
echo "=== Video usage ==="
grep -rl "<video" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null

echo ""
echo "=== API calls ==="
grep -r "/api/config/buttons" src/ --include="*.tsx" --include="*.ts" 2>/dev/null
grep -r "/api/leaderboard" src/ --include="*.tsx" --include="*.ts" 2>/dev/null
```

## Bước 0.4 — Ghi audit report

Tạo file `./audit-phuong-hoang-tru-tien.md` với format:

```markdown
# Audit Report: phuong-hoang-tru-tien

## Framework
- Next.js version: [X.X.X]
- React version: [X.X.X]
- Router: [app | pages]
- Package Manager: [npm | yarn | pnpm]
- Node: [from engines.node]
- Styling: [tailwind | unknown]

## Assets
- Public folder exists: [yes/no]
- Total files: [N]
- Images (jpg/png): [N]
- SVG: [N]
- WebP: [N]
- Video: [N]
- Font: [N]
- Subfolders: [list]

## data-slot
- Files with data-slot: [N]
- Total occurrences: [N]
- Slots found: [list]

## Footer
- Footer folder: [yes/no]
- Footer files: [list]
- SDK folder: [yes/no]

## Swiper
- Library: [swiper/keen-slider/none]
- Files using swiper: [list]

## Video
- Files with <video>: [list]

## API Calls
- /api/config/buttons: [count]
- /api/leaderboard: [count]
```

## ✅ Acceptance Phase 0
- Audit report file đã tạo
- Biết chính xác: framework, router, PM, asset count, có swiper không, có footer không

---

# PHASE 1 — SETUP POC PROJECT (1 giờ)

## Bước 1.1 — Tạo folder structure

```bash
mkdir -p asset-detector-poc/src
mkdir -p asset-detector-poc/output
cd asset-detector-poc
```

Tạo cấu trúc:

```
asset-detector-poc/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── framework-detector.ts
│   ├── layer1-filesystem.ts
│   ├── layer2-nextjs.ts
│   ├── layer4-merge.ts
│   └── report-generator.ts
└── output/
```

## Bước 1.2 — Tạo `package.json`

```json
{
  "name": "asset-detector-poc",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "detect": "tsx src/index.ts",
    "detect:phuong-hoang": "tsx src/index.ts --repo ../game-template-repo/phuong-hoang-tru-tien --game-id phuong-hoang-tru-tien",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/parser": "^7.24.0",
    "@babel/traverse": "^7.24.0",
    "fast-glob": "^3.3.2"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/babel__traverse": "^7.20.5",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  }
}
```

## Bước 1.3 — Tạo `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

## Bước 1.4 — Install

```bash
npm install
npm run typecheck
```

## ✅ Acceptance Phase 1
- `npm install` thành công
- `npm run typecheck` pass (chưa có file code)
- Folder structure đúng

---

# PHASE 2 — IMPLEMENT DETECTION CODE (Copy từ template)

## Bước 2.1 — `src/types.ts`

```typescript
export type Framework = 'nextjs' | 'dotnet-mvc';

export interface FrameworkInfo {
  framework: Framework;
  version: string;
  router?: 'app' | 'pages';
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  styling?: string;
  nodeVersion?: string;
  confidence: number;
}

export type AssetType = 'image' | 'video' | 'audio' | 'font' | 'other';

export interface RawAsset {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  type: AssetType;
  size: number;
  hash: string;
  detectedBy: 'filesystem';
  confidence: number;
}

export interface AssetReference {
  file: string;
  line: number;
  type: string;
  assetPath: string;
  attribute?: string;
  usage: string;
  confidence: number;
  section?: string;
}

export interface DetectedAsset {
  id: string;
  canonicalPath: string;
  publicPath: string;
  type: AssetType;
  fileName: string;
  extension: string;
  size: number;
  hash: string;
  responsive: 'shared' | 'per-breakpoint';
  references: AssetReference[];
  referenceCount: number;
  detectedBy: string[];
  confidence: number;
  needsManualReview: boolean;
  isVendor: boolean;
  isFooter: boolean;
  section: string;
}

export interface DetectionResult {
  gameId: string;
  repoPath: string;
  framework: FrameworkInfo;
  assets: DetectedAsset[];
  references: AssetReference[];
  summary: {
    totalAssets: number;
    totalReferences: number;
    avgConfidence: number;
    needsReview: number;
    byType: Record<AssetType, number>;
    bySection: Record<string, number>;
  };
  detectedAt: string;
  durationMs: number;
}
```

## Bước 2.2 — `src/framework-detector.ts`

```typescript
import { FrameworkInfo } from './types.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';

export async function detectFramework(repoPath: string): Promise<FrameworkInfo> {
  // Check .NET first
  const csprojFiles = await fg('**/*.csproj', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/bin/**', '**/obj/**'],
  });
  if (csprojFiles.length > 0) {
    return detectDotNet(csprojFiles[0]);
  }

  // Check Next.js
  const pkgPath = path.join(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    if (pkg.dependencies?.next) {
      return detectNextJs(repoPath, pkg);
    }
  }

  throw new Error('Unsupported framework: not Next.js or .NET');
}

async function detectDotNet(csprojPath: string): Promise<FrameworkInfo> {
  const content = await readFile(csprojPath, 'utf-8');
  const tfm = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/)?.[1] || 'net8.0';
  return {
    framework: 'dotnet-mvc',
    version: tfm,
    confidence: 1.0,
  };
}

async function detectNextJs(repoPath: string, pkg: any): Promise<FrameworkInfo> {
  const router: 'app' | 'pages' =
    existsSync(path.join(repoPath, 'src/app')) || existsSync(path.join(repoPath, 'app'))
      ? 'app' : 'pages';

  const packageManager: 'npm' | 'yarn' | 'pnpm' =
    existsSync(path.join(repoPath, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(repoPath, 'yarn.lock')) ? 'yarn'
    : 'npm';

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const styling = deps.tailwindcss ? 'tailwind' : 'unknown';

  return {
    framework: 'nextjs',
    version: pkg.dependencies.next,
    router,
    packageManager,
    styling,
    nodeVersion: pkg.engines?.node || '20',
    confidence: 1.0,
  };
}
```

## Bước 2.3 — `src/layer1-filesystem.ts`

```typescript
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
```

## Bước 2.4 — `src/layer2-nextjs.ts`

```typescript
import { AssetReference } from './types.js';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const traverse = (_traverse as any).default || _traverse;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/*.min.js',
];

function isFooterFile(filePath: string): boolean {
  return /[/\\]footer[/\\]|[/\\]sdk[/\\]|Footer\.(tsx|jsx)$|footer\.(tsx|jsx)$/i.test(filePath);
}

export interface Layer2Result {
  references: AssetReference[];
  footerFilesSkipped: number;
  filesScanned: number;
}

export async function layer2ScanNextJs(repoPath: string): Promise<Layer2Result> {
  const codeFiles = await fg([
    '**/*.{ts,tsx,js,jsx}',
    '**/*.{css,scss}',
  ], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  const references: AssetReference[] = [];
  let footerFilesSkipped = 0;

  for (const file of codeFiles) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    if (isFooterFile(relativePath)) {
      footerFilesSkipped++;
      continue;
    }

    const content = await readFile(file, 'utf-8');
    const ext = path.extname(file);

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      references.push(...scanJsCode(relativePath, content));
    } else if (['.css', '.scss'].includes(ext)) {
      references.push(...scanCssCode(relativePath, content));
    }
  }

  return {
    references,
    footerFilesSkipped,
    filesScanned: codeFiles.length,
  };
}

function scanJsCode(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return refs;
  }

  traverse(ast, {
    ImportDeclaration(p: any) {
      const source = p.node.source.value;
      if (isAssetPath(source)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'import',
          assetPath: source,
          usage: 'static-import',
          confidence: 1.0,
        });
      }
    },

    JSXAttribute(p: any) {
      const name = p.node.name.name;
      if (!['src', 'href', 'poster', 'srcSet'].includes(name)) return;

      const value = extractJsxValue(p.node);
      if (value && isAssetPath(value)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'jsx-attr',
          attribute: name,
          assetPath: value,
          usage: 'jsx',
          confidence: 1.0,
        });
      }
    },

    TemplateLiteral(p: any) {
      const raw = p.node.quasis.map((q: any) => q.value.raw).join('${}');
      if (isAssetPath(raw)) {
        refs.push({
          file,
          line: p.node.loc?.start.line || 0,
          type: 'template-literal',
          assetPath: raw,
          usage: 'dynamic',
          confidence: 0.5,
        });
      }
    },
  });

  return refs;
}

function scanCssCode(file: string, content: string): AssetReference[] {
  const refs: AssetReference[] = [];

  const urlMatches = content.matchAll(/url\(['"]?([^'")]+)['"]?\)/g);
  for (const match of urlMatches) {
    const url = match[1];
    if (isAssetPath(url)) {
      refs.push({
        file,
        line: content.substring(0, match.index).split('\n').length,
        type: 'css-url',
        assetPath: url,
        usage: 'css',
        confidence: 1.0,
      });
    }
  }

  return refs;
}

function extractJsxValue(attr: any): string | null {
  if (!attr.value) return null;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'StringLiteral') return expr.value;
    if (expr.type === 'TemplateLiteral') {
      return expr.quasis.map((q: any) => q.value.raw).join('${}');
    }
  }
  return null;
}

function isAssetPath(str: string): boolean {
  if (!str) return false;
  return /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|mp4|webm|mov|mp3|wav|woff2?|ttf|otf)(\?|$)/i.test(str)
    || /^[@~.]?\/?(assets|images|img|media|static|fonts|videos)\//i.test(str);
}
```

## Bước 2.5 — `src/layer4-merge.ts`

```typescript
import { RawAsset, AssetReference, DetectedAsset } from './types.js';

export async function mergeDetected(
  rawAssets: RawAsset[],
  references: AssetReference[]
): Promise<DetectedAsset[]> {
  const detected: DetectedAsset[] = [];

  for (const raw of rawAssets) {
    const matchedRefs = references.filter(ref => matchesAsset(ref.assetPath, raw));

    let confidence = 0.5;
    if (matchedRefs.length > 0) confidence += 0.3;
    if (matchedRefs.length >= 2) confidence += 0.2;
    confidence = Math.min(confidence, 1.0);

    const section = detectSection(raw.relativePath, matchedRefs);

    detected.push({
      id: `asset.${raw.fileName.replace(/\.[^.]+$/, '')}`,
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
    });
  }

  return detected;
}

function matchesAsset(refPath: string, raw: RawAsset): boolean {
  const normalized = normalize(refPath);
  const rel = normalize(raw.relativePath);
  return rel === normalized
    || rel.endsWith('/' + normalized)
    || normalized.endsWith('/' + rel)
    || normalized === raw.fileName;
}

function normalize(p: string): string {
  return p
    .replace(/^~/, '')
    .replace(/^@\//, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\?.*$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function detectSection(filePath: string, refs: AssetReference[]): string {
  const pathLower = filePath.toLowerCase();
  if (pathLower.includes('hero')) return 'hero';
  if (pathLower.includes('header')) return 'header';
  if (pathLower.includes('sidebar')) return 'sidebar';
  if (pathLower.includes('swiper')) return 'swiper';
  if (pathLower.includes('leaderboard')) return 'leaderboard';
  if (pathLower.includes('content')) return 'content';
  if (pathLower.includes('banner')) return 'banner';

  for (const ref of refs) {
    const refLower = ref.file.toLowerCase();
    if (refLower.includes('hero')) return 'hero';
    if (refLower.includes('swiper')) return 'swiper';
  }

  return 'other';
}
```

## Bước 2.6 — `src/report-generator.ts`

```typescript
import { DetectionResult } from './types.js';

export function generateReport(r: DetectionResult): string {
  const lines: string[] = [];
  lines.push(`# Detection Report: ${r.gameId}\n`);
  lines.push(`- **Framework:** ${r.framework.framework} ${r.framework.version}`);
  if (r.framework.router) lines.push(`- **Router:** ${r.framework.router}`);
  if (r.framework.packageManager) lines.push(`- **Package Manager:** ${r.framework.packageManager}`);
  if (r.framework.styling) lines.push(`- **Styling:** ${r.framework.styling}`);
  lines.push(`- **Detected at:** ${r.detectedAt}`);
  lines.push(`- **Duration:** ${r.durationMs}ms\n`);

  lines.push(`## Summary\n`);
  lines.push(`- Total assets: ${r.summary.totalAssets}`);
  lines.push(`- Total references: ${r.summary.totalReferences}`);
  lines.push(`- Avg confidence: ${r.summary.avgConfidence.toFixed(2)}`);
  lines.push(`- Needs manual review: ${r.summary.needsReview}\n`);

  lines.push(`## By Type\n`);
  for (const [type, count] of Object.entries(r.summary.byType)) {
    if (count > 0) lines.push(`- ${type}: ${count}`);
  }

  lines.push(`\n## By Section\n`);
  for (const [section, count] of Object.entries(r.summary.bySection)) {
    lines.push(`- ${section}: ${count}`);
  }

  lines.push(`\n## Assets Needing Review\n`);
  const needsReview = r.assets.filter(a => a.needsManualReview);
  if (needsReview.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const a of needsReview) {
      lines.push(`- \`${a.canonicalPath}\` (confidence: ${a.confidence.toFixed(2)})`);
    }
  }

  lines.push(`\n## Top 20 Assets by Reference Count\n`);
  const top = [...r.assets].sort((a, b) => b.referenceCount - a.referenceCount).slice(0, 20);
  for (const a of top) {
    lines.push(`- \`${a.canonicalPath}\` — ${a.referenceCount} refs (confidence: ${a.confidence.toFixed(2)})`);
  }

  return lines.join('\n');
}
```

## Bước 2.7 — `src/index.ts`

```typescript
import { detectFramework } from './framework-detector.js';
import { layer1Scan } from './layer1-filesystem.js';
import { layer2ScanNextJs } from './layer2-nextjs.js';
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
  if (framework.framework === 'nextjs') {
    const layer2 = await layer2ScanNextJs(repoPath);
    references = layer2.references;
    footerRefsSkipped = layer2.footerFilesSkipped;
    console.log(`      ✓ ${references.length} references found`);
    console.log(`      ⏭️  ${footerRefsSkipped} footer files skipped\n`);
  } else {
    console.log(`      ⚠ .NET not implemented in POC yet\n`);
  }

  // Step 4: Merge
  console.log('[4/4] Merging...');
  const assets = await mergeDetected(layer1.assets, references);
  const avgConfidence = assets.length > 0
    ? assets.reduce((s, a) => s + a.confidence, 0) / assets.length
    : 0;
  const needsReview = assets.filter(a => a.needsManualReview).length;
  console.log(`      ✓ ${assets.length} assets merged`);
  console.log(`      ✓ Avg confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`      ⚠ ${needsReview} assets need manual review\n`);

  // Build result
  const result: DetectionResult = {
    gameId,
    repoPath,
    framework,
    assets,
    references,
    summary: {
      totalAssets: assets.length,
      totalReferences: references.length,
      avgConfidence,
      needsReview,
      byType: layer1.stats.byType,
      bySection: assets.reduce((acc, a) => {
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
  await writeFile(path.join(outputDir, 'assets.json'), JSON.stringify(assets, null, 2));
  await writeFile(path.join(outputDir, 'references.json'), JSON.stringify(references, null, 2));
  await writeFile(path.join(outputDir, 'report.md'), generateReport(result));

  console.log(`✅ Done in ${result.durationMs}ms`);
  console.log(`📄 Output: ${outputDir}/\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
```

## ✅ Acceptance Phase 2
- Tất cả 7 files đã tạo
- `npm run typecheck` pass
- Không có lỗi TypeScript

---

# PHASE 3 — CHẠY DETECT (15 phút)

## Bước 3.1 — Verify repo path

```bash
cd asset-detector-poc
ls ../game-template-repo/phuong-hoang-tru-tien/
```

Phải thấy `package.json`, `src/` hoặc `pages/`, `public/`.

## Bước 3.2 — Chạy detect

```bash
npm run detect:phuong-hoang
```

## Bước 3.3 — Ghi lại output

Copy toàn bộ output từ terminal vào file `./detect-run-log.txt`.

## ✅ Acceptance Phase 3
- Command chạy không crash
- Có output folder `./output/phuong-hoang-tru-tien/`
- Có 4 files: `manifest.json`, `assets.json`, `references.json`, `report.md`

---

# PHASE 4 — VERIFY OUTPUT (1 giờ)

## Bước 4.1 — Kiểm tra manifest

```bash
cd asset-detector-poc/output/phuong-hoang-tru-tien

echo "=== Framework ==="
cat manifest.json | jq '.framework'

echo ""
echo "=== Summary ==="
cat manifest.json | jq '.summary'
```

Checklist:
- [ ] `framework.framework === 'nextjs'`
- [ ] `framework.router` là 'app' hoặc 'pages'
- [ ] `summary.totalAssets > 10`
- [ ] `summary.avgConfidence > 0.5`

## Bước 4.2 — Kiểm tra assets

```bash
echo "=== Total assets ==="
cat assets.json | jq 'length'

echo ""
echo "=== Sample 5 assets ==="
cat assets.json | jq '.[0:5]'

echo ""
echo "=== Assets by section ==="
cat assets.json | jq 'group_by(.section) | map({section: .[0].section, count: length})'

echo ""
echo "=== Assets needing review ==="
cat assets.json | jq '.[] | select(.needsManualReview) | {path: .canonicalPath, confidence}' | head -30
```

Checklist:
- [ ] Assets có `canonicalPath`, `publicPath`
- [ ] Confidence phân bố hợp lý
- [ ] Section phân loại có data (không phải all 'other')
- [ ] Có ít nhất 5 asset có references

## Bước 4.3 — Kiểm tra references

```bash
echo "=== Total references ==="
cat references.json | jq 'length'

echo ""
echo "=== References by type ==="
cat references.json | jq 'group_by(.type) | map({type: .[0].type, count: length})'

echo ""
echo "=== Sample JSX references ==="
cat references.json | jq '.[] | select(.type == "jsx-attr")' | head -30
```

Checklist:
- [ ] Có references từ `jsx-attr` (chứng tỏ JSX parsing OK)
- [ ] Có references từ `import` (nếu repo có static import)
- [ ] Có references từ `css-url` (nếu có CSS)
- [ ] Không có references từ footer

## Bước 4.4 — Đối chiếu với source code

```bash
# Đếm ảnh thật trong public/
cd ../../../game-template-repo/phuong-hoang-tru-tien
find public -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.svg" -o -name "*.webp" \) | wc -l

# Xem vài ảnh cụ thể
find public -type f -name "*.jpg" | head -10

# Grep 1 ảnh cụ thể trong code
grep -r "<tên ảnh>" src/ --include="*.tsx" | head -5

# Xem output có asset đó không
cd ../../../asset-detector-poc
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.canonicalPath | contains("<tên>"))'
```

Checklist:
- [ ] Số asset trong output gần đúng với số file trong `public/`
- [ ] Asset có trong code đều xuất hiện trong output
- [ ] Asset có trong output đều tồn tại trong repo

## Bước 4.5 — Đọc report.md

```bash
cat output/phuong-hoang-tru-tien/report.md
```

Checklist:
- [ ] Report đọc được
- [ ] Summary rõ ràng
- [ ] Danh sách asset cần review cụ thể
- [ ] Top assets by reference hợp lý

## ✅ Acceptance Phase 4
- Tất cả checklists pass
- Không có asset nào bị miss
- Không có asset nào thừa (từ footer, vendor)

---

# PHASE 5 — ITERATE NẾU CẦN (1-3 giờ)

## Bước 5.1 — Xác định vấn đề

Từ Phase 4, note lại vấn đề:

```
[ ] Thiếu asset: ...
[ ] Thừa asset: ...
[ ] Confidence thấp: ...
[ ] Section sai: ...
[ ] References miss: ...
```

## Bước 5.2 — Debug từng vấn đề

### Vấn đề 1: Thiếu asset

```bash
# Xem asset có trong repo nhưng không trong output
cd game-template-repo/phuong-hoang-tru-tien
find public -type f -name "*.jpg" > /tmp/real-assets.txt

cd ../../../asset-detector-poc
cat output/phuong-hoang-tru-tien/assets.json | jq -r '.[].canonicalPath' > /tmp/detected.txt

diff /tmp/real-assets.txt /tmp/detected.txt
```

**Fix:** Adjust `IGNORE_PATTERNS` hoặc `FOOTER_PATTERNS` trong `layer1-filesystem.ts`.

### Vấn đề 2: Thừa asset

```bash
# Xem asset trong output không có trong repo
cat output/phuong-hoang-tru-tien/assets.json | jq -r '.[] | select(.canonicalPath | contains("lib") or contains("node_modules"))'
```

**Fix:** Thêm pattern vào `VENDOR_PATTERNS`.

### Vấn đề 3: Confidence thấp

```bash
# Xem asset confidence < 0.7
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.confidence < 0.7) | {path: .canonicalPath, refCount: .referenceCount}'
```

**Fix:** Improve `matchesAsset` trong `layer4-merge.ts` để match nhiều reference hơn.

### Vấn đề 4: Section sai

```bash
# Xem asset section 'other' (có thể phân loại sai)
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.section == "other") | .canonicalPath' | head -20
```

**Fix:** Thêm pattern vào `detectSection`.

## Bước 5.3 — Re-run sau fix

```bash
cd asset-detector-poc
npm run detect:phuong-hoang
```

Verify lại từ Phase 4.

## Bước 5.4 — Ghi log iteration

Tạo file `./iteration-log.md`:

```markdown
# Iteration Log: phuong-hoang-tru-tien

## Iteration 1
- Vấn đề: ...
- Fix: ...
- Kết quả: ...

## Iteration 2
- ...
```

## ✅ Acceptance Phase 5
- Không còn vấn đề nghiêm trọng
- Output ổn định sau ít nhất 1 lần re-run

---

# PHASE 6 — FINAL REPORT (30 phút)

## Bước 6.1 — Tạo report cuối

Tạo file `./FINAL-REPORT.md`:

```markdown
# Final Report: phuong-hoang-tru-tien

## Game Info
- Game ID: phuong-hoang-tru-tien
- Game Name: Phượng Hoàng Trứ Tiên
- Repo Path: ./game-template-repo/phuong-hoang-tru-tien/
- Framework: Next.js [version]
- Router: [app/pages]

## Detection Result

### Summary
- Total assets: [N]
- Total references: [N]
- Avg confidence: [X.XX]
- Needs manual review: [N]

### By Type
- Image: [N]
- Video: [N]
- Font: [N]
- Other: [N]

### By Section
- Hero: [N]
- Content: [N]
- Swiper: [N]
- Leaderboard: [N]
- Other: [N]

### Footer Exclusion
- Footer files skipped (Layer 1): [N]
- Footer files skipped (Layer 2): [N]

## Output Files
- manifest.json
- assets.json
- references.json
- report.md
- detect-run-log.txt

## Issues & Iterations
[List các iteration từ Phase 5]

## Confidence Assessment
- Overall: [PASS / NEEDS WORK]
- Reasoning: [lý do]

## Recommendation
- [ ] Ready to use for operator
- [ ] Needs manual review for [N] assets
- [ ] Needs code fix for [specific issues]

## Next Steps
1. [Bước tiếp theo]
2. [Bước tiếp theo]
```

## Bước 6.2 — Output Format cho Agent Report

Agent PHẢI report theo format sau khi kết thúc:

```
## ✅ DETECT COMPLETE: phuong-hoang-tru-tien

### Phase 0 — Audit
- Framework: nextjs [version]
- Router: [app/pages]
- PM: [pnpm/yarn/npm]
- Assets in public/: [N]
- data-slot files: [N]
- Footer detected: [yes/no]
- Swiper: [yes/no]

### Phase 1 — Setup
- npm install: ✅
- typecheck: ✅

### Phase 2 — Code
- Files created: 7/7
- TypeScript errors: 0

### Phase 3 — Detect Run
- Status: ✅ Success
- Duration: [Xms]
- Assets detected: [N]
- References found: [N]
- Avg confidence: [X.XX]

### Phase 4 — Verify
- Manifest OK: ✅
- Assets OK: ✅
- References OK: ✅
- Source match: ✅ / ⚠️ / ❌

### Phase 5 — Iterations
- Total iterations: [N]
- Issues fixed: [list]

### Phase 6 — Final
- Overall status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Ready for next: [yes/no]
- Recommendation: [text]

### Output Location
./asset-detector-poc/output/phuong-hoang-tru-tien/
- manifest.json
- assets.json
- references.json
- report.md
```

## ✅ Acceptance Phase 6
- FINAL-REPORT.md đã tạo
- Agent report theo format
- Nếu PASS → sẵn sàng chạy 13 games còn lại
- Nếu FAIL → note vấn đề để fix trước khi mở rộng

---

# SUCCESS CRITERIA TỔNG THỂ

Detect game `phuong-hoang-tru-tien` thành công khi:

- ✅ Framework detected: `nextjs`
- ✅ Router detected: `app` hoặc `pages`
- ✅ Total assets > 10
- ✅ Avg confidence > 0.7
- ✅ Có references từ JSX
- ✅ Footer excluded (không có footer assets trong output)
- ✅ Section phân loại có ý nghĩa
- ✅ Output JSON đúng format
- ✅ Report.md đọc được, có summary

---

# NẾU FAIL — ROLLBACK

Nếu không đạt success criteria:

1. **Note lại blocker** cụ thể
2. **Không tự ý mở rộng scope** (VD: không tự thêm DB, không tự thêm Layer 3)
3. **Report cho supervisor** với:
   - Vấn đề gặp phải
   - Đã thử gì
   - Đề xuất hướng fix
4. **Chờ confirm** trước khi tiếp tục

---

# KHÔNG LÀM TRONG FILE NÀY

- ❌ Không setup DB
- ❌ Không chạy Layer 3 (Playwright)
- ❌ Không detect swiper/leaderboard chi tiết
- ❌ Không build API/CLI
- ❌ Không detect 13 games còn lại (làm sau khi PASS)

Chỉ tập trung: **DETECT 1 GAME → VERIFY → REPORT**.