# Iteration Log: phuong-hoang-tru-tien

## Iteration 1
- Vấn đề: Phase 3 crashed — `framework-detector.ts` only recognizes `nextjs` (via `pkg.dependencies.next`) or `.NET` (via `*.csproj`); this repo is a Vite 6 SPA, so `detectFramework()` threw `Unsupported framework: not Next.js or .NET` before any asset scanning ran.
- Fix: Added `'vite-spa'` to the `Framework` type, a `detectVite()` branch in `framework-detector.ts` (checks `deps.vite`, reuses the same lockfile/tailwind checks as the Next.js branch), and a new `layer2-vite.ts` scanner wired into `index.ts` for `framework === 'vite-spa'`.
- Kết quả: Phase 3 passes (exit 0), 70 assets scanned, 108 references found, avg confidence 0.73, 4 output files written.

## Iteration 2
- Vấn đề: Phase 4 sanity check showed `assets.json` had inflated `referenceCount`/confidence — every `handleConcatPathImage({ path: "..." })` call was being counted twice: once via the `JSXAttribute` → `CallExpression` resolution in `layer2-vite.ts`, once via the standalone `ObjectProperty` visitor matching the same `path:` key independently.
- Fix: Removed the `CallExpression` branch from `extractExpressionValue()`, since the `ObjectProperty` visitor already generically captures that pattern in every context (not just inside JSX).
- Kết quả: References dropped from 160 → 108 (duplicates removed), avg confidence 0.79 → 0.73 (more honest), same 43/70 assets still resolved — no coverage lost, just no more double-counting.

## Known limitations carried forward (not fixed — out of scope for "add a Vite Layer 2 scanner")
- `layer4-merge.ts`'s `detectSection()` keyword list (`hero/header/sidebar/swiper/leaderboard/content/banner`) doesn't cover this repo's actual folder names (`float-home`, `news`, `rank`, `tintuc`), so 56/70 assets fall into `section: "other"`. This is a Layer 4 (merge) limitation, not a Layer 2 (scanner) one.
- Computed template literals that require evaluating an expression (`` `/assets/home/rank/top${idx+1}.png` ``, `` `${basePath}/btn-nap.png` ``) are captured as unresolved-pattern references (visible in `references.json`) but cannot be matched to concrete files by a static scanner without semantic evaluation. This affects 7 real assets (`top1-3.png`, `btn-nap/giftcode/fanpage/cskh` × 2 breakpoints) — consistent with the `DYNAMIC_PATH_ASSETS` finding from the earlier manual audit.
- `index.html` is not scanned (spec only scans `.ts/.tsx/.js/.jsx/.css/.scss`), so the 7 favicon files linked only from `<link>` tags there show up as zero-reference / needs-review, matching expectations rather than being a bug.
