import { DynamicBlock, DynamicBlockParam } from './types';
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
  baseUrlEnv?: string;
  method?: string;
  rawCode: string;
  functionName?: string;
  thunkName?: string;    // tên action-type của createAsyncThunk, vd. 'siteConfig' cho getSiteConfig
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

  // Giữ lại nội dung mọi file đã scan — dùng lại ở Step 4 để tìm UI nào thật
  // sự CONSUME 1 dynamic block (thay vì suy section từ file ĐỊNH NGHĨA API,
  // luôn là src/services/index.ts, dẫn tới section: "other" vô nghĩa).
  const fileContents = new Map<string, string>();

  // Step 1: Find all API calls (line-based — catches single-line calls)
  for (const file of files) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');

    // Skip footer
    if (FOOTER_PATTERNS.some(p => p.test(relativePath))) continue;

    const content = await readFile(file, 'utf-8');
    fileContents.set(relativePath, content);
    const matches = extractApiCalls(content, relativePath);
    apiCallsFound.push(...matches);
  }

  // Step 1.5: Find API wrapper functions in services/ via a whole-file scan.
  // This catches calls the line-based extractApiCalls above cannot see —
  // e.g. `axios.get(\n  \`${ENV}/path\`,\n  {...}\n)` where the URL isn't on
  // the same line as `axios.get(`.
  const wrapperCalls = await findApiWrappers(repoPath);
  const mergedKey = (c: ApiCallMatch) => `${c.file}:${c.endpoint}`;
  const byKey = new Map(apiCallsFound.map(c => [mergedKey(c), c]));
  for (const w of wrapperCalls) {
    const key = mergedKey(w);
    const existing = byKey.get(key);
    if (existing) {
      // Cùng 1 call có thể được cả extractApiCalls (line-based, không biết
      // tên hàm bao ngoài) VÀ findApiWrappers (whole-file, có functionName/
      // thunkName) bắt được — vd. call single-line như getSiteConfig. Bỏ
      // qua thẳng thay vì merge sẽ làm mất functionName/thunkName, khiến
      // findConsumerSections() sau này không tìm được consumer nào (luôn
      // rơi về section "other").
      if (!existing.functionName) existing.functionName = w.functionName;
      if (!existing.thunkName) existing.thunkName = w.thunkName;
    } else {
      byKey.set(key, w);
    }
  }
  apiCallsFound.length = 0;
  apiCallsFound.push(...byKey.values());

  // Step 2: Định nghĩa patterns match (flexible, không hardcode 1 game)
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

  // Step 3: Match calls — check endpoint, rawCode (surrounding context), và
  // functionName (khi có, từ findApiWrappers), không chỉ endpoint string.
  const buttonCalls = apiCallsFound.filter(c =>
    BUTTON_CONFIG_PATTERNS.some(p =>
      p.test(c.endpoint) || p.test(c.rawCode) || (c.functionName ? p.test(c.functionName) : false)
    )
  );

  // Prefer the call that actually sends a game id over an SDK-style call such
  // as `sdk.site.getConfig()` (which also matches the patterns but carries no
  // params to clone) — Array.sort is stable, so the original order is kept
  // among calls with the same preference.
  const sendsGameId = (c: ApiCallMatch) => /\b(?:game_id|gameId)\s*:/.test(c.rawCode);
  buttonCalls.sort((a, b) => Number(sendsGameId(b)) - Number(sendsGameId(a)));

  const leaderboardCalls = apiCallsFound.filter(c =>
    LEADERBOARD_PATTERNS.some(p =>
      p.test(c.endpoint) || p.test(c.rawCode) || (c.functionName ? p.test(c.functionName) : false)
    )
  );
  leaderboardCalls.sort((a, b) => Number(sendsGameId(b)) - Number(sendsGameId(a)));

  // Step 4: Build dynamic blocks
  const dynamicBlocks: DynamicBlock[] = [];

  if (buttonCalls.length > 0) {
    const consumerSections = findConsumerSections(buttonCalls[0], fileContents);
    dynamicBlocks.push(
      buildButtonConfigBlock(buttonCalls[0], consumerSections, fileContents.get(buttonCalls[0].file))
    );
  } else {
    warnings.push('Không tìm thấy Button Config API call trong code');
  }

  if (leaderboardCalls.length > 0) {
    const consumerSections = findConsumerSections(leaderboardCalls[0], fileContents);
    dynamicBlocks.push(
      buildLeaderboardBlock(leaderboardCalls[0], consumerSections, fileContents.get(leaderboardCalls[0].file))
    );
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

export function extractApiCalls(content: string, file: string): ApiCallMatch[] {
  const matches: ApiCallMatch[] = [];
  const lines = content.split('\n');

  // Pattern 1: axios.get(`${ENV}/path`, {...})
  const axiosEnvPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/g;

  // Pattern 2: axios.get('/path', {...})
  const axiosPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 3: fetch(...) với env
  const fetchEnvPattern = /fetch\s*\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/g;

  // Pattern 4: fetch('/api/...')
  const fetchPattern = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  // Pattern 5: useSWR('/api/...') hoặc useQuery
  const swrPattern = /useSWR\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
  const queryPattern = /useQuery\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    // Widen context so downstream param-name sniffing (detectButtonParams)
    // can see a multi-line params object even when the call itself opens
    // on a single line.
    const context = lines.slice(i, i + 8).join('\n');

    // axios — env-prefixed takes priority over the generic pattern so the
    // same call isn't recorded twice with two different endpoint strings.
    const axiosEnvMatches = Array.from(line.matchAll(axiosEnvPattern));
    if (axiosEnvMatches.length > 0) {
      for (const m of axiosEnvMatches) {
        matches.push({
          file,
          line: lineNum,
          endpoint: m[3] || '/',
          baseUrlEnv: resolveEnvAlias(m[2], content),
          method: m[1].toUpperCase(),
          rawCode: context,
        });
      }
    } else {
      for (const m of line.matchAll(axiosPattern)) {
        matches.push({ file, line: lineNum, endpoint: m[2], method: m[1].toUpperCase(), rawCode: context });
      }
    }

    // fetch — same priority logic
    const fetchEnvMatches = Array.from(line.matchAll(fetchEnvPattern));
    if (fetchEnvMatches.length > 0) {
      for (const m of fetchEnvMatches) {
        matches.push({
          file,
          line: lineNum,
          endpoint: m[2] || '/',
          baseUrlEnv: resolveEnvAlias(m[1], content),
          method: 'GET',
          rawCode: context,
        });
      }
    } else {
      for (const m of line.matchAll(fetchPattern)) {
        matches.push({ file, line: lineNum, endpoint: m[1], method: 'GET', rawCode: context });
      }
    }

    for (const m of line.matchAll(swrPattern)) {
      matches.push({ file, line: lineNum, endpoint: m[1], method: 'GET', rawCode: context });
    }
    for (const m of line.matchAll(queryPattern)) {
      matches.push({ file, line: lineNum, endpoint: m[1], method: 'GET', rawCode: context });
    }
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

/**
 * Tìm các API wrapper function trong services/ (whole-file scan, không phải
 * line-by-line) — bắt được cả những call trải dài nhiều dòng, ví dụ:
 *   axios.get(
 *     `${ENV}/path`,
 *     { params: {...} }
 *   )
 * mà extractApiCalls() (line-based) không thấy được.
 */
async function findApiWrappers(repoPath: string): Promise<ApiCallMatch[]> {
  const results: ApiCallMatch[] = [];

  const serviceFiles = await fg([
    '**/services/**/*.{ts,js}',
    '**/api/**/*.{ts,js}',
  ], {
    cwd: repoPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  const axiosEnvPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]\$\{(\w+)\}([^`'"]*)[`'"]/;
  const axiosUrlPattern = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/;
  const paramsPattern = /params\s*:\s*\{([\s\S]*?)\}/;

  for (const file of serviceFiles) {
    const relativePath = path.relative(repoPath, file).replace(/\\/g, '/');
    if (FOOTER_PATTERNS.some(p => p.test(relativePath))) continue;

    const content = await readFile(file, 'utf-8');

    // Split content thành các function block: mỗi block bắt đầu từ 1
    // `export const ...` hoặc `export async function ...`.
    const blocks = content.split(/(?=export\s+(?:const|async function))/);

    for (const block of blocks) {
      const nameMatch = block.match(/export\s+const\s+(\w+)|export\s+async\s+function\s+(\w+)/);
      const thunkMatch = block.match(/createAsyncThunk\s*\(\s*['"](\w+)['"]/);
      const funcName = nameMatch?.[1] || nameMatch?.[2] || thunkMatch?.[1];
      if (!funcName) continue;

      let endpoint = '';
      let baseUrlEnv: string | undefined;

      const envMatch = block.match(axiosEnvPattern);
      if (envMatch) {
        endpoint = envMatch[3];
        baseUrlEnv = resolveEnvAlias(envMatch[2], content);
      } else {
        const urlMatch = block.match(axiosUrlPattern);
        if (urlMatch) endpoint = urlMatch[2];
      }
      if (!endpoint) continue;

      const paramsMatch = block.match(paramsPattern);
      const rawCode = `${funcName}${paramsMatch ? `\nparams: {${paramsMatch[1]}}` : ''}`;

      const declIdx = content.indexOf(`export const ${funcName}`);
      const declIdx2 = declIdx >= 0 ? declIdx : content.indexOf(`export async function ${funcName}`);
      const line = declIdx2 >= 0 ? content.slice(0, declIdx2).split('\n').length : 1;

      results.push({
        file: relativePath,
        line,
        endpoint,
        baseUrlEnv,
        method: 'GET',
        rawCode,
        functionName: funcName,
        thunkName: thunkMatch?.[1],
      });
    }
  }

  return results;
}

/**
 * Resolve 1 local const alias (vd. `const BASE_API_HUB = KEY_ENV.VITE_APP_HUB`)
 * về tên biến env thật (VITE_APP_HUB) thay vì trả về tên alias cục bộ.
 */
export function resolveEnvAlias(localName: string, fileContent: string): string {
  const aliasPattern = new RegExp(
    `const\\s+${localName}\\s*=\\s*(?:KEY_ENV\\.|import\\.meta\\.env\\.|process\\.env\\.)(\\w+)`
  );
  const m = fileContent.match(aliasPattern);
  return m ? m[1] : localName;
}

const DEFAULT_GAME_ID_ENV_KEY = 'VITE_APP_GAME_ID';

/**
 * Tên biến env THẬT mà template dùng cho game id của 1 API call
 * (`game_id: GAME_ID` -> KEY_ENV.VITE_GAME_ID, `gameId: process.env.NEXT_PUBLIC_GAME_ID`,
 * `process.env.NEXT_PUBLIC_HUB_GAME_ID`...). Clone dùng đúng tên khóa của bản được
 * clone, không ép một tên cố định cho mọi framework. Không suy ra được thì
 * rơi về VITE_APP_GAME_ID.
 */
export function resolveGameIdEnvKey(rawCode: string, fileContent?: string): string {
  const m = rawCode.match(/\b(?:game_id|gameId)\s*:\s*([^,}\n]+)/);
  if (!m) return DEFAULT_GAME_ID_ENV_KEY;
  const expr = m[1].trim();
  const direct = expr.match(/(?:process\.env|import\.meta\.env|KEY_ENV)\.(\w+)/);
  if (direct) return direct[1];
  const ident = expr.match(/^(\w+)/);
  if (ident && fileContent) {
    const resolved = resolveEnvAlias(ident[1], fileContent);
    if (resolved !== ident[1]) return resolved;
  }
  return DEFAULT_GAME_ID_ENV_KEY;
}

/**
 * `inferSection(call.file)` luôn trỏ vào file ĐỊNH NGHĨA API (src/services/
 * index.ts với repo này) → luôn ra "other", vô nghĩa với operator. Tìm những
 * file THẬT SỰ DÙNG block này (gọi hàm, hoặc đọc field state của thunk) và
 * suy section từ đó. Không hardcode tên hàm/field cụ thể của 1 game — lấy
 * từ chính ApiCallMatch (functionName, thunkName) nên vẫn generic.
 */
export function findConsumerSections(call: ApiCallMatch, fileContents: Map<string, string>): string[] {
  const patterns: RegExp[] = [];
  if (call.functionName) patterns.push(new RegExp(`\\b${call.functionName}\\s*\\(`));
  if (call.thunkName) patterns.push(new RegExp(`\\b${call.thunkName}\\b`));
  if (patterns.length === 0) return [];

  const sections = new Set<string>();
  for (const [file, content] of fileContents) {
    if (file === call.file) continue;
    if (patterns.some(re => re.test(content))) {
      sections.add(inferSection(file));
    }
  }
  return [...sections];
}

/** 0 consumer tìm thấy → fallback về file định nghĩa (section "other").
 * 1 section duy nhất → block đó thuộc đúng section này.
 * ≥2 section khác nhau → block dùng chung nhiều section, gắn nhãn "global"
 * thay vì chọn đại 1 section gây hiểu nhầm. */
export function resolveSection(consumerSections: string[], fallbackFile: string): string {
  // Dedupe defensively rather than trusting the caller to have done it —
  // findConsumerSections() currently always pre-dedupes via a Set, but this
  // function shouldn't silently misbehave (miscount 2x the same section as
  // "spans multiple sections" -> "global") if ever called with raw, un-deduped
  // input from elsewhere.
  const distinct = [...new Set(consumerSections)];
  if (distinct.length === 0) return inferSection(fallbackFile);
  if (distinct.length === 1) return distinct[0];
  return 'global';
}

function buildButtonConfigBlock(
  call: ApiCallMatch,
  consumerSections: string[] = [],
  fileContent?: string
): DynamicBlock {
  const section = resolveSection(consumerSections, call.file);
  const params = detectButtonParams(call, fileContent);

  return {
    id: 'dynamic.buttons',
    type: 'api-buttons',
    label: 'Site Config (Buttons)',
    section,
    source: `${call.file}:${call.line}`,
    apiEndpoint: normalizeEndpoint(call.endpoint),
    baseUrlEnv: call.baseUrlEnv,
    params,
    injectVia: 'env-inject',
    confidence: 0.95,
    detectionMethod: 'grep',
  };
}

export function detectButtonParams(call: ApiCallMatch, fileContent?: string): DynamicBlockParam[] {
  const params: DynamicBlockParam[] = [];

  // Detect game_id (camelCase hoặc snake_case)
  if (call.rawCode.includes('game_id') || call.rawCode.includes('gameId')) {
    params.push({
      name: 'game_id',
      envKey: resolveGameIdEnvKey(call.rawCode, fileContent),
      type: 'string',
      required: true,
      description: 'Mã game',
    });
  }

  // Detect language_name
  if (call.rawCode.includes('language_name') || call.rawCode.includes('language')) {
    params.push({
      name: 'language_name',
      envKey: '',
      type: 'string',
      default: 'vi',
      description: 'Ngôn ngữ',
    });
  }

  return params;
}

function buildLeaderboardBlock(
  call: ApiCallMatch,
  consumerSections: string[] = [],
  fileContent?: string
): DynamicBlock {
  const section = resolveSection(consumerSections, call.file);

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
        envKey: resolveGameIdEnvKey(call.rawCode, fileContent),
        type: 'string',
        required: true,
        description: 'Mã game',
      },
      // KHÔNG hỏi mode/scope: lấy nguyên theo bản được clone (hằng trong code,
      // không phải biến env). Cũng không có `limit` — API không nhận param này.
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

function inferSection(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.includes('/home/rank/') || p.includes('rank')) return 'home-rank';
  if (p.includes('/home/news/') || p.includes('news')) return 'home-news';
  // Bare-word fallback cần thiết vì consumer file thường là 1 component
  // (HeaderHome.tsx, FloatHome.tsx) chứ không nằm trong 1 folder cùng tên.
  if (p.includes('/header/') || p.includes('header')) return 'header';
  if (p.includes('/float-home/') || p.includes('floathome') || p.includes('float-home')) return 'float-home';
  return 'other';
}

export function normalizeEndpoint(endpoint: string): string {
  // Bỏ base URL nếu có
  let normalized = endpoint;

  // Bỏ template literal (trường hợp còn sót ${...} chưa được env-pattern xử lý)
  normalized = normalized.replace(/\$\{[^}]+\}/g, '{param}');

  // Đảm bảo bắt đầu bằng /
  if (!normalized.startsWith('/') && !normalized.startsWith('http')) {
    normalized = '/' + normalized;
  }

  return normalized;
}
