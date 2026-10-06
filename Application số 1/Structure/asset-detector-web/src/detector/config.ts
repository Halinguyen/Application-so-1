import path from "node:path";
import { existsSync } from "node:fs";

// Nhóm A games confirmed to share phuong-hoang-tru-tien's exact structural
// fingerprint (src/services/index.ts, src/layout/HeaderHome.tsx,
// src/utils/constant.ts, vite.config.ts) — see MULTI-GAME-ROLLOUT-PLAN.md.
// tamquoc-quan-anh is structurally close but missing HeaderHome.tsx (Phase 4
// in the plan); it's listed here so the tool can at least point at it, not
// because its divergent case is already handled.
export const GAME_REPO_MAP: Record<string, string> = {
  "phuong-hoang-tru-tien": "home-page",
  "tuyetdinh-chiengioi": "t032-home-page",
  "tamquoc-daiminhtinh": "t037-home-landing",
  "tamquoc-quan-anh": "t203-homepage",
  // Nhóm B (Next.js) — pilot only, see layer2-nextjs.ts and
  // MULTI-GAME-ROLLOUT-PLAN.md Mục 8. Unlike Nhóm A, the 4 Next.js repos do
  // NOT share one fingerprint, so only the piloted game is wired in here
  // until each other one is surveyed/verified individually.
  "than-ma-ao-hoa": "t018-than-ma-website",
  // huyen-anh-volam was Nhóm C (.NET MVC/Razor Pages, detection-only) —
  // converted to Next.js (2026-09-29 pilot) so it flows through the same
  // clone pipeline as than-ma-ao-hoa instead of needing a parallel .NET
  // pipeline. The original .NET repo is kept on disk, untouched, as
  // reference/rollback at game-template-repo/huyen-anh-volam/
  // t027-huyen-anh-vo-lam-homepage (no longer referenced here).
  "huyen-anh-volam": "t027-huyen-anh-vo-lam-homepage-web",
  // Nhóm C (.NET MVC / Razor Pages) repos converted to Next.js 14 (2026-09-30
  // rollout, per Structure/06-PLAYBOOK-mvc-to-nextjs.md) so they flow through
  // the same clone pipeline as than-ma-ao-hoa. Each original .NET repo is kept
  // on disk, untouched, as reference/rollback in the sibling folder without
  // the "-web" suffix (no longer referenced here).
  "quy-mon-quan": "homepage-va-conhan-web",
  "samkok-tamquoc": "t028-samkok-tam-qu-c-home-and-landing-web",
  "ta-la-hac-ngokhong": "t031-home-page-web",
  "thoi-khong-chi-mong": "t022-web-web",
  "giang-ho-ky-ngo": "t030-giang-ho-ky-ngo-website-web",
};

// Display names shown in the tool (game picker, page headings), formatted
// "[<mã game>] <tên game có dấu>". The code is the project code used in the
// repo folder / Jenkins / deploy.yaml (e.g. T029 = VITE_APP_GAME_NAME).
export const GAME_DISPLAY_NAMES: Record<string, string> = {
  "phuong-hoang-tru-tien": "[T029] Phượng Hoàng Tru Tiên",
  "tuyetdinh-chiengioi": "[T032] Tuyệt Đỉnh Chiến Giới",
  "tamquoc-daiminhtinh": "[T037] Tam Quốc Đại Minh Tinh",
  "tamquoc-quan-anh": "[T203] Tam Quốc Quần Anh",
  "than-ma-ao-hoa": "[T018] Thần Ma Ảo Hóa",
  "huyen-anh-volam": "[T027] Huyền Anh Võ Lâm",
  "quy-mon-quan": "[R015] Quỷ Môn Quan",
  "samkok-tamquoc": "[T028] Samkok Tam Quốc",
  "ta-la-hac-ngokhong": "[T031] Ta Là Hắc Ngộ Không",
  "thoi-khong-chi-mong": "[T022] Thời Không Chi Mộng",
  "giang-ho-ky-ngo": "[T030] Giang Hồ Kỳ Ngộ",
};

// Falls back to a title-cased gameId for a game added to GAME_REPO_MAP
// before its display name is registered above.
export function getGameDisplayName(gameId: string): string {
  return (
    GAME_DISPLAY_NAMES[gameId] ??
    gameId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

// Avatar = the game's app icon, copied to public/game-icons/<gameId>.png.
// Returns null when a game has no icon file yet (the UI then shows a
// monogram) — tamquoc-daiminhtinh has none: its repo only ships a wordmark
// logo, and its apple-touch-icon is a copy of tuyetdinh-chiengioi's.
export function getGameIconUrl(gameId: string): string | null {
  return existsSync(path.join(process.cwd(), "public", "game-icons", `${gameId}.png`))
    ? `/game-icons/${gameId}.png`
    : null;
}

// Fake news-slide placeholder size per game. The default (560x450) fits the
// Phượng Hoàng family; a game whose slide slot differs overrides it here.
// tamquoc-quan-anh: New-page.tsx draws the slide inside frame.png (926x477)
// with md:px-14.5 / md:py-8.5 padding -> 810x409 usable area.
export const FAKE_SLIDE_SIZE: Record<string, { width: number; height: number }> = {
  "tamquoc-quan-anh": { width: 810, height: 409 },
};

export const DEFAULT_GAME_ID = "phuong-hoang-tru-tien";

const GAME_TEMPLATE_ROOT = path.resolve(process.cwd(), "..", "game-template-repo");

export interface ResolvedGame {
  gameId: string;
  repoPath: string;
}

// Falls back to DEFAULT_GAME_ID for an unknown id (typo'd ?game= value, or
// one not yet in GAME_REPO_MAP) or one whose folder doesn't actually exist
// on disk (e.g. minh-chu-vo-lam is listed in the rollout plan but isn't
// checked out in this workspace) — never throws, since this runs on every
// page load and a bad query param shouldn't 500 the whole tool.
export function resolveGame(gameIdInput?: string | null): ResolvedGame {
  const candidate = gameIdInput && GAME_REPO_MAP[gameIdInput] ? gameIdInput : DEFAULT_GAME_ID;
  const candidatePath = path.join(GAME_TEMPLATE_ROOT, candidate, GAME_REPO_MAP[candidate]);
  if (existsSync(candidatePath)) {
    return { gameId: candidate, repoPath: candidatePath };
  }
  // Candidate folder missing on disk — fall back to the default game
  // instead of resolving to a path that will 404/ENOENT everywhere.
  const defaultPath = path.join(GAME_TEMPLATE_ROOT, DEFAULT_GAME_ID, GAME_REPO_MAP[DEFAULT_GAME_ID]);
  return { gameId: DEFAULT_GAME_ID, repoPath: defaultPath };
}

// Clones always call the REAL backend (no fake data): hub config / categories /
// slides / posts go to REAL_HUB_URL (the game's code adds
// `?game_id=<GAME_ID>&language_name=vi`), ranking goes to REAL_RANKING_HOST
// (`/api/Ranking/GetRanking?gameId=&mode=&scope=`). Both are written into the
// clone's .env.local — nothing is asked in the wizard.
export const REAL_HUB_URL = "https://vplay.vn/website-api";
export const REAL_RANKING_HOST = "game-services-api.vplay.vn";
