# Output detect — 7 game Nhóm C đã chuyển sang Next.js

> `thao-tung-tamquoc` đã bị loại khỏi tool (2026-09-30), nên không còn trong bảng.

Sinh ngày 2026-09-30 từ `asset-detector-web` (`/api/detect?game=<id>`) chạy trên các thư mục `-web`. Dữ liệu máy đọc được: [`07-DETECT-OUTPUT-mvc-to-nextjs.json`](07-DETECT-OUTPUT-mvc-to-nextjs.json). Quy trình chuyển đổi chi tiết: [`06-PLAYBOOK-mvc-to-nextjs.md`](06-PLAYBOOK-mvc-to-nextjs.md).

## 1. Kết quả detect theo game

Cả 7 game: `framework = nextjs` (14.2.35, App Router), `dynamicBlocks = 2` (`axios.get(` được nhận diện), `clone` qua wizard trả 200 (riêng pilot đã xác nhận ở phiên trước).

| gameId | Thư mục `-web` | Cấu trúc | Asset | Ref | Dyn. block | Swiper | avgConf | Cần review | GameId hub |
|---|---|---|---|---|---|---|---|---|---|
| huyen-anh-volam | `t027-huyen-anh-vo-lam-homepage-web` | separate-mobile | 161 | 79 | 2 | 2 | 0.62 | 138 | — |
| giang-ho-ky-ngo | `t030-giang-ho-ky-ngo-website-web` | single-responsive | 249 | 154 | 2 | 0 | 0.73 | 102 | 36 |
| quy-mon-quan | `homepage-va-conhan-web` | single-responsive | 112 | 105 | 2 | 0 | 0.77 | 17 | 1036 |
| samkok-tamquoc | `t028-samkok-tam-qu-c-home-and-landing-web` | single-responsive | 123 | 74 | 2 | 0 | 0.95 | 10 | 34 |
| ta-la-hac-ngokhong | `t031-home-page-web` | single-responsive | 248 | 168 | 2 | 0 | 0.87 | 60 | 1044 |
| thoi-khong-chi-mong | `t022-web-web` | single-responsive | 113 | 83 | 2 | 0 | 0.92 | 0 | 1036 |

- **separate-mobile**: có `Pages/Mobile/*` riêng → tách cây PC/mobile bằng `useResize` (playbook mục 2–3).
- **single-responsive**: một cây markup, đổi bố cục bằng CSS media query (~1024px) → bỏ `useResize`/`ScaleWrapper` (playbook mục 8.1).
- avgConfidence thấp (0.62–0.73) chủ yếu do ảnh trang trí không nối vào component (hover, nền popup, texture). Bình thường; dùng toggle "không dùng asset này".
- Quy-mon-quan và thoi-khong-chi-mong có thêm `RANKING_GAME_ID = 29`; huyen-anh-volam lấy giá trị từ `deploy/develop/.env.example` của bản `-web` (không ghi lại ở đây).
- `ta-la-hac-ngokhong`: `appsettings.json` = 1052, `deploy develop` = 1044 (đã chọn), `deploy production` = 43.

## 2. Phạm vi mỗi game (đã port / bỏ qua)

| gameId | Route đã port | Bỏ qua |
|---|---|---|
| huyen-anh-volam | `/`, `/tin-tuc`, `/tin-tuc/[id]`, `/bang-xep-hang` (PC + mobile) | `Jobs/` |
| giang-ho-ky-ngo | `/`, `/News`, `/News/[[...slug]]`, `/NewsDetail/[...params]`, `/Landing` | Privacy, Error |
| quy-mon-quan | `/`, `/tin-tuc`, `/tin-tuc/[slug]` | Conhan, `/landing` (gift-code), `Jobs/` |
| samkok-tamquoc | `/`, `/landing`, `/news?cid=`, `/newsdetail?id=`, `/ranking` | — |
| ta-la-hac-ngokhong | `/`, `/danh-muc/[[...tab]]`, `/tin-tuc/[slug]`, `/landing` | — |
| thoi-khong-chi-mong | `/`, `/tin-tuc`, `/tin-tuc/[slug]` | Conhan, `/landing` (đăng nhập/check-in/gift-code) |

## 3. Checklist nhận diện cho game .NET mới (làm trước khi code)

Chạy trong thư mục repo .NET gốc (Git Bash). Mỗi bước quyết định một nhánh của playbook.

1. **Framework**: có `*.csproj` + `Pages/*.cshtml` (Razor Pages) hoặc `Views/` + `Controllers/` (MVC) → thuộc Nhóm C.
2. **Bản mobile riêng?**
   - `ls Pages/Mobile Views/Mobile 2>/dev/null` và `grep -rl "Wangkanai\|IDetectionService\|_LayoutMobile" --include=*.cs --include=*.cshtml .`
   - Có → **separate-mobile** (playbook mục 2–3). Không → bước 3.
3. **Một cây responsive?** `grep -rn "showOnPc\|showOnMobile\|@media (max-width" wwwroot --include=*.css | head`
   - Có → **single-responsive**, bỏ device split (mục 8.1).
4. **Có build Vite trong `wwwroot`?** `ls wwwroot/*/assets/*.js 2>/dev/null` → copy assets vào `public/` đúng đường dẫn cũ; viết lại JS bằng React (mục 8.1).
5. **Trang ngoài phạm vi**: tìm `Conhan`, `Jobs/`, trang gift-code/đăng nhập/check-in (`/landing`), bundle không có source → không port, sửa link trỏ tới chúng (mục 0 và 8.1).
6. **API nguồn**: đọc `appsettings.json` (`HubUrl`, `ServiceUrl`, `GameId`) **và** `deploy/*/deploy.yaml` (GameId có thể khác — hỏi user chọn). Nếu gọi qua SDK (`sdk.js`) thì đọc SDK để lấy URL.
7. **CSS xung đột giữa trang chính và `/landing`** (class trùng) → route group + root layout riêng.
8. **URL**: giữ đúng route/casing của bản gốc; nếu Razor phân biệt không hoa/thường thì thêm middleware chuyển về chữ thường.

## 4. Ghi vào `asset-detector-web` sau khi chuyển xong

1. Sửa `GAME_REPO_MAP[<gameId>]` trong `src/detector/config.ts` trỏ sang thư mục `-web` (giữ repo .NET gốc để đối chiếu/rollback).
   Thêm tên hiển thị vào `GAME_DISPLAY_NAMES` cùng file, định dạng `"[<MÃ>] <Tên game có dấu>"` (ví dụ `"[T030] Giang Hồ Kỳ Ngộ"`; mã lấy từ `VITE_APP_GAME_NAME`/tên thư mục/`package.json`). Thiếu mục này tool tự rơi về tên gameId viết hoa không dấu.
   Thêm avatar: copy icon app (ảnh vuông ≥128px, thường `icon-app*.png`, `icongames.png`, `apple-touch-icon.png` hoặc `Home/assets/icon.png`) vào `asset-detector-web/public/game-icons/<gameId>.png` (128×128, đổi webp sang png). Thiếu file thì tool hiện chữ cái viết tắt; `tamquoc-daiminhtinh` hiện chưa có icon riêng. Xem ảnh trước khi chọn: một số `icon-app` chỉ là ảnh tối/placeholder.
2. Chạy wizard (hoặc `GET /api/detect?game=<id>` rồi `POST /api/clone` với form `gameId=<id>`); kỳ vọng:
   - `detect`: `framework: nextjs`, `totalDynamicBlocks ≥ 1`.
   - `clone`: 200, `envWritten` bằng số biến trong `deploy/develop/.env.example`, có `src/services/index.ts`.
3. Thêm game vào bảng ở mục 1 (và file JSON cùng tên) rồi cập nhật memory.

## 5. Điều kiện để detect nhận diện tốt (tóm tắt playbook mục 4)

- `axios.get(` viết đúng chữ thường, base URL nằm trong template literal (`${process.env.NEXT_PUBLIC_HUB}/…`); không dùng `axios.create`.
- Đường dẫn ảnh dạng template literal cần hậu tố literal không rỗng sau phần nội suy.
- `next.config.mjs` (không phải `.ts`) với Next 14.2.x.
- Env: `NEXT_PUBLIC_HUB`, `NEXT_PUBLIC_HUB_GAME_ID`, `NEXT_PUBLIC_RANKING_API`, `NEXT_PUBLIC_RANKING_GAME_ID` (nếu có ranking) trong `deploy/develop/.env.example`.
