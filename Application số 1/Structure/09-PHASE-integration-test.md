# Phase 9 — Integration Test Trên 10 Real Repos
**Thời gian:** 4 ngày

## Context
Test toàn bộ pipeline trên 10 repo thực tế. Đây là **acceptance test cuối cùng**.

## Requirements

### 1. Setup Test Repos

Tạo file `tests/repos.yaml`:
```yaml
repos:
  - id: repo-01
    path: /path/to/repo-01
    url: https://site-01.com
    expected:
      framework: nextjs
      assetCount: { min: 30, max: 80 }
      hasSwiper: true
      hasLeaderboard: true
  - id: repo-02
    path: /path/to/repo-02
    url: https://site-02.com
    expected:
      framework: dotnet-mvc
      assetCount: { min: 20, max: 60 }
      hasSwiper: false
      hasLeaderboard: true
  # ... 10 repos
```

### 2. Integration Test Suite

```typescript
// tests/integration/real-repos.test.ts
import { describe, it, expect } from 'vitest';
import { runFullDetection } from '../helpers/detection-runner';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const config = yaml.parse(readFileSync('./tests/repos.yaml', 'utf-8'));

describe('Integration Tests — 10 Real Repos', () => {
  for (const repo of config.repos) {
    describe(`Repo: ${repo.id}`, () => {
      let result: DetectionResult;

      beforeAll(async () => {
        result = await runFullDetection(repo.path, repo.url);
      }, 120000);  // 2 min timeout

      it('detects framework correctly', () => {
        expect(result.framework.framework).toBe(repo.expected.framework);
      });

      it('detects asset count in expected range', () => {
        expect(result.assets.length).toBeGreaterThanOrEqual(repo.expected.assetCount.min);
        expect(result.assets.length).toBeLessThanOrEqual(repo.expected.assetCount.max);
      });

      it('has confidence > 0.85', () => {
        const avgConfidence = result.assets.reduce((sum, a) => sum + a.confidence, 0) / result.assets.length;
        expect(avgConfidence).toBeGreaterThan(0.85);
      });

      it('detects swiper if expected', () => {
        if (repo.expected.hasSwiper) {
          expect(result.swipers.length).toBeGreaterThan(0);
        }
      });

      it('detects leaderboard if expected', () => {
        if (repo.expected.hasLeaderboard) {
          expect(result.leaderboards.length).toBeGreaterThan(0);
        }
      });

      it('excludes footer assets', () => {
        const footerAssets = result.assets.filter(a => a.footerOnly);
        expect(footerAssets.length).toBe(0);  // footerOnly bị loại khỏi manifest
      });

      it('persists to DB successfully', async () => {
        await expect(persistDetection(result)).resolves.not.toThrow();
      });
    });
  }
});
```

### 3. Accuracy Report Generator

```typescript
// tests/integration/report-generator.ts
export function generateAccuracyReport(results: DetectionResult[]): string {
  const report = {
    totalRepos: results.length,
    byFramework: {},
    totalAssetsDetected: 0,
    avgConfidence: 0,
    footerAssetsSkipped: 0,
    swipersDetected: 0,
    leaderboardsDetected: 0,
    manualReviewNeeded: 0,
  };
  // ... compute
  return JSON.stringify(report, null, 2);
}
```

### 4. Manual Review Checklist

Sau khi chạy integration test, generate file `reports/manual-review.md`:

```markdown
# Manual Review Checklist

## Repo-01 (Next.js)
- [ ] Verify hero assets detected: 12 found
- [ ] Verify swiper slides: 4 found
- [ ] Verify leaderboard: 3 tabs
- [ ] Check assets với confidence < 0.7: 3 found
  - [ ] asset.foo (0.6) — reason: template literal
- [ ] Verify footer excluded: 8 files skipped

## Repo-02 (.NET)
...
```

### 5. Acceptance Criteria

**Toàn bộ 10 repo phải pass:**
1. ✅ Framework detected đúng 10/10
2. ✅ Asset count trong expected range 10/10
3. ✅ Avg confidence > 0.85 10/10
4. ✅ Footer excluded 10/10
5. ✅ Swiper/Leaderboard detect đúng theo expectation
6. ✅ Persist DB thành công 10/10
7. ✅ Total detection time < 5 phút/repo

**Nếu < 8/10 repo pass → fail phase → cần điều chỉnh.**

### 6. Report Output

Generate `reports/phase9-report.md`:

```markdown
# Phase 9 — Integration Test Report

## Summary
- Total repos: 10
- Passed: 9/10
- Failed: 1/10 (repo-05)

## By Framework
- Next.js: 6 repos ✓
- .NET MVC: 4 repos (1 fail)

## Asset Detection
- Total assets detected: 487
- Avg confidence: 0.91
- Assets needing manual review: 23 (4.7%)

## Footer Exclusion
- Footer files skipped: 87
- Footer-only assets excluded: 34

## Swiper Detection
- Single-slide swipers: 5
- Coverflow swipers: 3
- Total slides captured: 42

## Leaderboard Detection
- Leaderboards found: 8
- Total tabs: 21

## Failed Cases
- repo-05: asset count 15 < expected min 20
  - Reason: 3 assets not detected (dynamic imports)
  - Action: Add manual annotation

## Recommendations
- Improve dynamic import detection
- Add `data-slot` to repos missing it
```

## Acceptance Criteria
1. ✅ 10/10 repos scan không crash
2. ✅ ≥ 9/10 repos pass tất cả checks
3. ✅ Report generated
4. ✅ Manual review list generated

## Output Format
```
## Phase 9 Report
### Repos Scanned: 10
### Passed: X/10
### Avg Confidence: X.XX
### Failed Cases: (list)
### Recommendations: (list)
### Ready for Production: YES/NO
```