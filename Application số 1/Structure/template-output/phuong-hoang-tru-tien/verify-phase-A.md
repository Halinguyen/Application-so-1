# Verify Phase A: API Blocks

## Button Config Block
- [ ] ❌ Có trong `dynamic-blocks.json` — mảng rỗng `[]`
- [ ] ❌ `type: "api-buttons"` — n/a, không có block nào
- [ ] ❌ `apiEndpoint` đúng — n/a
- [ ] ❌ Có param `gameId` — n/a
- [ ] ❌ `source` trỏ đúng file:line — n/a
- [ ] ❌ `confidence >= 0.8` — n/a

**Root cause:** `api-calls.json` DID capture the real call (`src/services/index.ts:30`, endpoint `${BASE_API_HUB}/api/frontend/config`), but the classification filter `endpoint.includes('config/buttons') || includes('/buttons') || includes('button-config')` doesn't match `/api/frontend/config` — the real endpoint name doesn't contain any of those substrings. This matches the mismatch already flagged in `discovery-API-blocks.md`.

## Leaderboard Block
- [ ] ❌ Có trong `dynamic-blocks.json` — mảng rỗng `[]`
- [ ] ❌ `type: "api-leaderboard"` — n/a
- [ ] ❌ `apiEndpoint` đúng — n/a
- [ ] ❌ Có params `mode`, `scope`, `limit` — n/a
- [ ] ❌ `tabs` có 3 tabs (server, faction, cluster) — n/a (real repo only has 2 tabs anyway, see discovery report)
- [ ] ❌ `source` trỏ đúng file:line — n/a
- [ ] ❌ `confidence >= 0.8` — n/a

**Root cause (worse than the button case):** `getRanking()`'s real call in `src/services/index.ts` spans multiple lines —
```ts
const response = await axios.get(
  `${VITE_APP_API_GAME_SERVICES}/Ranking/GetRanking`,
  { ... }
);
```
`extractApiCalls()` scans line-by-line and only matches when `axios.get(` and the string literal are on the *same* line. Since the URL is on the line after `axios.get(`, this call is **never captured at all** — it doesn't even appear in `api-calls.json`. Even if it were captured, the endpoint `Ranking/GetRanking` wouldn't match the `leaderboard`/`/rank`/`bxh` keyword filter either (case-sensitive `.includes('/rank')` doesn't match `/Ranking`).

## Tổng thể
- [ ] ❌ Summary có `totalDynamicBlocks: 2` — got `0`
- [x] ✅ `manifest.json` có field `dynamicBlocks` — present (empty array)
- [x] ✅ Report có section "Dynamic Blocks" — present, shows `(none detected)`
- [x] ✅ Không có false positive — confirmed: 0 blocks means 0 false positives (the 3 API calls that WERE captured — `/api/frontend/config`, `/api/frontend/posts`, `/api/frontend/slides` — correctly did NOT get miscategorized as buttons/leaderboard)

## Kết luận
Both target blocks are **NOT FOUND** by the literal detection code, for two independent reasons:
1. Button Config: endpoint captured but doesn't match the hardcoded keyword filter (name mismatch: `/api/frontend/config` vs `config/buttons`).
2. Leaderboard: endpoint never even captured (multi-line call, a scanner limitation independent of the keyword-matching issue).

Per this file's own `KHÔNG tự ý thêm` rule, no block was fabricated. See `PHASE-A-API.md`'s Case 1 procedure — proceeding to that now.
