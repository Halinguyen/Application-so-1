# Bối Cảnh Dự Án — Asset Detector

## 1. Bài Toán Kinh Doanh
Công ty có 50 website homepage đã golive, phần lớn là clone của nhau.
Team vận hành (không biết code) cần:
1. Chọn 1 website gốc làm template
2. Thay assets mới (ảnh, video, config API)
3. Preview
4. Deploy lên domain dev mới

**Yêu cầu khắt khe:** Giao diện mới phải giống bản gốc **>95%**.

## 2. Vai Trò Của Asset Detector
Đây là **trái tim của tool**. Detect sai/thiếu asset → website mới vỡ layout → fail >95%.

Phải:
- Đọc Git repo của website gốc
- Detect TẤT CẢ assets: ảnh, video, font, API blocks
- Lưu vào PostgreSQL để operator thao tác
- Cung cấp manifest JSON cho pipeline build/deploy

## 3. Tech Stack Của Website Gốc
CHỈ CÓ 2 LOẠI:
- **Next.js** (App Router hoặc Pages Router)
- **.NET MVC** (Razor views)

## 4. 2 Dynamic Blocks
Mọi website đều có 2 block gọi API:
1. **Button Config API**: `GET /api/config/buttons?gameId={gameId}`
2. **Leaderboard API**: `GET /api/leaderboard?mode={mode}&scope={scope}&limit={limit}`

Operator nhập: `gameId`, `mode`, `scope`, `limit`.
Leaderboard có thể có **3 tabs**: BXH Server (mode=server), BXH Tổng Môn (mode=faction), BXH Top Cụm (mode=cluster).

## 5. Responsive — 3 Breakpoints
- Mobile: 375 × 812
- Tablet: 768 × 1024
- Desktop: 1440 × 900

Mỗi asset: **shared** (1 file) hoặc **per-breakpoint** (3 file).

## 6. Footer — Loại Trừ
Footer mọi website đã có **SDK riêng** → KHÔNG detect.
- Pattern: `footer/`, `Footer/`, `*footer*`, `*Footer*`, `sdk/`, `sdk-footer/`
- Skip ở Layer 1, 2, và mask khi verify
- Flag asset là `footerOnly` → loại khỏi manifest

## 7. Kiến Trúc Detection — 4 Layers
Layer 1: Filesystem Scan → Tìm tất cả file asset trong repo
Layer 2: Reference Scan → Tìm nơi asset được sử dụng trong code
Layer 3: Runtime Scan → Chạy website, bắt network requests
Layer 4: Merge + Dedup → Hợp nhất, tính confidence, lưu DB

## 8. 5 Dạng Section Điển Hình (từ 10 repo)
1. **Hero** — banner lớn, nhiều layer (background, character, logo, buttons)
2. **Content** — video showcase + 3-5 nút mixed (bg image + icon + text)
3. **Swiper single-slide** — Môn Phái: 1 slide full-width, mỗi slide layout riêng
4. **Swiper coverflow** — Showcase: 5 slides composite, 3 visible, mỗi slide 6-7 layers
5. **Leaderboard** — BXH: 3 tabs, dynamic table, rank icons, frame border-image

## 9. Khái Niệm Quan Trọng
- **Asset Slot**: 1 đơn vị asset có thể thay (VD: `asset.hero-bg`)
- **Confidence**: 0.0-1.0 (1.0 = có `data-slot`, 0.7-0.9 = AST detect, 0.5-0.7 = cần review)
- **`data-slot` attribute**: Nếu có → detection chính xác 100%
- **Composite slide**: 1 slide gồm nhiều layer (background + character + title + frame)
- **Reusable asset**: Asset xuất hiện ở nhiều section (VD: sidebar)

## 10. Definition of Done
- ✅ Detect ≥95% assets trong 10 repo
- ✅ Manifest JSON đầy đủ cho mỗi template
- ✅ DB lưu asset slots + references + swiper + leaderboard
- ✅ API cho operator query
- ✅ CLI chạy detection 1 lệnh
- ✅ Tests coverage >85%

## 11. KHÔNG Làm Trong Dự Án Này
- ❌ Build/deploy website
- ❌ Visual verification (phase sau)
- ❌ Operator UI (phase sau)
- ❌ K8s integration (phase sau)

Chỉ tập trung: **DETECTION ENGINE + DB PERSISTENCE**.