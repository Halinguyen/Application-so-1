# Phase B + C Report: phuong-hoang-tru-tien

## Phase B — Responsive Grouping

### Results
- Total assets trước grouping: 71
- Total assets sau grouping: 56 (28 per-breakpoint groups + 28 shared)
- Responsive groups: 28
- Shared assets: 28
- Missing mobile breakpoints: 28/28 (repo chỉ có 768/1920, không có 375 — đúng như `00-CONTEXT.md`/`PHASE-B-C-responsive-constraints.md` đã lưu ý)

### Sample groups
```
public/assets/home/banner/1920/banner.png
  - desktop: public/assets/home/banner/1920/banner.png (2947.6 KB)
  - tablet:  public/assets/home/banner/768/banner.jpg (652.0 KB)
  - ⚠️ missing: mobile

public/assets/tintuc/1920/banner_trang2.png
  - tablet:  public/assets/tintuc/768/banner_trang2.png (7.9 KB)
  - desktop: public/assets/tintuc/1920/banner_trang2.png (12.7 KB)
  - ⚠️ missing: mobile

public/assets/tintuc/1920/chevrons-left.png
  - desktop: public/assets/tintuc/1920/chevrons-left.png
  - ⚠️ missing: mobile, tablet   (single-variant group — no crash, per Acceptance Phase B)
```

## Phase C — Constraints + Metadata

### Results
- Assets with dimensions: 47/56 (favicon assets deliberately skipped — `isAutoManaged` images aren't dimension-probed, by the given design)
- Assets with constraints: 55/56 (external CDN asset skipped — dimensions/size genuinely unknowable for a remote file)
- Assets with metadata: 56/56
- Assets with injection config: 55/56 (external skipped, same reason)
- Operator editable: 47/56 — exactly the non-favicon, non-external set
- By group: other: 17, button: 14, rank: 6, icon: 6, frame: 5, banner: 3, logo: 3, background: 2

### Sample enriched asset
```json
{
  "canonicalPath": "public/assets/tintuc/1920/banner_trang2.png",
  "responsive": "per-breakpoint",
  "referenceCount": 4,
  "confidence": 1,
  "section": "tintuc",
  "variants": {
    "tablet": { "path": "public/assets/tintuc/768/banner_trang2.png", "size": 8061 },
    "desktop": { "path": "public/assets/tintuc/1920/banner_trang2.png", "size": 12960 }
  },
  "missingBreakpoints": ["mobile"],
  "dimensions": { "width": 1920, "height": 1328 },
  "constraints": { "ratio": "120:83", "maxFileSize": 1048576, "allowedFormats": ["png","jpg","jpeg","webp"], "allowTransparent": true },
  "metadata": { "label": "Banner Trang2", "priority": "high", "operatorEditable": true, "group": "banner" },
  "injection": { "strategy": "file-override", "targetPaths": ["public/assets/tintuc/768/banner_trang2.png", "public/assets/tintuc/1920/banner_trang2.png"], "postProcess": ["resize", "optimize"] }
}
```

## Full Pipeline

### Output files
- manifest.json ✅
- assets.json ✅ (now mirrors `enrichedAssets`, kept in sync)
- references.json ✅
- dynamic-blocks.json ✅
- api-calls.json ✅
- responsive-groups.json ✅ (new)
- enriched-assets.json ✅ (new)
- report.md ✅ (Responsive + Constraints Summary sections added)

## Bugs found in the spec's own code and fixed (within Phase B/C's own function scope — not scope expansion)

1. **`parseAssetPath()` groupKey included the file extension.** The doc's own headline example (`banner/768/banner.jpg` + `banner/1920/banner.png` → 1 grouped asset) could never actually group, since the two files differ by extension and the original groupKey was `${basePath}/${fileName}` (extension included). Fixed by grouping on the extension-stripped filename. Verified: this exact pair now groups correctly (see sample above).
2. **`buildResponsiveId()` ignored the filename entirely**, generating ids from only the last 3 path segments. Since dozens of unrelated files sit under the same 3-segment parent (e.g. everything in `.../home/news/1920/`), this would collide every one of them onto the *same* `id`. Fixed by including the filename stem in the id.
3. **`pickPrimaryVariant()` fabricated a fake `DetectedAsset`** (hardcoded `referenceCount: 0`, `confidence: 0.9`, `section: 'other'`, `isFooter: false`, etc.) instead of using the real, already-computed asset data for whichever variant becomes primary. This silently discarded real references/confidence/section for every multi-variant group without a shared asset. Fixed by looking up the real `DetectedAsset` object by its `canonicalPath` instead of reconstructing one. Verified against the sample above: `banner_trang2.png`'s merged group correctly shows its real 4 references and confidence 1.0, not fabricated defaults.

None of these touched Layer 1/2 or the confidence *formula* itself (still `Math.max(primaryAsset.confidence, ...variants.map(() => 0.9))`, per "không tối ưu confidence thêm").

## Known pre-existing issue (flagged, not fixed — outside this document's scope)
Two `id` collisions remain in the output: `asset.apple-touch-icon` (exists at both `public/favicon/` and `public/assets/tintuc/`) and `asset.logo-game` (exists at both `public/assets/header/` and `public/assets/home/banner/`). Root cause is in `layer4-merge.ts`'s original id generation (`asset.${fileName-without-extension}`, no path context) from an earlier phase — not something Phase B/C introduced or was asked to touch (`layer4-merge.ts` isn't in this document's file list).

## Overall
- Status: ✅ PASS
- Ready for Phase D (Build/Deploy Config): yes
- Notes: All Phase B and Phase C acceptance checklists satisfied. Two exceptions are by-design (external assets don't get dimensions/constraints/injection; favicons don't get dimensions) — both explicit in the given code, not defects. One pre-existing id-collision issue flagged for a future dedicated fix pass.
