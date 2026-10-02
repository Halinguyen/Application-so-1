# Audit Report: phuong-hoang-tru-tien

> **Path note:** `game-template-repo/phuong-hoang-tru-tien/` has no `package.json` at its root — the actual app lives one level deeper, at `game-template-repo/phuong-hoang-tru-tien/home-page/`. All commands below were run against that corrected path.

## Framework
- Next.js version: **NOT FOUND** — no `next` dependency in `package.json`
- React version: 19.2.1
- Router: **N/A** — no `src/app/`, `src/pages/`, root `pages/`, or root `app/` directory exists
- Package Manager: npm (`package-lock.json` present; no `pnpm-lock.yaml`/`yarn.lock`)
- Node: not declared in `engines` (no `engines` field in package.json)
- Styling: tailwind (`tailwindcss@^4.1.5`, `@tailwindcss/vite@^4.1.5`; no `tailwind.config.*` — Tailwind v4 uses CSS-first config, not a JS/TS config file)

**⚠️ Actual stack:** Vite 6.3.5 + React 19.2.1 + react-router 7.6.0 (client-side `BrowserRouter`/`Routes`), i.e. a Vite SPA. This does not match either framework in the detector's supported set (`nextjs` | `dotnet-mvc`).

## Assets
- Public folder exists: yes
- Total files: 72
- Images (jpg/png): 69
- SVG: 1 (`public/vite.svg`, unrelated to game assets)
- WebP: 0
- Video: 0 (hero video and all 5 slider art images are hosted on an external CDN, not in `public/`)
- Font: 0
- Subfolders: `assets/float-home`, `assets/header`, `assets/home/banner/{1920,768}`, `assets/home/footer/1920`, `assets/home/news/{1920,768}`, `assets/home/rank/{1920,768}`, `assets/rank/{1920,768}`, `assets/tintuc/{1920,768}`, `favicon`

## data-slot
- Files with data-slot: 0
- Total occurrences: 0
- Slots found: none — this codebase does not use the `data-slot` convention at all

## Footer
- Footer folder: yes (`src/layout/`, `public/assets/home/footer/`)
- Footer files: `src/layout/Footer.tsx`, `src/layout/FooterWrapper.tsx`, `public/assets/home/footer/1920/logo.png`
- SDK folder: no dedicated `sdk/` folder, but `Footer.tsx` injects an external SDK script at runtime (`sdk-web-vplay/loader.min.js`) and renders a `data-vplay-widget="footer"` mount point

## Swiper
- Library: swiper (`swiper@^11.2.6`)
- Files using swiper: `src/components/news/NewsMainSlider.tsx`, `src/components/news/SliderMB.tsx`, `src/components/news/SliderPC.tsx` (registered in `src/main.tsx` via `swiper/css` imports)

## Video
- Files with `<video>`: `src/components/home/Banner.tsx` (hero background video), plus `src/page/LandingH5/Choigame1-5.tsx` (separate H5 landing routes, out of scope for the home page detection)

## API Calls
- `/api/config/buttons`: 0 (literal string not found)
- `/api/leaderboard`: 0 (literal string not found)
- **Actual dynamic endpoints found** (`src/services/index.ts`): `GET {VITE_APP_HUB}/api/frontend/config` (site/button config), `GET {VITE_APP_API_GAME_SERVICES}/Ranking/GetRanking` (leaderboard) — same two dynamic-block *categories* the spec expects (button config + leaderboard), just different route names than assumed.

## ✅ Acceptance Phase 0
- [x] Audit report file created (this file)
- [x] Framework: known precisely — **not Next.js / not .NET**, actually Vite 6 SPA (no router in the app/pages sense; react-router 7 client routing)
- [x] Package manager: npm
- [x] Asset count: 72 files in `public/` (69 usable jpg/png)
- [x] Swiper: yes, 3 components
- [x] Footer: yes, excluded per project convention

**Phase 0 status: PASS** (all information gathered), but flags a blocking mismatch for later phases: `framework-detector.ts` (Phase 2) only recognizes `nextjs` and `dotnet-mvc`, and this repo is neither.
