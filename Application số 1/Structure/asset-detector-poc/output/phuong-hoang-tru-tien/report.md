# Detection Report: phuong-hoang-tru-tien

- **Framework:** vite-spa ^6.3.5
- **Router:** spa
- **Package Manager:** npm
- **Styling:** tailwind
- **Detected at:** 2026-09-24T02:34:27.589Z
- **Duration:** 734ms

## Summary

- Total assets: 61
- Total references: 113
- Avg confidence: 0.87
- Needs manual review: 8
- Auto-managed (favicon): 8
- External URLs: 6


## Dynamic Blocks (2)

### Site Config (Buttons) (api-buttons)
- Source: `src/services/index.ts:30`
- API: `/api/frontend/config`
- Section: global
- Confidence: 0.95
- Params:
  - `game_id` (env: `VITE_APP_GAME_ID`, type: string, required)
  - `language_name` (env: ``, type: string)

### Bảng Xếp Hạng (api-leaderboard)
- Source: `src/services/index.ts:166`
- API: `/Ranking/GetRanking`
- Section: home-rank
- Confidence: 0.95
- Params:
  - `gameId` (env: `VITE_APP_GAME_ID`, type: string, required)
  - `mode` (env: `VITE_LB_MODE`, type: enum, required)
  - `scope` (env: `VITE_LB_SCOPE`, type: enum, required)
- Tabs:
  - "BXH All Server" (mode: user, scope: all)
  - "BXH Cụm Server" (mode: user, scope: area)


## Swipers (3)

### swiper.1 — single
- Source: `src/components/news/NewsMainSlider.tsx:19`
- Library: swiper
- slidesPerView: 1, centeredSlides: false, spaceBetween: 10
- Slide count: (unknown — resolved at runtime)
- Data source: data-driven (prop: slides)
- Autoplay: true (3000ms), Loop: true
- Indicators: custom dot indicators (JS-rendered buttons, not image assets)
- Confidence: 0.85

### swiper.2 — single
- Source: `src/components/news/SliderMB.tsx:13`
- Library: swiper
- slidesPerView: 1, centeredSlides: false, spaceBetween: 10
- Slide count: 5
- Data source: static (static array: src/utils/constant.ts)
- Autoplay: true (3000ms), Loop: true
- Indicators: custom dot indicators (JS-rendered buttons, not image assets)
- Confidence: 0.90

### swiper.3 — coverflow (coverflow)
- Source: `src/components/news/SliderPC.tsx:29`
- Library: swiper
- slidesPerView: 1.3, centeredSlides: true, spaceBetween: 0
- Slide count: 5
- Data source: static (static array: src/utils/constant.ts)
- Autoplay: true (10000ms), Loop: true
- Navigation: prev=`/assets/home/news/1920/btn-prev.png`, next=`/assets/home/news/1920/btn-next.png`
- Confidence: 0.90


## Responsive

- Per-breakpoint groups: 28
- Shared assets: 33

### Responsive Groups (28)

- `public/assets/rank/1920/bg-rank.png`
  - desktop: `public/assets/rank/1920/bg-rank.png` (8.8 KB)
  - tablet: `public/assets/rank/768/bg-rank.png` (5.7 KB)
  - ⚠️ missing: mobile
- `public/assets/rank/1920/title-rank.png`
  - desktop: `public/assets/rank/1920/title-rank.png` (44.1 KB)
  - tablet: `public/assets/rank/768/title-rank.png` (44.0 KB)
  - ⚠️ missing: mobile
- `public/assets/tintuc/1920/banner_trang2.png`
  - desktop: `public/assets/tintuc/1920/banner_trang2.png` (12.7 KB)
  - tablet: `public/assets/tintuc/768/banner_trang2.png` (7.9 KB)
  - ⚠️ missing: mobile
- `public/assets/tintuc/1920/chevrons-left.png`
  - desktop: `public/assets/tintuc/1920/chevrons-left.png` (0.3 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/tintuc/1920/chevrons-right.png`
  - desktop: `public/assets/tintuc/1920/chevrons-right.png` (0.3 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/tintuc/1920/frame-tab-content.png`
  - desktop: `public/assets/tintuc/1920/frame-tab-content.png` (8.8 KB)
  - tablet: `public/assets/tintuc/768/frame-tab-content.png` (8.9 KB)
  - ⚠️ missing: mobile
- `public/assets/tintuc/1920/frame-tab-detail.png`
  - desktop: `public/assets/tintuc/1920/frame-tab-detail.png` (10.3 KB)
  - tablet: `public/assets/tintuc/768/frame-tab-detail.png` (8.8 KB)
  - ⚠️ missing: mobile
- `public/assets/home/banner/1920/banner.png`
  - desktop: `public/assets/home/banner/1920/banner.png` (2947.2 KB)
  - tablet: `public/assets/home/banner/768/banner.jpg` (652.0 KB)
  - ⚠️ missing: mobile
- `public/assets/home/banner/1920/logo-18.png`
  - desktop: `public/assets/home/banner/1920/logo-18.png` (16.9 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/banner/1920/text-game.png`
  - desktop: `public/assets/home/banner/1920/text-game.png` (311.0 KB)
  - tablet: `public/assets/home/banner/768/text-game.png` (194.1 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/banner.png`
  - tablet: `public/assets/home/news/768/banner.png` (9.8 KB)
  - desktop: `public/assets/home/news/1920/banner.png` (12.7 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/btn-cskh.png`
  - tablet: `public/assets/home/news/768/btn-cskh.png` (67.0 KB)
  - desktop: `public/assets/home/news/1920/btn-cskh.png` (70.1 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/btn-fanpage.png`
  - tablet: `public/assets/home/news/768/btn-fanpage.png` (71.0 KB)
  - desktop: `public/assets/home/news/1920/btn-fanpage.png` (76.1 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/btn-giftcode.png`
  - tablet: `public/assets/home/news/768/btn-giftcode.png` (63.9 KB)
  - desktop: `public/assets/home/news/1920/btn-giftcode.png` (66.6 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/btn-nap.png`
  - tablet: `public/assets/home/news/768/btn-nap.png` (65.6 KB)
  - desktop: `public/assets/home/news/1920/btn-nap.png` (70.3 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/frame-right.png`
  - tablet: `public/assets/home/news/768/frame-right.png` (3.5 KB)
  - desktop: `public/assets/home/news/1920/frame-right.png` (3.2 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/frame.png`
  - tablet: `public/assets/home/news/768/frame.png` (223.2 KB)
  - desktop: `public/assets/home/news/1920/frame.png` (5.1 KB)
  - ⚠️ missing: mobile
- `public/assets/home/news/1920/android.png`
  - desktop: `public/assets/home/news/1920/android.png` (3.3 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/apk.png`
  - desktop: `public/assets/home/news/1920/apk.png` (3.1 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/btn-next.png`
  - desktop: `public/assets/home/news/1920/btn-next.png` (8.1 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/btn-prev.png`
  - desktop: `public/assets/home/news/1920/btn-prev.png` (8.1 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/frame-middle.png`
  - desktop: `public/assets/home/news/1920/frame-middle.png` (2.1 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/icon-app.png`
  - desktop: `public/assets/home/news/1920/icon-app.png` (648.7 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/ios.png`
  - desktop: `public/assets/home/news/1920/ios.png` (2.8 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/note.png`
  - desktop: `public/assets/home/news/1920/note.png` (1.4 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/pc.png`
  - desktop: `public/assets/home/news/1920/pc.png` (1.6 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/news/1920/slide.png`
  - desktop: `public/assets/home/news/1920/slide.png` (293.4 KB)
  - ⚠️ missing: mobile, tablet
- `public/assets/home/rank/1920/bg-rank.png`
  - desktop: `public/assets/home/rank/1920/bg-rank.png` (607.1 KB)
  - tablet: `public/assets/home/rank/768/bg-rank.png` (71.7 KB)
  - ⚠️ missing: mobile
## By Type

- image: 70

## By Section

- home-news: 17
- float-home: 11
- favicon: 8
- home-rank: 6
- external: 6
- tintuc: 5
- home-banner: 4
- rank: 2
- header: 2

## Assets Needing Review

- `public/assets/home/banner/1920/banner.png` (confidence: 0.90, section: home-banner)
- `public/assets/home/banner/1920/text-game.png` (confidence: 0.90, section: home-banner)
- `public/assets/home/news/1920/note.png` (confidence: 0.90, section: home-news)
- `public/assets/home/news/1920/slide.png` (confidence: 0.90, section: home-news)
- `public/assets/float-home/float-bg.png` (confidence: 0.50, section: float-home)
- `public/assets/float-home/qr-code.png` (confidence: 0.50, section: float-home)

## Top 20 Assets by Reference Count

- `public/assets/home/news/1920/icon-app.png` — 7 refs (confidence: 1.00, section: home-news)
- `public/assets/tintuc/1920/banner_trang2.png` — 4 refs (confidence: 1.00, section: tintuc)
- `public/assets/home/rank/top1.png` — 4 refs (confidence: 1.00, section: home-rank)
- `public/assets/home/rank/top2.png` — 4 refs (confidence: 1.00, section: home-rank)
- `public/assets/home/rank/top3.png` — 4 refs (confidence: 1.00, section: home-rank)
- `public/assets/home/banner/1920/logo-18.png` — 3 refs (confidence: 1.00, section: home-banner)
- `public/assets/home/news/1920/android.png` — 3 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/apk.png` — 3 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/frame-middle.png` — 3 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/ios.png` — 3 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/pc.png` — 3 refs (confidence: 1.00, section: home-news)
- `public/assets/float-home/btn-fanpage.png` — 3 refs (confidence: 1.00, section: float-home)
- `public/assets/header/logo-game.png` — 3 refs (confidence: 1.00, section: header)
- `public/assets/home/banner/logo-game.png` — 3 refs (confidence: 1.00, section: home-banner)
- `public/assets/rank/1920/bg-rank.png` — 2 refs (confidence: 1.00, section: rank)
- `public/assets/tintuc/1920/frame-tab-content.png` — 2 refs (confidence: 1.00, section: tintuc)
- `public/assets/tintuc/1920/frame-tab-detail.png` — 2 refs (confidence: 1.00, section: tintuc)
- `public/assets/home/news/1920/banner.png` — 2 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/btn-cskh.png` — 2 refs (confidence: 1.00, section: home-news)
- `public/assets/home/news/1920/btn-fanpage.png` — 2 refs (confidence: 1.00, section: home-news)

## Constraints Summary

- With dimensions: 47
- With constraints: 55
- With metadata: 61
- Operator editable: 47

### Assets by Group

- other: 22
- button: 14
- rank: 6
- icon: 6
- frame: 5
- banner: 3
- logo: 3
- background: 2