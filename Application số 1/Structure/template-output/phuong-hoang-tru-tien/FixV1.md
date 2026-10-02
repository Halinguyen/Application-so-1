# Fix Merge Detection — phuong-hoang-tru-tien

## Metadata
- **Game ID:** phuong-hoang-tru-tien
- **Repo Path:** ./game-template-repo/phuong-hoang-tru-tien/home-page/
- **POC Project:** ./asset-detector-poc/
- **Output:** ./asset-detector-poc/output/phuong-hoang-tru-tien/
- **Baseline manifest:** `manifest-baseline.json` (đã có)

## Mục Tiêu
Fix 3 vấn đề trong Layer 4 (merge detection) để tăng confidence và cải thiện section classification.

## Kết Quả Baseline (Trước Fix)
```
totalAssets: 70
avgConfidence: 0.73
needsReview: 27
bySection: {
  other: 56,     ← QUÁ NHIỀU
  header: 2,
  banner: 10,
  content: 2
}
```

## Kết Quả Mong Đợi (Sau Fix)
```
totalAssets: ~70
avgConfidence: > 0.90
needsReview: < 10
bySection: {
  "float-home": ~10,
  "header": 2,
  "home-banner": ~6,
  "home-news": ~15,
  "home-rank": ~8,
  "tintuc": ~8,
  "rank": ~5,
  "favicon": ~8,       ← auto-managed
  "external": ~2,       ← CDN assets
  "other": < 5          ← giảm mạnh
}
```

## Quyết Định Từ Stakeholder
- **Favicon:** CÓ operator thay (giữ `needsManualReview: false` nhưng vẫn cho phép upload)
- **External URL (homepage.mp4):** CÓ track (thêm asset với `isExternal: true`)

## Nguyên Tắc Cho Agent
- Chỉ fix 3 vấn đề dưới đây
- KHÔNG mở rộng scope
- KHÔNG refactor code khác
- Test sau mỗi fix
- Report theo OUTPUT FORMAT ở cuối file

---

# VẤN ĐỀ 1 — Section Detection Kém

## Hiện Trạng
56/70 asset bị xếp vào section `"other"` → operator khó nhìn.

## Nguyên Nhân
Function `detectSection()` hiện tại chỉ check filename, không dùng **path hierarchy**.

Ví dụ sai:
- `public/assets/float-home/btn-apk.png` → phải là `float-home`, đang bị `other`
- `public/assets/home/rank/all.png` → phải là `home-rank`, đang bị `other`
- `public/assets/home/news/1920/banner.png` → phải là `home-news`, đang bị `banner`

## Fix — Update `detectSection()`

Mở file `src/layer4-merge.ts`, thay function `detectSection` bằng:

```typescript
function detectSection(filePath: string, refs: AssetReference[]): string {
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
```

## Verify Fix 1

Sau khi update, chạy detect lại:
```bash
npm run detect:phuong-hoang
```

Check section distribution:
```bash
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary.bySection'
```

**Kỳ vọng:**
- `other` < 10 (giảm từ 56)
- Có ít nhất 5 section mới với count > 2

---

# VẤN ĐỀ 2 — Template Literal Reference Không Match

## Hiện Trạng
Asset `top1.png`, `top2.png`, `top3.png` không match được reference dạng template literal `/assets/home/rank/top${}.png` → confidence 0.5.

Tương tự với:
- `btn-nap.png`, `btn-fanpage.png`, `btn-cskh.png`, `btn-giftcode.png` (qua template `${}/btn-nap.png`)

## Nguyên Nhân
Function `matchesAsset()` hiện tại không handle pattern `${}` trong asset path.

## Fix — Update `matchesAsset()`

Mở file `src/layer4-merge.ts`, thay function `matchesAsset` bằng:

```typescript
function matchesAsset(refPath: string, raw: RawAsset): boolean {
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

    // Check if rel starts with prefix and ends with suffix
    if (prefix && suffix) {
      if (rel.startsWith(prefix) && rel.endsWith(suffix)) return true;
    }

    // Check with filename only (case `${}/btn-nap.png`)
    if (!prefix && suffix) {
      if (fileName.endsWith(suffix)) return true;
    }
  }

  // Case 3: Match by filename with extension
  if (normalized.endsWith('/' + fileName)) return true;

  return false;
}
```

## Verify Fix 2

Sau khi update, check các asset này có confidence cao hơn:

```bash
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.canonicalPath | contains("top1") or contains("top2") or contains("top3") or contains("btn-nap") or contains("btn-giftcode")) | {path: .canonicalPath, refCount: .referenceCount, confidence}'
```

**Kỳ vọng:**
- `top1.png`, `top2.png`, `top3.png` → referenceCount ≥ 1, confidence ≥ 0.8
- `btn-nap.png`, `btn-giftcode.png`, `btn-fanpage.png`, `btn-cskh.png` → referenceCount ≥ 1

---

# VẤN ĐỀ 3 — Favicon Và External URL

## 3A — Favicon Auto-Classify

### Quyết Định
Operator **CÓ THỂ** thay favicon (không auto-lock), nhưng:
- Không nên chiếm chỗ trong danh sách "cần review"
- Section riêng `"favicon"` để operator dễ tìm
- Confidence cao (vì chắc chắn là favicon)

### Fix

**Bước 1: Update `src/types.ts`** — thêm fields vào `DetectedAsset`:

```typescript
export interface DetectedAsset {
  // ... existing fields
  isAutoManaged: boolean;      // NEW
  isExternal: boolean;         // NEW
  externalUrl?: string;        // NEW (cho external assets)
}
```

**Bước 2: Update `src/layer4-merge.ts`** — thêm helper:

```typescript
const FAVICON_PATTERNS = [
  /\/favicon\//i,
  /favicon\.(ico|png|svg)$/i,
  /android-chrome-\d+x\d+\.png$/i,
  /apple-touch-icon\.png$/i,
  /^vite\.svg$/i,
];

function isFavicon(filePath: string): boolean {
  const p = filePath.toLowerCase();
  return FAVICON_PATTERNS.some(pattern => pattern.test(p));
}
```

**Bước 3: Update function `mergeDetected()`** — xử lý favicon trước:

```typescript
export async function mergeDetected(
  rawAssets: RawAsset[],
  references: AssetReference[]
): Promise<DetectedAsset[]> {
  const detected: DetectedAsset[] = [];

  for (const raw of rawAssets) {
    // Favicon handling
    if (isFavicon(raw.relativePath)) {
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
      isAutoManaged: false,
      isExternal: false,
    });
  }

  // Append external assets (xem 3B)
  detected.push(...extractExternalAssets(references));

  return detected;
}
```

## 3B — External URL Detection

### Quyết Định
Track external URLs (CDN assets) như asset bình thường với `isExternal: true`.

### Fix — Thêm function `extractExternalAssets()`

Thêm function mới vào `src/layer4-merge.ts`:

```typescript
import { createHash } from 'crypto';

const EXTERNAL_URL_PATTERN = /^https?:\/\//i;

function isExternalUrl(url: string): boolean {
  if (!EXTERNAL_URL_PATTERN.test(url)) return false;
  // Không tính localhost
  if (url.includes('localhost')) return false;
  return true;
}

function detectExternalType(url: string): AssetType {
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
```

### Update types

Đảm bảo `AssetType` đã import đúng trong `layer4-merge.ts`:
```typescript
import { RawAsset, AssetReference, DetectedAsset, AssetType } from './types.js';
```

## Verify Fix 3

Sau khi update, check:

```bash
# Favicon
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.isAutoManaged == true) | {path: .canonicalPath, section, confidence}'

# External
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.isExternal == true) | {path: .canonicalPath, type, confidence}'
```

**Kỳ vọng:**
- Favicon: ~8 assets với `isAutoManaged: true`, `section: "favicon"`, `confidence: 1.0`
- External: ~2 assets với `isExternal: true`, `section: "external"`

---

# UPDATE REPORT GENERATOR

Update `src/report-generator.ts` để hiển thị stats mới:

```typescript
export function generateReport(r: DetectionResult): string {
  const lines: string[] = [];
  lines.push(`# Detection Report: ${r.gameId}\n`);
  lines.push(`- **Framework:** ${r.framework.framework} ${r.framework.version}`);
  if (r.framework.router) lines.push(`- **Router:** ${r.framework.router}`);
  if (r.framework.packageManager) lines.push(`- **Package Manager:** ${r.framework.packageManager}`);
  if (r.framework.styling) lines.push(`- **Styling:** ${r.framework.styling}`);
  lines.push(`- **Detected at:** ${r.detectedAt}`);
  lines.push(`- **Duration:** ${r.durationMs}ms\n`);

  // Summary
  const autoManaged = r.assets.filter(a => a.isAutoManaged).length;
  const external = r.assets.filter(a => a.isExternal).length;

  lines.push(`## Summary\n`);
  lines.push(`- Total assets: ${r.summary.totalAssets}`);
  lines.push(`- Total references: ${r.summary.totalReferences}`);
  lines.push(`- Avg confidence: ${r.summary.avgConfidence.toFixed(2)}`);
  lines.push(`- Needs manual review: ${r.summary.needsReview}`);
  lines.push(`- Auto-managed (favicon): ${autoManaged}`);
  lines.push(`- External URLs: ${external}\n`);

  // By Type
  lines.push(`## By Type\n`);
  for (const [type, count] of Object.entries(r.summary.byType)) {
    if (count > 0) lines.push(`- ${type}: ${count}`);
  }

  // By Section (sorted by count desc)
  lines.push(`\n## By Section\n`);
  const sections = Object.entries(r.summary.bySection)
    .sort(([, a], [, b]) => b - a);
  for (const [section, count] of sections) {
    lines.push(`- ${section}: ${count}`);
  }

  // Needs Review
  lines.push(`\n## Assets Needing Review\n`);
  const needsReview = r.assets.filter(a => a.needsManualReview);
  if (needsReview.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const a of needsReview.slice(0, 30)) {
      lines.push(`- \`${a.canonicalPath}\` (confidence: ${a.confidence.toFixed(2)}, section: ${a.section})`);
    }
    if (needsReview.length > 30) {
      lines.push(`- _(+${needsReview.length - 30} more)_`);
    }
  }

  // Top assets by reference count
  lines.push(`\n## Top 20 Assets by Reference Count\n`);
  const top = [...r.assets].sort((a, b) => b.referenceCount - a.referenceCount).slice(0, 20);
  for (const a of top) {
    lines.push(`- \`${a.canonicalPath}\` — ${a.referenceCount} refs (confidence: ${a.confidence.toFixed(2)}, section: ${a.section})`);
  }

  return lines.join('\n');
}
```

---

# EXECUTION ORDER

Agent thực hiện theo thứ tự:

```
1. Backup baseline
   cp output/phuong-hoang-tru-tien/manifest.json output/phuong-hoang-tru-tien/manifest-baseline.json

2. Update src/types.ts
   - Thêm isAutoManaged, isExternal, externalUrl vào DetectedAsset

3. Update src/layer4-merge.ts
   - Fix 1: Thay detectSection()
   - Fix 2: Thay matchesAsset()
   - Fix 3A: Thêm isFavicon() + xử lý favicon trong mergeDetected()
   - Fix 3B: Thêm isExternalUrl(), detectExternalType(), extractExternalAssets()
   - Gọi extractExternalAssets() ở cuối mergeDetected()

4. Update src/report-generator.ts
   - Thêm stats autoManaged, external
   - Sort bySection theo count desc

5. Typecheck
   npm run typecheck

6. Re-run detect
   npm run detect:phuong-hoang

7. Verify
   (xem checklist bên dưới)

8. Report
```

---

# VERIFY CHECKLIST

Sau khi re-run detect, verify:

## Vấn đề 1 — Section Detection
```bash
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary.bySection'
```
- [ ] `other` < 10 (giảm từ 56)
- [ ] Có ít nhất 5 section với count > 2
- [ ] Section `favicon` xuất hiện với count ~8
- [ ] Section `external` xuất hiện với count ~2

## Vấn đề 2 — Template Literal
```bash
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.canonicalPath | test("top[0-9]\\.png$")) | {path: .canonicalPath, refCount: .referenceCount, confidence}'
```
- [ ] `top1.png`, `top2.png`, `top3.png` có `referenceCount >= 1`
- [ ] Confidence của chúng ≥ 0.8

```bash
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.canonicalPath | test("btn-(nap|giftcode|fanpage|cskh)\\.png$")) | {path: .canonicalPath, refCount: .referenceCount}'
```
- [ ] Các btn này có `referenceCount >= 1`

## Vấn đề 3A — Favicon
```bash
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.isAutoManaged == true) | {path: .canonicalPath, section, confidence}'
```
- [ ] Có ~8 assets với `isAutoManaged: true`
- [ ] Section là `"favicon"`
- [ ] Confidence = 1.0
- [ ] `needsManualReview: false`

## Vấn đề 3B — External
```bash
cat output/phuong-hoang-tru-tien/assets.json | jq '.[] | select(.isExternal == true)'
```
- [ ] Có ít nhất 1 asset với `isExternal: true`
- [ ] `canonicalPath` là URL (bắt đầu bằng `https://`)
- [ ] `section: "external"`
- [ ] Type đúng (video cho `.mp4`)

## Tổng thể
```bash
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary'
```
- [ ] `avgConfidence > 0.90`
- [ ] `needsReview < 10`
- [ ] `totalAssets >= 70` (bao gồm external mới)

---

# SUCCESS CRITERIA

Fix thành công khi:

- ✅ avgConfidence ≥ 0.90 (baseline: 0.73)
- ✅ needsReview < 10 (baseline: 27)
- ✅ section `other` < 10 (baseline: 56)
- ✅ Có section `favicon` (~8 assets)
- ✅ Có section `external` (~1-2 assets)
- ✅ `top1/2/3.png` có referenceCount ≥ 1
- ✅ `btn-nap/giftcode/fanpage/cskh.png` có referenceCount ≥ 1
- ✅ Không có lỗi TypeScript

# NẾU FAIL — ROLLBACK

Nếu sau fix mà metric tệ hơn baseline:
1. Restore baseline: `cp output/phuong-hoang-tru-tien/manifest-baseline.json output/phuong-hoang-tru-tien/manifest.json`
2. Note lại vấn đề cụ thể
3. Report cho supervisor
4. Chờ confirm trước khi thử hướng khác

# KHÔNG LÀM TRONG FILE NÀY

- ❌ Không thêm DB
- ❌ Không chạy Layer 3 (Playwright)
- ❌ Không detect swiper/leaderboard chi tiết
- ❌ Không refactor code khác
- ❌ Không detect 13 games còn lại
- ❌ Không thay đổi Layer 1, Layer 2

Chỉ fix 3 vấn đề trong Layer 4.

---

# OUTPUT FORMAT (Agent Báo Cáo)

```
## ✅ FIX MERGE DETECTION COMPLETE: phuong-hoang-tru-tien

### Baseline (Trước Fix)
- Total assets: 70
- Avg confidence: 0.73
- Needs review: 27
- Section "other": 56

### Sau Fix
- Total assets: [N]
- Avg confidence: [X.XX]
- Needs review: [N]
- Section "other": [N]
- Favicon auto-managed: [N]
- External URLs: [N]

### Fix 1 — Section Detection
- Status: ✅ / ⚠️ / ❌
- Sections mới xuất hiện: [list]
- Section "other" giảm từ 56 → [N]

### Fix 2 — Template Literal
- Status: ✅ / ⚠️ / ❌
- top1/2/3.png: referenceCount = [N]
- btn-nap/giftcode/fanpage/cskh.png: referenceCount = [N]

### Fix 3A — Favicon
- Status: ✅ / ⚠️ / ❌
- Favicon assets: [N]
- All confidence 1.0: [yes/no]
- Section "favicon": [yes/no]

### Fix 3B — External URL
- Status: ✅ / ⚠️ / ❌
- External assets: [N]
- URLs: [list]

### TypeScript
- npm run typecheck: ✅ / ❌

### Files Modified
- src/types.ts: [list changes]
- src/layer4-merge.ts: [list changes]
- src/report-generator.ts: [list changes]

### Overall
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Ready for next: [yes/no]
- Recommendation: [text]

### Output Files Updated
- ./asset-detector-poc/output/phuong-hoang-tru-tien/manifest.json
- ./asset-detector-poc/output/phuong-hoang-tru-tien/assets.json
- ./asset-detector-poc/output/phuong-hoang-tru-tien/report.md
```

---

# BƯỚC TIẾP THEO (Sau Khi PASS)

Nếu tất cả success criteria đều pass:
1. Update `00-CONTEXT.md` với lessons learned
2. Bắt đầu detect game thứ 2 trong 14 repos
3. Reuse POC tool, chỉ cần chạy `npm run detect -- --repo <path> --game-id <id>`