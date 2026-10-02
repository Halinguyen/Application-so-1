// Section keys are internal detector vocabulary (see detectSection() in
// layer4-merge.ts) — this maps them to a plain-language, Vietnamese
// description for non-technical operators reviewing/uploading assets, who
// have no reason to know what "float-bxh" means. Generic across every game
// on this tech stack: the keys come from the detector's own classification
// taxonomy, not any one game's folder structure.
const SECTION_LABELS: Record<string, string> = {
  header: "Đầu trang (header)",
  footer: "Chân trang (footer)",
  favicon: "Biểu tượng trình duyệt (favicon)",
  "home-banner": "Banner trang chủ",
  "home-news": "Tin tức trang chủ",
  "home-rank": "Bảng xếp hạng trang chủ",
  tintuc: "Trang tin tức",
  rank: "Bảng xếp hạng",
  news: "Tin tức",
  banner: "Banner",
  icons: "Biểu tượng (icon)",
  logo: "Logo",
  buttons: "Nút bấm",
  frame: "Khung viền",
  background: "Ảnh nền",
  home: "Trang chủ",
  layout: "Bố cục chung",
  "float-home": "Nút nổi (trang chủ)",
  "float-bxh": "Nút nổi (bảng xếp hạng)",
  external: "Tài nguyên tải từ CDN ngoài",
  other: "Khác",
};

export function describeSection(section: string): string {
  return SECTION_LABELS[section] || humanize(section);
}

// Sections listed in the order an operator would meet them scrolling a page
// from top to bottom, so the wizard reads like the site itself. Some detector
// keys describe a KIND of asset (background, buttons, icons, frame) rather
// than a place, so they can't be pinned to one spot — they sit where they
// most often appear and carry a "rải rác" hint. Unknown keys go after the
// known ones (before external/other).
const SECTION_ORDER: string[] = [
  "favicon",
  "header",
  "layout",
  "float-home",
  "logo",
  "home-banner",
  "banner",
  "background",
  "buttons",
  "home",
  "home-news",
  "news",
  "home-rank",
  "rank",
  "tintuc",
  "float-bxh",
  "frame",
  "icons",
  "footer",
];
const UNKNOWN_ORDER = SECTION_ORDER.length;
const TAIL_ORDER = ["other", "external"];

export function sectionOrder(section: string): number {
  const i = SECTION_ORDER.indexOf(section);
  if (i >= 0) return i;
  const t = TAIL_ORDER.indexOf(section);
  return t >= 0 ? UNKNOWN_ORDER + 1 + t : UNKNOWN_ORDER;
}

// Short "where is this on the page" line shown under each section heading.
const SECTION_POSITIONS: Record<string, string> = {
  favicon: "Icon nhỏ hiện trên tab trình duyệt — không nằm trong trang",
  header: "Trên cùng trang: thanh menu, logo, nút tải game",
  layout: "Khung chung của mọi trang: nền, viền, thành phần lặp lại",
  "float-home": "Nút nổi cố định ở mép màn hình khi xem trang chủ",
  logo: "Logo game / logo nhà phát hành, thường ở đầu trang và chân trang",
  "home-banner": "Khu banner lớn đầu trang chủ (ngay dưới menu)",
  banner: "Khu banner/slider lớn ở đầu trang",
  background: "Rải rác nhiều khu vực của trang",
  buttons: "Rải rác nhiều khu vực của trang",
  home: "Nội dung chính của trang chủ, giữa trang",
  "home-news": "Khối tin tức trên trang chủ, giữa trang",
  news: "Khối tin tức",
  "home-rank": "Khối bảng xếp hạng trên trang chủ",
  rank: "Trang / khối bảng xếp hạng",
  tintuc: "Trang danh sách và chi tiết tin tức",
  "float-bxh": "Nút nổi khi xem trang bảng xếp hạng",
  frame: "Rải rác nhiều khu vực của trang",
  icons: "Rải rác nhiều khu vực của trang",
  footer: "Dưới cùng trang: thông tin công ty, liên kết, logo",
  other: "Chưa phân loại được vào khu vực cụ thể",
  external: "Ảnh / video đang lấy từ máy chủ ngoài (CDN)",
};

export function describeSectionPosition(section: string): string {
  return SECTION_POSITIONS[section] ?? "";
}

function humanize(key: string): string {
  return key
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Small/detail-heavy sections where the section name + thumbnail alone
// aren't enough evidence for a non-technical operator to be confident
// they've matched the right on-page element — these are flagged so the UI
// can attach a stronger visual "where on the page" proof, not just text.
const SMALL_DETAIL_SECTIONS = new Set([
  "icons",
  "buttons",
  "logo",
  "favicon",
  "float-home",
  "float-bxh",
  "frame",
]);

const SMALL_DIMENSION_PX = 200;

export function needsVisualProof(
  section: string,
  dimensions?: { width: number; height: number }
): boolean {
  if (SMALL_DETAIL_SECTIONS.has(section)) return true;
  if (dimensions && (dimensions.width < SMALL_DIMENSION_PX || dimensions.height < SMALL_DIMENSION_PX)) {
    return true;
  }
  return false;
}

type Breakpoint = "mobile" | "tablet" | "desktop";

const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
  mobile: "điện thoại",
  tablet: "máy tính bảng",
  desktop: "máy tính",
};

const BREAKPOINT_ORDER: Breakpoint[] = ["mobile", "tablet", "desktop"];

// "shared" = one file rendered at every screen size (no per-device variant).
// "per-breakpoint" = separate physical files per device — uploading a
// replacement for this slot only overwrites the breakpoints actually
// present here, not the other device sizes. The operator needs this to
// know a single upload won't fix mobile AND desktop if the asset only has
// e.g. a desktop variant.
export function describeResponsive(
  mode: "shared" | "per-breakpoint",
  variants?: Partial<Record<Breakpoint, unknown>>,
  missingBreakpoints?: Breakpoint[]
): string {
  if (mode === "shared") {
    return "Hiển thị: giống nhau trên mọi thiết bị — chỉ cần thay 1 ảnh";
  }
  const present = BREAKPOINT_ORDER.filter((bp) => variants?.[bp]);
  const missing = missingBreakpoints?.length
    ? missingBreakpoints
    : BREAKPOINT_ORDER.filter((bp) => !present.includes(bp));
  const presentLabel = present.length ? present.map((bp) => BREAKPOINT_LABELS[bp]).join(", ") : "?";
  const missingLabel = missing.length
    ? `. Ảnh cho ${missing.map((bp) => BREAKPOINT_LABELS[bp]).join(", ")} không có trong mục này, sẽ giữ nguyên`
    : "";
  return `Mỗi thiết bị dùng ảnh riêng — ảnh bạn tải lên chỉ thay cho: ${presentLabel}${missingLabel}`;
}
