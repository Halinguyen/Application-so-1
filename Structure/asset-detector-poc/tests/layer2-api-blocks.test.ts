import { describe, it, expect } from 'vitest';
import {
  resolveEnvAlias,
  resolveSection,
  findConsumerSections,
  normalizeEndpoint,
  detectButtonParams,
  extractApiCalls,
} from '../src/layer2-api-blocks.js';

describe('resolveEnvAlias', () => {
  it('resolves a local const alias assigned from KEY_ENV.X', () => {
    const content = `const BASE_API_HUB = KEY_ENV.VITE_APP_HUB;\nconst x = 1;`;
    expect(resolveEnvAlias('BASE_API_HUB', content)).toBe('VITE_APP_HUB');
  });

  it('resolves a local const alias assigned from import.meta.env.X', () => {
    const content = `const BASE = import.meta.env.VITE_APP_HUB;`;
    expect(resolveEnvAlias('BASE', content)).toBe('VITE_APP_HUB');
  });

  it('returns the name unchanged when no alias declaration is found', () => {
    const content = `const OTHER = 1;`;
    expect(resolveEnvAlias('VITE_APP_API_GAME_SERVICES', content)).toBe('VITE_APP_API_GAME_SERVICES');
  });
});

describe('resolveSection', () => {
  it('falls back to inferSection(fallbackFile) when there are 0 consumers', () => {
    expect(resolveSection([], 'src/services/index.ts')).toBe('other');
  });

  it('uses the single consumer section when exactly 1 distinct section is found', () => {
    expect(resolveSection(['home-rank'], 'src/services/index.ts')).toBe('home-rank');
  });

  it('labels the block "global" when consumers span multiple distinct sections', () => {
    expect(resolveSection(['header', 'float-home', 'home-news'], 'src/services/index.ts')).toBe('global');
  });

  it('collapses duplicate sections to a single one rather than "global"', () => {
    expect(resolveSection(['header', 'header'], 'src/services/index.ts')).toBe('header');
  });
});

describe('findConsumerSections', () => {
  it('finds a consumer by function-name call site', () => {
    const files = new Map([
      ['src/services/index.ts', 'export const getRanking = createAsyncThunk(...);'],
      ['src/components/home/Rank.tsx', 'import { getRanking } from "../../services";\ngetRanking({ mode, scope });'],
    ]);
    const sections = findConsumerSections(
      { file: 'src/services/index.ts', line: 1, endpoint: '/x', rawCode: '', functionName: 'getRanking' },
      files
    );
    expect(sections).toEqual(['home-rank']);
  });

  it('finds a consumer by thunk action-type field access when no direct function call exists', () => {
    const files = new Map([
      ['src/services/index.ts', 'export const getSiteConfig = createAsyncThunk("siteConfig", ...);'],
      ['src/layout/HeaderHome.tsx', 'const { siteConfig } = useSelector((s) => s.storeApp);'],
    ]);
    const sections = findConsumerSections(
      { file: 'src/services/index.ts', line: 1, endpoint: '/x', rawCode: '', thunkName: 'siteConfig' },
      files
    );
    expect(sections).toEqual(['header']);
  });

  it('returns an empty array when the call carries no functionName/thunkName to search for', () => {
    const files = new Map([['src/x.tsx', 'anything']]);
    expect(findConsumerSections({ file: 'src/services/index.ts', line: 1, endpoint: '/x', rawCode: '' }, files)).toEqual([]);
  });

  it('excludes the definition file itself from the consumer search', () => {
    const files = new Map([
      ['src/services/index.ts', 'export const getRanking = ...; getRanking();'],
    ]);
    const sections = findConsumerSections(
      { file: 'src/services/index.ts', line: 1, endpoint: '/x', rawCode: '', functionName: 'getRanking' },
      files
    );
    expect(sections).toEqual([]);
  });
});

describe('normalizeEndpoint', () => {
  it('prefixes a bare path with /', () => {
    expect(normalizeEndpoint('api/frontend/config')).toBe('/api/frontend/config');
  });

  it('leaves an absolute http(s) URL untouched (no leading slash added)', () => {
    expect(normalizeEndpoint('http://example.com/api')).toBe('http://example.com/api');
  });

  it('replaces a leftover ${...} template interpolation with a placeholder', () => {
    expect(normalizeEndpoint('${slug}/detail')).toBe('/{param}/detail');
  });
});

describe('detectButtonParams', () => {
  it('detects game_id from snake_case usage', () => {
    const params = detectButtonParams({ file: '', line: 0, endpoint: '', rawCode: 'params: { game_id: X }' });
    expect(params.some(p => p.name === 'game_id')).toBe(true);
  });

  it('detects game_id from camelCase usage too', () => {
    const params = detectButtonParams({ file: '', line: 0, endpoint: '', rawCode: 'params: { gameId: X }' });
    expect(params.some(p => p.name === 'game_id')).toBe(true);
  });

  it('returns no params when neither is present', () => {
    const params = detectButtonParams({ file: '', line: 0, endpoint: '', rawCode: 'params: { foo: 1 }' });
    expect(params).toEqual([]);
  });
});

describe('extractApiCalls', () => {
  it('captures a single-line axios.get with an env-prefixed template literal', () => {
    const content = 'const r = await axios.get(`${BASE_API_HUB}/api/frontend/config`, {});';
    const calls = extractApiCalls(content, 'src/services/index.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].endpoint).toBe('/api/frontend/config');
    expect(calls[0].baseUrlEnv).toBe('BASE_API_HUB');
  });

  it('does NOT capture a multi-line axios.get call (documented scanner limitation)', () => {
    const content = [
      'const r = await axios.get(',
      '  `${ENV}/Ranking/GetRanking`,',
      '  { params: {} }',
      ');',
    ].join('\n');
    const calls = extractApiCalls(content, 'src/services/index.ts');
    expect(calls).toHaveLength(0);
  });

  it('captures a plain fetch() call', () => {
    const content = `fetch("/api/leaderboard?mode=server")`;
    const calls = extractApiCalls(content, 'src/x.ts');
    expect(calls[0].endpoint).toBe('/api/leaderboard?mode=server');
  });
});
