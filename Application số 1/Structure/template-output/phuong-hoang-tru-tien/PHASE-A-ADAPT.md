# Phase A — Adapt Detection Cho Case Thực Tế

## Metadata
- **Game ID:** phuong-hoang-tru-tien
- **Discovery Report:** `./discovery-API-blocks.md` (đã có)
- **Thực tế:** Endpoint names KHÁC giả định, cần adapt
- **Output:** `manifest.json` với `dynamicBlocks` đúng

## Context Từ Discovery

### Button Config API
- Endpoint thực tế: `GET {VITE_APP_HUB}/api/frontend/config`
- Function: `getSiteConfig` trong `src/services/index.ts:30`
- Params: `game_id` (từ `VITE_APP_GAME_ID`), `language_name`
- Consumers: 5 files (FloatHome, HeaderHome, FooterWrapper, NewsActionButtons, NewsDownloadPanel)

### Leaderboard API
- Endpoint thực tế: `GET {VITE_APP_API_GAME_SERVICES}/Ranking/GetRanking`
- Function: `getRanking` trong `src/services/index.ts:170`
- Params: `gameId`, `mode`, `scope` (KHÔNG có `limit`)
- Tabs: 2 (All Server / Cụm Server) — KHÔNG phải 3
- Consumers: `src/components/home/Rank.tsx`

## Task
Adapt `src/layer2-api-blocks.ts` để detect đúng pattern thực tế.

## Nguyên Tắc
- KHÔNG hardcode 1 game
- Dùng **pattern matching linh hoạt** cho nhiều kiểu endpoint
- Support cả camelCase và snake_case cho params
- Confidence cao cho pattern match chính xác

---

## Bước A.ADAPT.1 — Update `extractApiCalls()`

Thêm pattern detect axios.get với env var:

```typescript
function extractApiCalls(content: string, file: string): ApiCallMatch[] {
  const matches: ApiCallMatch[] = [];

  // Pattern 1: axios.get(`${ENV}/path`, {...})
  const axiosEnvPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/g;

  // Pattern 2: axios.get('/path', {...})
  const axiosPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 3: fetch(...) với env
  const fetchEnvPattern = /fetch\s*\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/g;

  // ... giữ các pattern cũ

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Axios với env var
    let m;
    while ((m = axiosEnvPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[3],           // path
        baseUrlEnv: m[2],         // env var name
        method: m[1].toUpperCase(),
        rawCode: line.trim(),
      });
    }

    // Axios thường
    while ((m = axiosPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[2],
        method: m[1].toUpperCase(),
        rawCode: line.trim(),
      });
    }

    // Fetch với env var
    while ((m = fetchEnvPattern.exec(line)) !== null) {
      matches.push({
        file,
        line: lineNum,
        endpoint: m[2],
        baseUrlEnv: m[1],
        method: 'GET',
        rawCode: line.trim(),
      });
    }
  }

  return dedupeMatches(matches);
}
```

**Update type `ApiCallMatch`:**

```typescript
interface ApiCallMatch {
  file: string;
  line: number;
  endpoint: string;
  baseUrlEnv?: string;       // ← NEW
  method?: string;
  rawCode: string;
  paramsInCode?: string[];   // ← NEW: params extract từ gần đó
}
```

## Bước A.ADAPT.2 — Detect bằng Function Name

Thêm function detect qua wrapper function:

```typescript
async function findApiWrappers(repoPath: string): Promise<Map<string, string>> {
  /**
   * Tìm các API wrapper function trong services/
   * Trả về Map: function name → endpoint
   */
  const wrappers = new Map<string, string>();

  const serviceFiles = await fg([
    '**/services/**/*.{ts,js}',
    '**/api/**/*.{ts,js}',
  ], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  for (const file of serviceFiles) {
    const content = await readFile(file, 'utf-8');

    // Pattern: export const funcName = createAsyncThunk(...) với axios.get(...)
    // Hoặc: export async function funcName() { ... axios.get(...) ... }
    const funcPattern = /(?:export\s+(?:const|async\s+function)\s+(\w+)|createAsyncThunk\s*\(\s*['"](\w+)['"])/g;

    // Trong mỗi function, tìm axios call
    const axiosEnvPattern = /axios\.get\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/g;
    const axiosUrlPattern = /axios\.get\(\s*[`'"]([^`'"]+)[`'"]/g;

    // Split content thành các function block
    const blocks = content.split(/(?=export\s+(?:const|async function))/);

    for (const block of blocks) {
      // Tìm tên function
      const nameMatch = block.match(/export\s+const\s+(\w+)|export\s+async\s+function\s+(\w+)/);
      const thunkMatch = block.match(/createAsyncThunk\s*\(\s*['"](\w+)['"]/);
      
      const funcName = nameMatch?.[1] || nameMatch?.[2] || thunkMatch?.[1];

      // Tìm endpoint
      let endpoint = '';
      let baseUrlEnv = '';
      
      const envMatch = block.match(axiosEnvPattern);
      if (envMatch) {
        endpoint = envMatch[2];
        baseUrlEnv = envMatch[1];
      } else {
        const urlMatch = block.match(axiosUrlPattern);
        if (urlMatch) {
          endpoint = urlMatch[1];
        }
      }

      if (funcName && endpoint) {
        wrappers.set(funcName, endpoint);
        if (baseUrlEnv) {
          wrappers.set(`${funcName}__baseUrlEnv`, baseUrlEnv);
        }
      }
    }
  }

  return wrappers;
}
```

## Bước A.ADAPT.3 — Update `buildButtonConfigBlock()`

Detect linh hoạt hơn:

```typescript
function buildButtonConfigBlock(
  call: ApiCallMatch,
  repoPath: string
): DynamicBlock {
  const section = inferSection(call.file);

  // Detect params thật từ context
  const params = detectButtonParams(call);

  return {
    id: 'dynamic.buttons',
    type: 'api-buttons',
    label: 'Site Config (Buttons)',
    section,
    source: `${call.file}:${call.line}`,
    apiEndpoint: normalizeEndpoint(call.endpoint),
    baseUrlEnv: call.baseUrlEnv,           // ← NEW
    params,
    injectVia: 'env-inject',
    confidence: 0.95,                       // ← Cao hơn vì match chính xác
    detectionMethod: 'grep',
  };
}

function detectButtonParams(call: ApiCallMatch): DynamicBlockParam[] {
  const params: DynamicBlockParam[] = [];

  // Detect game_id
  if (call.rawCode.includes('game_id') || call.rawCode.includes('gameId')) {
    params.push({
      name: 'game_id',
      envKey: 'VITE_APP_GAME_ID',
      type: 'string',
      required: true,
      description: 'Mã game',
    });
  }

  // Detect language_name
  if (call.rawCode.includes('language_name') || call.rawCode.includes('language')) {
    params.push({
      name: 'language_name',
      envKey: '',                          // không cần env
      type: 'string',
      default: 'vi',
      description: 'Ngôn ngữ',
    });
  }

  return params;
}
```

## Bước A.ADAPT.4 — Update `buildLeaderboardBlock()`

Khớp với API thực tế:

```typescript
function buildLeaderboardBlock(
  call: ApiCallMatch,
  repoPath: string
): DynamicBlock {
  const section = inferSection(call.file);

  return {
    id: 'dynamic.leaderboard',
    type: 'api-leaderboard',
    label: 'Bảng Xếp Hạng',
    section,
    source: `${call.file}:${call.line}`,
    apiEndpoint: normalizeEndpoint(call.endpoint),
    baseUrlEnv: call.baseUrlEnv,
    params: [
      {
        name: 'gameId',
        envKey: 'VITE_APP_GAME_ID',
        type: 'string',
        required: true,
      },
      {
        name: 'mode',
        envKey: 'VITE_LB_MODE',
        type: 'enum',
        options: ['user'],
        required: true,
        description: 'Chế độ xếp hạng',
      },
      {
        name: 'scope',
        envKey: 'VITE_LB_SCOPE',
        type: 'enum',
        options: ['all', 'area'],
        required: true,
        description: 'Phạm vi xếp hạng',
      },
      // KHÔNG có limit vì API không nhận
    ],
    tabs: [
      { id: 'tab-all', label: 'BXH All Server', mode: 'user', scope: 'all' },
      { id: 'tab-area', label: 'BXH Cụm Server', mode: 'user', scope: 'area' },
    ],
    injectVia: 'env-inject',
    confidence: 0.95,
    detectionMethod: 'grep',
  };
}
```

## Bước A.ADAPT.5 — Update `layer2ScanApiBlocks()`

Match bằng cả endpoint name và function name:

```typescript
export async function layer2ScanApiBlocks(repoPath: string): Promise<ApiBlocksResult> {
  // ... scan files

  // Build wrapper map từ services/
  const wrappers = await findApiWrappers(repoPath);

  // Step 1: Extract API calls
  // ...

  // Step 2: Định nghĩa patterns match (flexible)
  const BUTTON_CONFIG_PATTERNS = [
    /config\/buttons/i,
    /frontend\/config/i,
    /site[\-_]?config/i,
    /getSiteConfig/i,
  ];

  const LEADERBOARD_PATTERNS = [
    /api\/leaderboard/i,
    /Ranking\/GetRanking/i,
    /getRanking/i,
    /\/rank/i,
  ];

  // Step 3: Match calls
  const buttonCalls = apiCallsFound.filter(c =>
    BUTTON_CONFIG_PATTERNS.some(p => p.test(c.endpoint) || p.test(c.rawCode))
  );

  const leaderboardCalls = apiCallsFound.filter(c =>
    LEADERBOARD_PATTERNS.some(p => p.test(c.endpoint) || p.test(c.rawCode))
  );

  // Step 4: Build blocks
  // ... (giữ nguyên)
}
```

## Bước A.ADAPT.6 — Update `types.ts`

Thêm fields mới:

```typescript
export interface DynamicBlock {
  // ... existing fields
  baseUrlEnv?: string;                  // ← NEW: VITE_APP_HUB hoặc VITE_APP_API_GAME_SERVICES
  consumedBy?: string[];                 // ← NEW: list file dùng block này
}

interface ApiCallMatch {
  file: string;
  line: number;
  endpoint: string;
  baseUrlEnv?: string;                   // ← NEW
  method?: string;
  rawCode: string;
}
```

## Bước A.ADAPT.7 — Chạy lại Detect

```bash
cd asset-detector-poc
npm run typecheck
npm run detect:phuong-hoang
```

## Bước A.ADAPT.8 — Verify

```bash
echo "=== Dynamic blocks ==="
cat output/phuong-hoang-tru-tien/dynamic-blocks.json | jq '.'

echo ""
echo "=== API calls found ==="
cat output/phuong-hoang-tru-tien/api-calls.json | jq 'group_by(.endpoint) | map({endpoint: .[0].endpoint, count: length})'
```

## ✅ Acceptance Criteria

- ✅ Button Config block detected với:
  - `apiEndpoint: "/api/frontend/config"`
  - `baseUrlEnv: "VITE_APP_HUB"`
  - `params: [game_id, language_name]`
- ✅ Leaderboard block detected với:
  - `apiEndpoint: "/Ranking/GetRanking"`
  - `baseUrlEnv: "VITE_APP_API_GAME_SERVICES"`
  - `params: [gameId, mode, scope]`
  - `tabs: 2` (All Server, Cụm Server)
- ✅ Không có `limit` trong leaderboard params
- ✅ `confidence >= 0.9` cho cả 2
- ✅ `summary.totalDynamicBlocks: 2`
- ✅ Typecheck pass

---

# OUTPUT FORMAT

```
## ✅ PHASE A-ADAPT COMPLETE

### Before Adapt
- Button API: NOT FOUND (literal match)
- Leaderboard API: NOT FOUND (literal match)

### After Adapt
- Button API: ✅ FOUND
  - endpoint: /api/frontend/config
  - baseUrlEnv: VITE_APP_HUB
  - params: [game_id, language_name]
  - confidence: 0.95
- Leaderboard API: ✅ FOUND
  - endpoint: /Ranking/GetRanking
  - baseUrlEnv: VITE_APP_API_GAME_SERVICES
  - params: [gameId, mode, scope]
  - tabs: 2
  - confidence: 0.95

### Files Modified
- src/layer2-api-blocks.ts
- src/types.ts
- src/index.ts (nếu cần)

### Output
- dynamic-blocks.json: 2 blocks
- api-calls.json: N calls

### Overall
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Notes: [text]
```

---

# BƯỚC TIẾP THEO

Sau Phase A-Adapt pass:
1. **Phase B** — Responsive Variants Grouping
2. **Phase C** — Constraints + Metadata
3. **Phase D** — Build & Deploy Config

# KHÔNG LÀM

- ❌ Không detect thêm API nào khác
- ❌ Không thay đổi Layer 1/2
- ❌ Không build UI