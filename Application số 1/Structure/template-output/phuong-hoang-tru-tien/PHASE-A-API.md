# Phase A — Detect 2 API Dynamic Blocks

## Metadata
- **Game ID:** phuong-hoang-tru-tien
- **Repo Path:** ./game-template-repo/phuong-hoang-tru-tien/home-page/
- **POC Project:** ./asset-detector-poc/
- **Input:** `manifest.json` (từ Phase trước)
- **Output:** `manifest.json` updated với `dynamicBlocks` array

## Mục Tiêu
Detect 2 API blocks quan trọng:
1. **`/api/config/buttons?gameId={gameId}`** — Button Config API
2. **`/api/leaderboard?mode={mode}&scope={scope}&limit={limit}`** — Leaderboard API

Sau khi detect xong, manifest phải có đủ thông tin để operator nhập params và tool inject vào build.

## Nguyên Tắc Cho Agent
- Chỉ detect 2 API blocks, KHÔNG mở rộng scope
- Nếu không tìm thấy API block → ghi rõ trong report, KHÔNG tự ý thêm
- Nếu tìm thấy API khác (ngoài 2 cái này) → note lại, KHÔNG detect sâu
- Test trên game `phuong-hoang-tru-tien` trước
- Report theo OUTPUT FORMAT ở cuối file

## Context
Manifest hiện tại đã có:
- `framework: vite-spa`
- `assets: [71 items]`
- `references: [108 items]`
- `summary: {...}`

Manifest **CHƯA CÓ:**
- `slots.dynamicBlocks` — cần thêm ở phase này
- `slots.swipers` — sẽ làm ở phase sau

---

# PHASE A.1 — DISCOVERY (30 phút)

## Mục Đích
Tìm chính xác file nào gọi 2 API này, line nào, params gì.

## Bước A.1.1 — Grep tìm 2 API endpoints

Chạy tại repo root:

```bash
cd game-template-repo/phuong-hoang-tru-tien/home-page

echo "=== Tìm /api/config/buttons ==="
grep -rn "api/config/buttons\|config/buttons\|/buttons" src/ \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  2>/dev/null | head -30

echo ""
echo "=== Tìm /api/leaderboard ==="
grep -rn "api/leaderboard\|/leaderboard\|leaderboard" src/ \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  2>/dev/null | head -30

echo ""
echo "=== Tìm các API call pattern khác ==="
grep -rn "fetch(\|axios\.\|useSWR\|useQuery\|\.get(\|\.post(" src/ \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  2>/dev/null | head -40
```

## Bước A.1.2 — Tìm file chứa API config chung

```bash
echo "=== Tìm file config ==="
find src -type f -name "*.ts" -o -name "*.js" | xargs grep -l "api\|endpoint\|baseURL\|baseUrl" 2>/dev/null | head -20

echo ""
echo "=== Tìm file constants ==="
find src -type f \( -name "constants*" -o -name "config*" -o -name "env*" -o -name "api*" \) 2>/dev/null

echo ""
echo "=== Xem .env files ==="
ls -la .env* 2>/dev/null
cat .env* 2>/dev/null | head -30

echo ""
echo "=== Tìm VITE_ env vars ==="
grep -rn "import.meta.env.VITE_\|process.env.VITE_" src/ 2>/dev/null | head -20
```

## Bước A.1.3 — Tìm trong folder components/home

```bash
echo "=== Folder components ==="
ls -la src/components/home/ 2>/dev/null
ls -la src/components/ 2>/dev/null

echo ""
echo "=== Tìm Button component ==="
grep -rn "btn-\|Button\|button" src/components/ \
  --include="*.tsx" -l 2>/dev/null | head -20

echo ""
echo "=== Tìm Leaderboard/Rank component ==="
grep -rln "leaderboard\|Leaderboard\|Bảng\|rank\|Rank\|bxh\|BXH" src/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | head -20
```

## Bước A.1.4 — Ghi lại Discovery Report

Tạo file `./discovery-API-blocks.md`:

```markdown
# API Blocks Discovery: phuong-hoang-tru-tien

## 1. Button Config API

### Endpoint found
- Endpoint: [/api/config/buttons hoặc không tìm thấy]
- Files gọi: [list file:line]
- Base URL: [nếu có]

### Params phát hiện
- gameId: [có/không]
- Params khác: [...]

### Code mẫu
```
[paste code snippet nơi gọi API]
```

## 2. Leaderboard API

### Endpoint found
- Endpoint: [/api/leaderboard hoặc không tìm thấy]
- Files gọi: [list file:line]
- Base URL: [nếu có]

### Params phát hiện
- mode: [có/không]
- scope: [có/không]
- limit: [có/không]

### Tabs (nếu có)
- [list tabs: BXH Server, BXH Tổng Môn, ...]

### Code mẫu
```
[paste code snippet nơi gọi API]
```

## 3. Config/Env
- VITE_API_BASE: [giá trị]
- VITE_GAME_ID: [giá trị]
- Base URL pattern: [...]

## 4. Kết luận
- Button API: [FOUND / NOT FOUND / PARTIAL]
- Leaderboard API: [FOUND / NOT FOUND / PARTIAL]
- Cần manual review: [yes/no]
```

## ✅ Acceptance A.1
- Biết chính xác file nào gọi API nào
- Biết params nào cần operator nhập
- Biết env vars nào cần inject

---

# PHASE A.2 — IMPLEMENT DETECTION CODE (2-3 giờ)

## Mục Đích
Viết code tự động detect 2 API blocks và thêm vào manifest.

## Bước A.2.1 — Update `src/types.ts`

Thêm types cho dynamic blocks:

```typescript
// Thêm vào src/types.ts

export type DynamicBlockType = 'api-buttons' | 'api-leaderboard';

export interface DynamicBlockParam {
  name: string;
  envKey: string;
  type: 'string' | 'number' | 'enum';
  required?: boolean;
  options?: string[];
  default?: unknown;
  description?: string;
}

export interface LeaderboardTab {
  id: string;
  label: string;
  mode: string;
  scope: string;
}

export interface DynamicBlock {
  id: string;
  type: DynamicBlockType;
  label: string;
  section: string;
  source: string;                    // 'file:line'
  apiEndpoint: string;
  params: DynamicBlockParam[];
  tabs?: LeaderboardTab[];           // chỉ cho leaderboard
  injectVia: 'env-inject';
  confidence: number;
  detectionMethod: 'data-slot' | 'grep' | 'ast' | 'manual';
}

// Update DetectionResult
export interface DetectionResult {
  gameId: string;
  repoPath: string;
  framework: FrameworkInfo;
  assets: DetectedAsset[];
  references: AssetReference[];
  dynamicBlocks: DynamicBlock[];     // ← NEW
  summary: {
    totalAssets: number;
    totalReferences: number;
    totalDynamicBlocks: number;      // ← NEW
    avgConfidence: number;
    needsReview: number;
    byType: Record<AssetType, number>;
    bySection: Record<string, number>;
  };
  detectedAt: string;
  durationMs: number;
}
```

## Bước A.2.2 — Tạo file `src/layer2-api-blocks.ts`

```typescript
import { DynamicBlock, DynamicBlockParam, LeaderboardTab } from './types.js';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/*.min.js',
];

const FOOTER_PATTERNS = [
  /[/\\]footer[/\\]/i,
  /[/\\]sdk[/\\]/i,
  /Footer\.(tsx|jsx|ts|js)$/i,
  /footer\.(tsx|jsx|ts|js)$/i,
];

interface ApiCallMatch {
  file: string;
  line: number;
  endpoint: string;
  method?: string;
  rawCode: string;
}

export interface ApiBlocksResult {
  dynamicBlocks: DynamicBlock[];
  apiCallsFound: ApiCallMatch[];
  filesScanned: number;
  warnings: string[];
}

export async function layer2ScanApiBlocks(repoPath: string): Promise<ApiBlocksResult> {
  const warnings: string[] = [];
  const apiCallsFound: ApiCallMatch[] = [];

  // Scan tất cả file code
  const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  // Step 1: Find all API calls
  for (const file of files) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    // Skip footer
    if (FOOTER_PATTERNS.some(p => p.test(relativePath))) continue;

    const content = await readFile(file, 'utf-8');
    const matches = extractApiCalls(content, relativePath);
    apiCallsFound.push(...matches);
  }

  // Step 2: Identify button config block
  const buttonCalls = apiCallsFound.filter(c =>
    c.endpoint.includes('config/buttons') ||
    c.endpoint.includes('/buttons') ||
    c.endpoint.includes('button-config')
  );

  // Step 3: Identify leaderboard block
  const leaderboardCalls = apiCallsFound.filter(c =>
    c.endpoint.includes('leaderboard') ||
    c.endpoint.includes('/rank') ||
    c.endpoint.includes('bxh')
  );

  // Step 4: Build dynamic blocks
  const dynamicBlocks: DynamicBlock[] = [];

  if (buttonCalls.length > 0) {
    const block = buildButtonConfigBlock(buttonCalls[0], repoPath);
    dynamicBlocks.push(block);
  } else {
    warnings.push('Không tìm thấy Button Config API call trong code');
  }

  if (leaderboardCalls.length > 0) {
    const block = buildLeaderboardBlock(leaderboardCalls[0], repoPath);
    dynamicBlocks.push(block);
  } else {
    warnings.push('Không tìm thấy Leaderboard API call trong code');
  }

  return {
    dynamicBlocks,
    apiCallsFound,
    filesScanned: files.length,
    warnings,
  };
}

function extractApiCalls(content: string, file: string): ApiCallMatch[] {
  const matches: ApiCallMatch[] = [];
  const lines = content.split('\n');

  // Pattern 1: fetch('/api/...') hoặc fetch(`/api/...`)
  const fetchPattern = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 2: axios.get('/api/...') hoặc axios.post(...)
  const axiosPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 3: useSWR('/api/...') hoặc useQuery
  const swrPattern = /useSWR\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
  const queryPattern = /useQuery\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 4: URL const, apiUrl
  const urlPattern = /[`'"]([^`'"]*\/api\/[^`'"]+)[`'"]/g;

  // Pattern 5: import.meta.env.VITE_API.../ path
  const envPattern = /import\.meta\.env\.(\w+)/g;

  // Scan từng dòng
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // fetch
    let m;
    while ((m = fetchPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[1],
        method: 'GET',
        rawCode: line.trim(),
      });
    }

    // axios
    while ((m = axiosPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[2],
        method: m[1].toUpperCase(),
        rawCode: line.trim(),
      });
    }

    // SWR/Query
    while ((m = swrPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[1],
        method: 'GET',
        rawCode: line.trim(),
      });
    }
    while ((m = queryPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[1],
        method: 'GET',
        rawCode: line.trim(),
      });
    }

    // URL string pattern (chỉ log, không tạo call)
    // bỏ qua để tránh false positive
  }

  // Deduplicate
  const seen = new Set<string>();
  return matches.filter(m => {
    const key = `${m.file}:${m.line}:${m.endpoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildButtonConfigBlock(
  call: ApiCallMatch,
  repoPath: string
): DynamicBlock {
  // Infer section from file path
  const section = inferSection(call.file);

  return {
    id: 'dynamic.buttons',
    type: 'api-buttons',
    label: 'Button Config',
    section,
    source: `${call.file}:${call.line}`,
    apiEndpoint: normalizeEndpoint(call.endpoint),
    params: [
      {
        name: 'gameId',
        envKey: 'VITE_GAME_ID',
        type: 'string',
        required: true,
        description: 'Mã game để lấy cấu hình button',
      },
    ],
    injectVia: 'env-inject',
    confidence: 0.9,
    detectionMethod: 'grep',
  };
}

function buildLeaderboardBlock(
  call: ApiCallMatch,
  repoPath: string
): DynamicBlock {
  const section = inferSection(call.file);

  // Try to detect tabs từ code gần đó
  const tabs = detectLeaderboardTabs(call);

  return {
    id: 'dynamic.leaderboard',
    type: 'api-leaderboard',
    label: 'Bảng Xếp Hạng',
    section,
    source: `${call.file}:${call.line}`,
    apiEndpoint: normalizeEndpoint(call.endpoint),
    params: [
      {
        name: 'mode',
        envKey: 'VITE_LB_MODE',
        type: 'enum',
        options: ['server', 'faction', 'cluster'],
        required: true,
        description: 'Chế độ xếp hạng',
      },
      {
        name: 'scope',
        envKey: 'VITE_LB_SCOPE',
        type: 'enum',
        options: ['global', 'region'],
        required: true,
        description: 'Phạm vi xếp hạng',
      },
      {
        name: 'limit',
        envKey: 'VITE_LB_LIMIT',
        type: 'number',
        default: 10,
        description: 'Số lượng hiển thị',
      },
    ],
    tabs,
    injectVia: 'env-inject',
    confidence: 0.85,
    detectionMethod: 'grep',
  };
}

function detectLeaderboardTabs(call: ApiCallMatch): LeaderboardTab[] {
  // Default tabs cho game Việt Nam
  return [
    { id: 'tab-server', label: 'BXH Server', mode: 'server', scope: 'global' },
    { id: 'tab-faction', label: 'BXH Tổng Môn', mode: 'faction', scope: 'global' },
    { id: 'tab-cluster', label: 'BXH Top Cụm', mode: 'cluster', scope: 'global' },
  ];
}

function inferSection(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.includes('/home/rank/') || p.includes('rank')) return 'home-rank';
  if (p.includes('/home/news/') || p.includes('news')) return 'home-news';
  if (p.includes('/header/')) return 'header';
  if (p.includes('/float-home/')) return 'float-home';
  return 'other';
}

function normalizeEndpoint(endpoint: string): string {
  // Bỏ base URL nếu có
  let normalized = endpoint;

  // Bỏ template literal
  normalized = normalized.replace(/\$\{[^}]+\}/g, '{param}');

  // Đảm bảo bắt đầu bằng /
  if (!normalized.startsWith('/') && !normalized.startsWith('http')) {
    normalized = '/' + normalized;
  }

  return normalized;
}
```

## Bước A.2.3 — Update `src/index.ts`

Thêm bước detect API blocks:

```typescript
// Trong src/index.ts, sau layer2-nextjs

import { layer2ScanApiBlocks } from './layer2-api-blocks.js';

// ...sau step 3 (Layer 2 references)

// Step 3.5: Scan API blocks
console.log('[3.5/5] Scanning API blocks...');
const apiBlocksResult = await layer2ScanApiBlocks(repoPath);
console.log(`      ✓ ${apiBlocksResult.dynamicBlocks.length} dynamic blocks found`);
console.log(`      ℹ️  ${apiBlocksResult.apiCallsFound.length} API calls detected`);
if (apiBlocksResult.warnings.length > 0) {
  for (const w of apiBlocksResult.warnings) {
    console.log(`      ⚠️  ${w}`);
  }
}
console.log('');

// ...sau đó update result

const result: DetectionResult = {
  gameId,
  repoPath,
  framework,
  assets,
  references,
  dynamicBlocks: apiBlocksResult.dynamicBlocks,   // ← NEW
  summary: {
    totalAssets: assets.length,
    totalReferences: references.length,
    totalDynamicBlocks: apiBlocksResult.dynamicBlocks.length,  // ← NEW
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

// Write extra output file
await writeFile(
  path.join(outputDir, 'dynamic-blocks.json'),
  JSON.stringify(apiBlocksResult.dynamicBlocks, null, 2)
);

await writeFile(
  path.join(outputDir, 'api-calls.json'),
  JSON.stringify(apiBlocksResult.apiCallsFound, null, 2)
);
```

## Bước A.2.4 — Update `src/report-generator.ts`

Thêm section cho dynamic blocks:

```typescript
// Trong generateReport, thêm sau phần Summary

lines.push(`\n## Dynamic Blocks (${r.summary.totalDynamicBlocks})\n`);
if (r.dynamicBlocks.length === 0) {
  lines.push('_(none detected)_');
} else {
  for (const block of r.dynamicBlocks) {
    lines.push(`### ${block.label} (${block.type})`);
    lines.push(`- Source: \`${block.source}\``);
    lines.push(`- API: \`${block.apiEndpoint}\``);
    lines.push(`- Section: ${block.section}`);
    lines.push(`- Confidence: ${block.confidence.toFixed(2)}`);
    lines.push(`- Params:`);
    for (const p of block.params) {
      lines.push(`  - \`${p.name}\` (env: \`${p.envKey}\`, type: ${p.type}${p.required ? ', required' : ''})`);
    }
    if (block.tabs && block.tabs.length > 0) {
      lines.push(`- Tabs:`);
      for (const t of block.tabs) {
        lines.push(`  - "${t.label}" (mode: ${t.mode}, scope: ${t.scope})`);
      }
    }
    lines.push('');
  }
}
```

## ✅ Acceptance A.2
- `src/layer2-api-blocks.ts` đã tạo
- `src/types.ts` đã update với `DynamicBlock`
- `src/index.ts` đã tích hợp layer mới
- `src/report-generator.ts` đã update
- `npm run typecheck` pass

---

# PHASE A.3 — CHẠY DETECT LẠI (10 phút)

## Bước A.3.1 — Backup manifest hiện tại

```bash
cd asset-detector-poc
cp output/phuong-hoang-tru-tien/manifest.json \
   output/phuong-hoang-tru-tien/manifest-before-phase-A.json
```

## Bước A.3.2 — Chạy detect lại

```bash
npm run detect:phuong-hoang
```

## Bước A.3.3 — Kiểm tra output

```bash
echo "=== Files trong output ==="
ls -la output/phuong-hoang-tru-tien/

echo ""
echo "=== Dynamic blocks detected ==="
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | jq '.'

echo ""
echo "=== API calls found ==="
cat output/phuong-hoang-tru-tien/api-calls.json | jq '.'

echo ""
echo "=== Summary ==="
cat output/phuong-hoang-tru-tien/manifest.json | jq '.summary'
```

## ✅ Acceptance A.3
- File `dynamic-blocks.json` được tạo
- File `api-calls.json` được tạo
- `manifest.json` có field `dynamicBlocks`

---

# PHASE A.4 — VERIFY (30 phút)

## Bước A.4.1 — Checklist verify

```bash
echo "=== 1. Check Button Config block ==="
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | \
  jq '.[] | select(.type == "api-buttons")'

echo ""
echo "=== 2. Check Leaderboard block ==="
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | \
  jq '.[] | select(.type == "api-leaderboard")'

echo ""
echo "=== 3. Check params ==="
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | \
  jq '.[].params'
```

## Bước A.4.2 — Verify với source code

```bash
# Nếu Button API được tìm thấy, kiểm tra
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | \
  jq -r '.[] | select(.type == "api-buttons") | .source' | \
  while read src; do
    file=$(echo "$src" | cut -d: -f1)
    line=$(echo "$src" | cut -d: -f2)
    echo "=== $src ==="
    sed -n "$((line-2)),$((line+5))p" "game-template-repo/phuong-hoang-tru-tien/home-page/$file"
  done
```

## Bước A.4.3 — Checklist

Tạo file `./verify-phase-A.md`:

```markdown
# Verify Phase A: API Blocks

## Button Config Block
- [ ] Có trong `dynamic-blocks.json`
- [ ] `type: "api-buttons"`
- [ ] `apiEndpoint` đúng
- [ ] Có param `gameId`
- [ ] `source` trỏ đúng file:line
- [ ] `confidence >= 0.8`

## Leaderboard Block
- [ ] Có trong `dynamic-blocks.json`
- [ ] `type: "api-leaderboard"`
- [ ] `apiEndpoint` đúng
- [ ] Có params `mode`, `scope`, `limit`
- [ ] `tabs` có 3 tabs (server, faction, cluster)
- [ ] `source` trỏ đúng file:line
- [ ] `confidence >= 0.8`

## Tổng thể
- [ ] Summary có `totalDynamicBlocks: 2`
- [ ] `manifest.json` có field `dynamicBlocks`
- [ ] Report có section "Dynamic Blocks"
- [ ] Không có false positive (API khác không bị detect nhầm)
```

---

# PHASE A.5 — XỬ LÝ TRƯỜNG HỢP ĐẶC BIỆT

## Case 1: Không tìm thấy API trong code

Nếu `dynamic-blocks.json` rỗng hoặc thiếu 1 trong 2:

```bash
# Tìm rộng hơn
grep -rn "api" src/ --include="*.ts" --include="*.tsx" | grep -i "url\|endpoint\|base"

# Check env vars
cat .env* 2>/dev/null
grep -rn "import.meta.env" src/ | head -30

# Check config files
find src -name "*.json" -o -name "*.config.*" | head -20
```

Nếu vẫn không tìm → **API có thể được gọi từ backend, không phải client**. Ghi vào report:

```markdown
## Warning: API không tìm thấy trong client code
- Button Config API: NOT FOUND
- Leaderboard API: NOT FOUND

Có thể:
- API được gọi từ SSR/backend
- API nằm trong file config riêng
- API dùng biến env (VITE_API_BASE) + path động

Cần manual review để xác định.
```

## Case 2: Tìm thấy nhiều API call

Nếu có nhiều file gọi cùng endpoint:

```bash
cat output/phuong-hoang-tru-tien/api-calls.json | jq 'group_by(.endpoint) | map({endpoint: .[0].endpoint, count: length})'
```

→ Chọn file gọi **chính** (ưu tiên file trong `src/services/` hoặc `src/api/`).

## Case 3: Endpoint dùng env var

Nếu code có:
```typescript
const url = `${import.meta.env.VITE_API_BASE}/api/config/buttons`;
```

→ Tool detect endpoint là `/api/config/buttons` và thêm env var `VITE_API_BASE` vào build config.

---

# SUCCESS CRITERIA

Phase A thành công khi:

- ✅ `dynamic-blocks.json` có **2 blocks** (buttons + leaderboard)
- ✅ Button block có `param: gameId`
- ✅ Leaderboard block có `params: mode, scope, limit` + `tabs: 3`
- ✅ Mỗi block có `source` trỏ đúng file:line
- ✅ `confidence >= 0.8` cho cả 2
- ✅ `manifest.json` updated với `summary.totalDynamicBlocks: 2`
- ✅ Report có section Dynamic Blocks
- ✅ `npm run typecheck` pass

# NẾU FAIL

Nếu không detect được API (case 1):

1. **Không tự ý thêm** block giả
2. **Report rõ**: API không tìm thấy trong client code
3. **Đề xuất**:
   - Manual annotate (operator tự điền endpoint)
   - Hoặc check SSR/backend
4. **Chờ confirm** trước khi tiếp tục

# KHÔNG LÀM TRONG FILE NÀY

- ❌ Không detect swiper
- ❌ Không detect responsive variants
- ❌ Không detect constraints
- ❌ Không build Clone Tool
- ❌ Không detect game khác

Chỉ detect 2 API blocks.

---

# OUTPUT FORMAT (Agent Báo Cáo)

```
## ✅ PHASE A COMPLETE: API Blocks Detection

### Discovery (A.1)
- Button API tìm thấy ở: [file:line]
- Leaderboard API tìm thấy ở: [file:line]
- Total API calls found: [N]

### Implementation (A.2)
- Files created: 1 (`layer2-api-blocks.ts`)
- Files modified: 3 (`types.ts`, `index.ts`, `report-generator.ts`)
- Typecheck: ✅ / ❌

### Detect Run (A.3)
- Chạy thành công: ✅ / ❌
- Duration: [Xms]

### Verify (A.4)
- Button Config block: ✅ / ⚠️ / ❌
  - endpoint: [...]
  - params: [...]
  - confidence: [X.XX]
- Leaderboard block: ✅ / ⚠️ / ❌
  - endpoint: [...]
  - params: [...]
  - tabs: [N]
  - confidence: [X.XX]

### Summary sau Phase A
- Total assets: 71 (không đổi)
- Total references: 108 (không đổi)
- Total dynamic blocks: [N] ← MỚI
- Warnings: [list]

### Output Files
- ./output/phuong-hoang-tru-tien/dynamic-blocks.json
- ./output/phuong-hoang-tru-tien/api-calls.json
- ./output/phuong-hoang-tru-tien/manifest.json (updated)

### Sample Dynamic Block
```json
[paste 1 example]
```

### Overall
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Ready for Phase B (Responsive): [yes/no]
- Notes: [text]
```

---

# BƯỚC TIẾP THEO (Sau khi PASS)

Nếu Phase A pass:
1. **Phase B** — Responsive Variants Grouping
2. **Phase C** — Constraints + Metadata
3. **Phase D** — Build & Deploy Config
4. **Clone Tool** — Sử dụng manifest hoàn chỉnh

# SAMPLE OUTPUT KỲ VỌNG

```json
// dynamic-blocks.json
[
  {
    "id": "dynamic.buttons",
    "type": "api-buttons",
    "label": "Button Config",
    "section": "header",
    "source": "src/services/api.ts:15",
    "apiEndpoint": "/api/config/buttons",
    "params": [
      {
        "name": "gameId",
        "envKey": "VITE_GAME_ID",
        "type": "string",
        "required": true,
        "description": "Mã game để lấy cấu hình button"
      }
    ],
    "injectVia": "env-inject",
    "confidence": 0.9,
    "detectionMethod": "grep"
  },
  {
    "id": "dynamic.leaderboard",
    "type": "api-leaderboard",
    "label": "Bảng Xếp Hạng",
    "section": "home-rank",
    "source": "src/components/home/Rank.tsx:88",
    "apiEndpoint": "/api/leaderboard",
    "params": [
      {
        "name": "mode",
        "envKey": "VITE_LB_MODE",
        "type": "enum",
        "options": ["server", "faction", "cluster"],
        "required": true
      },
      {
        "name": "scope",
        "envKey": "VITE_LB_SCOPE",
        "type": "enum",
        "options": ["global", "region"],
        "required": true
      },
      {
        "name": "limit",
        "envKey": "VITE_LB_LIMIT",
        "type": "number",
        "default": 10
      }
    ],
    "tabs": [
      { "id": "tab-server", "label": "BXH Server", "mode": "server", "scope": "global" },
      { "id": "tab-faction", "label": "BXH Tổng Môn", "mode": "faction", "scope": "global" },
      { "id": "tab-cluster", "label": "BXH Top Cụm", "mode": "cluster", "scope": "global" }
    ],
    "injectVia": "env-inject",
    "confidence": 0.85,
    "detectionMethod": "grep"
  }
]
```